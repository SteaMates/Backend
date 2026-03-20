import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import Report from '../models/Report.js';
import ModerationAction from '../models/ModerationAction.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';

const router = Router();

// ========== REPORTS ==========

// POST /api/moderation/reports - Crear un reporte
router.post('/reports', verifyToken, async (req, res) => {
  try {
    const { type, targetId, targetType, reason, description } = req.body;

    if (!type || !targetId || !targetType || !reason) {
      return res.status(400).json({ error: 'Campos requeridos: type, targetId, targetType, reason' });
    }

    const report = new Report({
      type,
      targetId,
      targetType,
      reportedBy: req.user._id,
      reason,
      description,
      status: 'pending',
    });

    await report.save();
    res.status(201).json({ success: true, report });
  } catch (error) {
    console.error('Error creando reporte:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/moderation/reports - Listar reportes (admin only)
router.get('/reports', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (type) filter.type = type;

    const skip = (page - 1) * limit;
    const reports = await Report.find(filter)
      .populate('reportedBy', 'username avatar')
      .populate('resolvedBy', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Report.countDocuments(filter);

    res.json({
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listando reportes:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/moderation/reports/:id - Resolver reporte (admin only)
router.put('/reports/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status, resolution } = req.body;

    if (!['pending', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      {
        status,
        resolution,
        resolvedBy: req.user._id,
        resolvedAt: status !== 'pending' ? new Date() : null,
      },
      { new: true }
    ).populate('reportedBy', 'username').populate('resolvedBy', 'username');

    // Registrar en auditoría
    await AuditLog.create({
      adminId: req.user._id,
      action: 'resolve_report',
      targetId: report._id,
      targetType: 'Report',
      changes: { status, resolution },
    });

    res.json({ success: true, report });
  } catch (error) {
    console.error('Error resolviendo reporte:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== MODERATION ACTIONS ==========

// POST /api/moderation/actions - Aplicar sanción a usuario (admin only)
router.post('/actions', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { userId, action, reason, duration } = req.body;

    if (!['warned', 'silenced', 'banned', 'suspended'].includes(action)) {
      return res.status(400).json({ error: 'Acción de moderación inválida' });
    }

    // Calcular expiración si tiene duración
    let expiresAt = null;
    if (duration && duration > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + duration);
    }

    // Crear acción de moderación
    const modAction = new ModerationAction({
      userId,
      action,
      reason,
      duration,
      appliedBy: req.user._id,
      expiresAt,
    });

    await modAction.save();

    // Actualizar estado del usuario
    const user = await User.findById(userId);
    if (user) {
      user.status = action === 'warned' ? 'warned' : action === 'silenced' ? 'silenced' : action === 'banned' ? 'banned' : 'active';
      user.moderationHistory.push(modAction._id);
      await user.save();
    }

    // Registrar en auditoría
    await AuditLog.create({
      adminId: req.user._id,
      action: 'apply_moderation',
      targetId: userId,
      targetType: 'User',
      changes: { action, reason, duration },
    });

    res.status(201).json({ success: true, modAction });
  } catch (error) {
    console.error('Error aplicando sanción:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/moderation/user/:userId - Historial de moderación
router.get('/user/:userId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const actions = await ModerationAction.find({ userId: req.params.userId })
      .populate('appliedBy', 'username')
      .sort({ createdAt: -1 });

    res.json({ actions });
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== AUDIT LOG ==========

// GET /api/moderation/audit-log - Registro de auditoría (admin only)
router.get('/audit-log', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, adminId } = req.query;
    const filter = {};

    if (adminId) filter.adminId = adminId;

    const skip = (page - 1) * limit;
    const logs = await AuditLog.find(filter)
      .populate('adminId', 'username')
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
    console.error('Error obteniendo audit log:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== USERS ==========

// GET /api/moderation/users - Listar usuarios con estado de moderación (admin only)
router.get('/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { steamId: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const users = await User.find(filter)
      .select('username steamId avatar status moderationHistory createdAt lastLogin')
      .populate('moderationHistory')
      .sort({ createdAt: -1 })
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
    console.error('Error listando usuarios:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
