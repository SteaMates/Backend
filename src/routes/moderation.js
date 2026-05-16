/**
 * Nombre del fichero: moderation.js
 * Descripción: Fichero fuente de la aplicación SteaMates.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import Report from "../models/Report.js";
import ModerationAction from "../models/ModerationAction.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import GameList from "../models/GameList.js";
import Comment from "../models/Comment.js";
import Notification from "../models/Notification.js";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import {
  validateModerationAction,
  validateModerationReportResolution,
  isObjectId,
} from "../validation/validators.js";

const router = express.Router();

// Prioridad al calcular el estado final cuando hay varias sanciones activas.
const MODERATION_STATUS_PRIORITY = ["banned", "silenced", "warned"];

// Convierte el tipo de acción de moderación al estado que se refleja en el usuario.
/**
 * Función: mapActionToUserStatus
 * Descripción: Función auxiliar de propósito general especializada en map action to user
 * status. Contiene lógica específica para transformar datos, realizar cálculos
 * o conectar diferentes partes del sistema según los requisitos del módulo.
 */
function mapActionToUserStatus(action) {
  if (action === "banned") return "banned";
  if (action === "silenced") return "silenced";
  if (action === "warned") return "warned";
  return "active";
}

// Recalcula el estado real del usuario en base a sanciones activas y no expiradas.
/**
 * Función: recalculateUserStatus
 * Descripción: Función auxiliar de propósito general especializada en recalculate user
 * status. Contiene lógica específica para transformar datos, realizar cálculos
 * o conectar diferentes partes del sistema según los requisitos del módulo.
 */
