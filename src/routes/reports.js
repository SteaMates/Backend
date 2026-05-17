/**
 * Nombre del fichero: reports.js
 * Descripción: Fichero fuente de la aplicación SteaMates.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import express from "express";
import { verifyToken } from "../middleware/auth.js";
import Report from "../models/Report.js";
import logger from "../config/logger.js";
import GameList from "../models/GameList.js";
import Comment from "../models/Comment.js";
import User from "../models/User.js";
import { validateReportCreate } from "../validation/validators.js";

const router = express.Router();

const TARGET_CONFIG = {
  list: { model: GameList, targetType: "GameList" },
  comment: { model: Comment, targetType: "Comment" },
  user: { model: User, targetType: "User" },
};

router.post("/", verifyToken, async (req, res) => {
  try {
    const { ok, errors, value } = validateReportCreate(req.body);
    if (!ok) {
      return res
        .status(400)
        .json({ error: errors[0].message, details: errors });
    }

    const { targetId, targetType, reason, description } = value;
    const normalizedTargetType = String(targetType).toLowerCase();
    const targetConfig = TARGET_CONFIG[normalizedTargetType];
    if (!targetConfig) {
      return res.status(400).json({ error: "targetType invalido" });
    }

    const targetExists = await targetConfig.model.exists({ _id: targetId });
    if (!targetExists) {
      return res.status(404).json({ error: "Objetivo no encontrado" });
    }

    const isSelfReport =
      normalizedTargetType === "user" &&
      targetId.toString() === req.user._id.toString();
    if (isSelfReport) {
      return res
        .status(400)
        .json({ error: "No puedes reportar tu propio perfil" });
    }

    const existingReport = await Report.findOne({
      targetId,
      targetType: targetConfig.targetType,
      $or: [{ reporterId: req.user._id }, { reportedBy: req.user._id }],
    }).lean();

    if (existingReport) {
      return res.status(409).json({
        error: "Ya reportaste este contenido",
      });
    }

    const report = await Report.create({
      type: normalizedTargetType,
      targetId,
      targetType: targetConfig.targetType,
      reporterId: req.user._id,
      reportedBy: req.user._id,
      reason,
      description: description?.trim() || "",
      status: "pending",
    });

    return res.status(201).json({ success: true, report });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "Ya reportaste este contenido" });
    }

    logger.error("Error creando reporte:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
