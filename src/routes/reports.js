import { Router } from 'express';
import mongoose from 'mongoose';
import { verifyToken } from '../middleware/auth.js';
import Report from '../models/Report.js';
import GameList from '../models/GameList.js';
import Comment from '../models/Comment.js';
import User from '../models/User.js';

const router = Router();

const TARGET_CONFIG = {
  list: { model: GameList, targetType: 'GameList' },
  comment: { model: Comment, targetType: 'Comment' },
  user: { model: User, targetType: 'User' },
};

const ALLOWED_REASONS = ['Spam', 'Contenido Ofensivo', 'Informacion Falsa', 'Información Falsa', 'Otros'];

router.post('/', verifyToken, async (req, res) => {
  try {
    const { targetId, targetType, reason, description } = req.body;

    if (!targetId || !targetType || !reason) {
      return res.status(400).json({
        error: 'Campos requeridos: targetId, targetType, reason',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ error: 'targetId invalido' });
    }

    const normalizedTargetType = String(targetType).toLowerCase();
    const targetConfig = TARGET_CONFIG[normalizedTargetType];
    if (!targetConfig) {
      return res.status(400).json({ error: 'targetType invalido' });
    }

    if (!ALLOWED_REASONS.includes(reason)) {
      return res.status(400).json({ error: 'reason invalido' });
    }

    const targetExists = await targetConfig.model.exists({ _id: targetId });
    if (!targetExists) {
      return res.status(404).json({ error: 'Objetivo no encontrado' });
    }

    const isSelfReport =
      normalizedTargetType === 'user' && targetId.toString() === req.user._id.toString();
    if (isSelfReport) {
      return res.status(400).json({ error: 'No puedes reportar tu propio perfil' });
    }

    const existingReport = await Report.findOne({
      targetId,
      targetType: targetConfig.targetType,
      $or: [{ reporterId: req.user._id }, { reportedBy: req.user._id }],
    }).lean();

    if (existingReport) {
      return res.status(409).json({
        error: 'Ya reportaste este contenido',
      });
    }

    const report = await Report.create({
      type: normalizedTargetType,
      targetId,
      targetType: targetConfig.targetType,
      reporterId: req.user._id,
      reportedBy: req.user._id,
      reason,
      description: description?.trim() || '',
      status: 'pending',
    });

    return res.status(201).json({ success: true, report });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Ya reportaste este contenido' });
    }

    console.error('Error creando reporte:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