async function recalculateUserStatus(userId) {
  const now = new Date();

  // Cierra sanciones activas que ya expiraron para este usuario.
  await ModerationAction.updateMany(
    {
      userId,
      isActive: true,
      expiresAt: { $ne: null, $lte: now },
    },
    {
      $set: {
        isActive: false,
        revokedAt: now,
        revokeReason: "expired",
      },
      $unset: { revokedBy: "" },
    },
  );

  const activeActions = await ModerationAction.find({
    userId,
    isActive: true,
    action: { $in: ["warned", "silenced", "banned"] },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .sort({ createdAt: -1 })
    .select("action createdAt");

  let nextStatus = "active";
  // Se aplica la sanción de mayor severidad disponible.
  for (const status of MODERATION_STATUS_PRIORITY) {
    if (activeActions.some((item) => item.action === status)) {
      nextStatus = status;
      break;
    }
  }

  const user = await User.findById(userId);
  if (user && user.status !== nextStatus) {
    user.status = nextStatus;
    await user.save();
  }

  return nextStatus;
}

// Expira sanciones temporales vencidas y sincroniza estados de los usuarios afectados.
/**
 * Función: expireAllModerationActions
 * Descripción: Función auxiliar de propósito general especializada en expire all moderation
 * actions. Contiene lógica específica para transformar datos, realizar cálculos
 * o conectar diferentes partes del sistema según los requisitos del módulo.
 */
async function expireAllModerationActions() {
  const now = new Date();
  const expiredActions = await ModerationAction.find({
    isActive: true,
    expiresAt: { $ne: null, $lte: now },
  }).select("userId");

  if (expiredActions.length === 0) return;

  const userIds = [
    ...new Set(expiredActions.map((action) => action.userId.toString())),
  ];

  await ModerationAction.updateMany(
    {
      isActive: true,
      expiresAt: { $ne: null, $lte: now },
    },
    {
      $set: {
        isActive: false,
        revokedAt: now,
        revokeReason: "expired",
      },
      $unset: { revokedBy: "" },
    },
  );

  for (const userId of userIds) {
    await recalculateUserStatus(userId);
  }
}

// ========== REPORTS ==========

// POST /api/moderation/reports - Crear un reporte
router.post("/reports", verifyToken, async (req, res) => {
  try {
    const { type, targetId, targetType, reason, description } = req.body;

    if (!type || !targetId || !targetType || !reason) {
      return res.status(400).json({
        error: "Campos requeridos: type, targetId, targetType, reason",
      });
    }

    const existing = await Report.findOne({
      targetId,
      targetType,
      $or: [{ reporterId: req.user._id }, { reportedBy: req.user._id }],
    }).lean();

    if (existing) {
      return res.status(409).json({ error: "Ya reportaste este contenido" });
    }

    const report = new Report({
      type,
      targetId,
      targetType,
      reporterId: req.user._id,
      reportedBy: req.user._id,
      reason,
      description,
      status: "pending",
    });

    await report.save();
    res.status(201).json({ success: true, report });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "Ya reportaste este contenido" });
    }
    console.error("Error creando reporte:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/moderation/reports - Listar reportes (admin only)
router.get("/reports", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status, type, page = 1, limit = 12, search } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { reason: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 20, 1);
    const skip = (pageNumber - 1) * pageSize;
    const reports = await Report.find(filter)
      .populate("reportedBy", "username avatar")
      .populate("resolvedBy", "username")
      .populate("targetId")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize);

    const total = await Report.countDocuments(filter);

    res.json({
      reports,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error listando reportes:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/moderation/stats - Resumen global del panel de moderación (admin only)
router.get("/stats", verifyToken, requireAdmin, async (req, res) => {
  try {
    const [
      pendingReports,
      resolvedReports,
      dismissedReports,
      activeUsers,
      warnedUsers,
      silencedUsers,
      bannedUsers,
      deletedContent,
    ] = await Promise.all([
      Report.countDocuments({ status: "pending" }).catch(() => 0),
      Report.countDocuments({ status: "resolved" }).catch(() => 0),
      Report.countDocuments({ status: "dismissed" }).catch(() => 0),
      User.countDocuments({ status: "active" }).catch(() => 0),
      User.countDocuments({ status: "warned" }).catch(() => 0),
      User.countDocuments({ status: "silenced" }).catch(() => 0),
      User.countDocuments({ status: "banned" }).catch(() => 0),
      AuditLog.countDocuments({ action: "delete_content" }).catch(() => 0),
    ]);

    res.json({
      pending: pendingReports,
      resolved: resolvedReports,
      dismissed: dismissedReports,
      deleted: deletedContent,
      warned: warnedUsers,
      active: activeUsers,
      silenced: silencedUsers,
      banned: bannedUsers,
    });
  } catch (error) {
    console.error("Error obteniendo estadísticas de moderación:", error);
    // Return zeros instead of error to prevent admin UI crash
    res.json({
      pending: 0,
      resolved: 0,
      dismissed: 0,
      deleted: 0,
      warned: 0,
      active: 0,
      silenced: 0,
      banned: 0,
    });
  }
});

// DELETE /api/moderation/content/:type/:id - Eliminar contenido reportado (admin only)
router.delete(
  "/content/:type/:id",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { type, id } = req.params;
      const { reason } = req.body;

      const deleteReason = reason || "Contenido eliminado por un administrador por incumplimiento de las normas.";

      if (!isObjectId(id)) {
        return res.status(400).json({ error: "Invalid content id" });
      }

      if (type === "list") {
        const list = await GameList.findById(id);
        if (!list)
          return res.status(404).json({ error: "Lista no encontrada" });
        
        const authorId = list.author;
        const listTitle = list.title;

        await GameList.findByIdAndDelete(id);

        // Borrar comentarios asociados
        await Comment.deleteMany({ list: id });

        // Enviar notificación al autor
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        
        await Notification.create({
          recipient: authorId,
          from: req.user._id,
          type: "content_deleted",
          title: "Tu lista ha sido eliminada",
          message: `Tu lista "${listTitle}" ha sido eliminada por un administrador. Motivo: ${deleteReason}`,
          expiresAt,
          data: { type: "list", title: listTitle, reason: deleteReason }
        });

        // Auditoría
        await AuditLog.create({
          adminId: req.user._id,
          action: "delete_content",
          targetId: id,
          targetType: "GameList",
          changes: { title: listTitle, reason: deleteReason },
        });

        // Auto-resolver reportes de la lista
        await Report.updateMany(
          { targetId: id, targetType: "GameList", status: "pending" },
          {
            $set: {
              status: "resolved",
              resolution: `Contenido eliminado: ${deleteReason}`,
              resolvedBy: req.user._id,
              resolvedAt: new Date(),
            },
          },
        );
      } else if (type === "comment") {
        const comment = await Comment.findById(id);
        if (!comment)
          return res.status(404).json({ error: "Comentario no encontrado" });
        
        const authorId = comment.author;
        const contentPreview = comment.content.substring(0, 50) + (comment.content.length > 50 ? "..." : "");

        await Comment.findByIdAndDelete(id);

        // Enviar notificación al autor
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        await Notification.create({
          recipient: authorId,
          from: req.user._id,
          type: "content_deleted",
          title: "Tu comentario ha sido eliminado",
          message: `Tu comentario ("${contentPreview}") ha sido eliminado por un administrador. Motivo: ${deleteReason}`,
          expiresAt,
          data: { type: "comment", content: contentPreview, reason: deleteReason }
        });

        // Auditoría
        await AuditLog.create({
          adminId: req.user._id,
          action: "delete_content",
          targetId: id,
          targetType: "Comment",
          changes: { content: comment.content, reason: deleteReason },
        });

        // Auto-resolver reportes del comentario
        await Report.updateMany(
          { targetId: id, targetType: "Comment", status: "pending" },
          {
            $set: {
              status: "resolved",
              resolution: `Contenido eliminado: ${deleteReason}`,
              resolvedBy: req.user._id,
              resolvedAt: new Date(),
            },
          },
        );
      } else {
        return res.status(400).json({ error: "Tipo de contenido inválido" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error eliminando contenido:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

// PUT /api/moderation/reports/:id - Resolver reporte (admin only)
router.put("/reports/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid report id" });
    }

    const { ok, errors, value } = validateModerationReportResolution(req.body);
    if (!ok) {
      return res
        .status(400)
        .json({ error: errors[0].message, details: errors });
    }

    const { status, resolution } = value;

    const report = await Report.findById(req.params.id);
    if (!report)
      return res.status(404).json({ error: "Reporte no encontrado" });

    // Actualiza este reporte y todos los reportes pendientes para el mismo contenido
    await Report.updateMany(
      {
        targetId: report.targetId,
        targetType: report.targetType,
        status: "pending",
      },
      {
        $set: {
          status,
          resolution,
          resolvedBy: req.user._id,
          resolvedAt: status !== "pending" ? new Date() : null,
        },
      },
    );

    const updatedReport = await Report.findById(req.params.id)
      .populate("reportedBy", "username")
      .populate("resolvedBy", "username");

    // Registrar en auditoría
    await AuditLog.create({
      adminId: req.user._id,
      action: "resolve_report",
      targetId: report._id,
      targetType: "Report",
      changes: { status, resolution, appliedToMultiple: true },
    });

    res.json({ success: true, report: updatedReport });
  } catch (error) {
    console.error("Error resolviendo reporte:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/moderation/export?type=users|reports|actions&format=csv|xlsx - Export data (admin only)
router.get("/export", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { type = "users", format = "csv" } = req.query;

    let headers = [];
    let rows = [];

    if (type === "users") {
      const users = await User.find().lean();
      headers = [
        "steamId",
        "username",
        "realName",
        "role",
        "status",
        "createdAt",
        "lastLogin",
        "wishlistCount",
        "priceAlertsCount",
      ];
      rows = users.map((u) => [
        u.steamId,
        u.username,
        u.realName || "",
        u.role || "",
        u.status || "",
        u.createdAt ? new Date(u.createdAt).toISOString() : "",
        u.lastLogin ? new Date(u.lastLogin).toISOString() : "",
        Array.isArray(u.wishlist) ? u.wishlist.length : 0,
        Array.isArray(u.priceAlerts) ? u.priceAlerts.length : 0,
      ]);
    } else if (type === "reports") {
      const reports = await Report.find()
        .populate("reportedBy", "username")
        .populate("resolvedBy", "username")
        .lean();
      headers = [
        "id",
        "type",
        "targetType",
        "targetId",
        "reporter",
        "reportedBy",
        "reason",
        "description",
        "status",
        "createdAt",
        "resolvedAt",
        "resolvedBy",
      ];
      rows = reports.map((r) => [
        r._id?.toString(),
        r.type || "",
        r.targetType || "",
        r.targetId
          ? typeof r.targetId === "object"
            ? (r.targetId._id || "").toString()
            : String(r.targetId)
          : "",
        r.reporterId ? String(r.reporterId) : "",
        r.reportedBy?.username || "",
        r.reason || "",
        (r.description || "").replace(/\r?\n/g, " "),
        r.status || "",
        r.createdAt ? new Date(r.createdAt).toISOString() : "",
        r.resolvedAt ? new Date(r.resolvedAt).toISOString() : "",
        r.resolvedBy?.username || "",
      ]);
    } else if (type === "actions") {
      const actions = await ModerationAction.find()
        .populate("userId", "steamId username")
        .populate("revokedBy", "username")
        .lean();
      headers = [
        "id",
        "userSteamId",
        "username",
        "action",
        "reason",
        "isActive",
        "createdAt",
        "expiresAt",
        "revokedAt",
        "revokedBy",
      ];
      rows = actions.map((a) => [
        a._id?.toString(),
        a.userId?.steamId || "",
        a.userId?.username || "",
        a.action || "",
        (a.reason || "").replace(/\r?\n/g, " "),
        a.isActive ? "true" : "false",
        a.createdAt ? new Date(a.createdAt).toISOString() : "",
        a.expiresAt ? new Date(a.expiresAt).toISOString() : "",
        a.revokedAt ? new Date(a.revokedAt).toISOString() : "",
        a.revokedBy?.username || "",
      ]);
    } else {
      return res.status(400).json({ error: "Tipo de exportación inválido" });
    }

    const filenameBase = `${type}-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;

    if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Export");
      sheet.addRow(headers);
      rows.forEach((r) => sheet.addRow(r));
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filenameBase}.xlsx"`,
      );
      await workbook.xlsx.write(res);
      res.end();
      return;
    }

    // Default: CSV
    /**
     * Función: escapeCsv
     * Descripción: Función auxiliar de propósito general especializada en escape csv.
     * Contiene lógica específica para transformar datos, realizar cálculos o
     * conectar diferentes partes del sistema según los requisitos del módulo.
     */
    const escapeCsv = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (s.includes(",") || s.includes("\n") || s.includes('"')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const csvLines = [headers.map(escapeCsv).join(",")].concat(
      rows.map((r) => r.map(escapeCsv).join(",")),
    );
    const csv = csvLines.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filenameBase}.csv"`,
    );
    res.send(csv);
  } catch (error) {
    console.error("Error exporting data:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========== MODERATION ACTIONS ==========

// POST /api/moderation/actions - Aplicar sanción a usuario (admin only)
router.post("/actions", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { ok, errors, value } = validateModerationAction(req.body);
    if (!ok) {
      return res
        .status(400)
        .json({ error: errors[0].message, details: errors });
    }

    const { userId, action, reason, duration } = value;
    const hasDuration = duration !== undefined && duration !== null;
    const parsedDuration = hasDuration ? Number(duration) : null;

    // Sincroniza estado antes de decidir si esta petición aplica o revierte.
    await recalculateUserStatus(userId);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const now = new Date();
    const hasActiveSameAction = await ModerationAction.exists({
      userId,
      action,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    });

    // Toggle: si la sanción ya está activa, el mismo botón la revierte.
    if (mapActionToUserStatus(action) !== "active" && hasActiveSameAction) {
      const toggleOffReason = reason?.trim() || `manual_unset_${action}`;
      await ModerationAction.updateMany(
        {
          userId,
          action,
          isActive: true,
        },
        {
          $set: {
            isActive: false,
            revokedAt: new Date(),
            revokedBy: req.user._id,
            revokeReason: toggleOffReason,
          },
        },
      );

      // Recalcula por si había otras sanciones activas (ej: warned + silenced).
      const newStatus = await recalculateUserStatus(userId);

      await AuditLog.create({
        adminId: req.user._id,
        action: "remove_moderation",
        targetId: userId,
        targetType: "User",
        changes: { action, reason: toggleOffReason, userStatus: newStatus },
      });

      return res.status(200).json({
        success: true,
        toggledOff: true,
        userStatus: newStatus,
      });
    }

    if (!reason || !reason.trim()) {
      return res
        .status(400)
        .json({ error: "El motivo es obligatorio para aplicar la sanción" });
    }

    // Calcular expiración si tiene duración
    let expiresAt = null;
    if (parsedDuration && parsedDuration > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parsedDuration);
    }

    // Solo se reemplaza la misma acción activa, manteniendo otras sanciones compatibles.
    await ModerationAction.updateMany(
      { userId, action, isActive: true },
      {
        $set: {
          isActive: false,
          revokedAt: new Date(),
          revokedBy: req.user._id,
          revokeReason: "replaced_by_new_action",
        },
      },
    );

    // Crear acción de moderación
    const modAction = new ModerationAction({
      userId,
      action,
      reason,
      duration: parsedDuration,
      appliedBy: req.user._id,
      expiresAt,
      isActive: true,
    });

    await modAction.save();

    // Guarda histórico y recalcula estado final por prioridad.
    user.moderationHistory.push(modAction._id);
    await user.save();
    const newStatus = await recalculateUserStatus(userId);

    await AuditLog.create({
      adminId: req.user._id,
      action: "apply_moderation",
      targetId: userId,
      targetType: "User",
      changes: { action, reason, duration, userStatus: newStatus },
    });

    res.status(201).json({ success: true, modAction, userStatus: newStatus });
  } catch (error) {
    console.error("Error aplicando sanción:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/moderation/user/:userId - Historial de moderación
router.get("/user/:userId", verifyToken, requireAdmin, async (req, res) => {
  try {
    if (!isObjectId(req.params.userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    // El historial se devuelve con el estado ya sincronizado tras posibles expiraciones.
    await recalculateUserStatus(req.params.userId);

    const actions = await ModerationAction.find({ userId: req.params.userId })
      .populate("appliedBy", "username")
      .populate("revokedBy", "username")
      .sort({ createdAt: -1 });

    res.json({ actions });
  } catch (error) {
    console.error("Error obteniendo historial:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/moderation/user/:userId/export?format=csv|xlsx - Exportar historial de moderación de un usuario
router.get(
  "/user/:userId/export",
  verifyToken,
  requireAdmin,
  async (req, res) => {
    try {
      if (!isObjectId(req.params.userId)) {
        return res.status(400).json({ error: "Invalid user id" });
      }

      await recalculateUserStatus(req.params.userId);

      const user = await User.findById(req.params.userId)
        .select("username steamId")
        .lean();

      if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      const actions = await ModerationAction.find({ userId: req.params.userId })
        .populate("appliedBy", "username")
        .populate("revokedBy", "username")
        .sort({ createdAt: -1 })
        .lean();

      const format = req.query.format === "xlsx" ? "xlsx" : "csv";
      const filenameBase = `historial-${user.username || user.steamId || req.params.userId}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
      const headers = [
        "id",
        "username",
        "steamId",
        "action",
        "reason",
        "isActive",
        "createdAt",
        "expiresAt",
        "revokedAt",
        "revokedBy",
        "appliedBy",
        "duration",
        "revokeReason",
      ];

      const rows = actions.map((action) => [
        action._id?.toString(),
        user.username || "",
        user.steamId || "",
        action.action || "",
        (action.reason || "").replace(/\r?\n/g, " "),
        action.isActive ? "true" : "false",
        action.createdAt ? new Date(action.createdAt).toISOString() : "",
        action.expiresAt ? new Date(action.expiresAt).toISOString() : "",
        action.revokedAt ? new Date(action.revokedAt).toISOString() : "",
        action.revokedBy?.username || "",
        action.appliedBy?.username || "",
        action.duration ?? "",
        action.revokeReason || "",
      ]);

      if (format === "xlsx") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Historial");
        sheet.addRow(headers);
        rows.forEach((row) => sheet.addRow(row));
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filenameBase}.xlsx"`,
        );
        await workbook.xlsx.write(res);
        res.end();
        return;
      }

      /**
       * Función: escapeCsv
       * Descripción: Función auxiliar de propósito general especializada en escape csv.
       * Contiene lógica específica para transformar datos, realizar cálculos
       * o conectar diferentes partes del sistema según los requisitos del
       * módulo.
       */
      const escapeCsv = (value) => {
        if (value === null || value === undefined) return "";
        const text = String(value);
        if (text.includes(",") || text.includes("\n") || text.includes('"')) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };

      const csvLines = [headers.map(escapeCsv).join(",")].concat(
        rows.map((row) => row.map(escapeCsv).join(",")),
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filenameBase}.csv"`,
      );
      res.send(csvLines.join("\n"));
    } catch (error) {
      console.error("Error exportando historial de usuario:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

// ========== AUDIT LOG ==========

// GET /api/moderation/audit-log - Registro de auditoría (admin only)
router.get("/audit-log", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, adminId } = req.query;
    const filter = {};

    if (adminId) filter.adminId = adminId;

    const skip = (page - 1) * limit;
    const logs = await AuditLog.find(filter)
      .populate("adminId", "username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await AuditLog.countDocuments(filter);

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error obteniendo audit log:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========== USERS ==========

// GET /api/moderation/users - Listar usuarios con estado de moderación (admin only)
router.get("/users", verifyToken, requireAdmin, async (req, res) => {
  try {
    // Antes de listar, se procesan vencimientos para que el panel vea datos reales.
    await expireAllModerationActions();

    const { status, page = 1, limit = 12, search } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { steamId: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const users = await User.find(filter)
      .select(
        "username steamId avatar status moderationHistory createdAt lastLogin",
      )
      .populate("moderationHistory")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error listando usuarios:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
