import mongoose from 'mongoose';

const moderationActionSchema = new mongoose.Schema({
  // Usuario afectado por la acción de moderación
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // Tipo de acción: advertencia, silencio, ban permanente o suspensión temporal
  action: {
    type: String,
    enum: ['warned', 'silenced', 'banned', 'suspended'],
    required: true,
  },
  // Motivo de la acción de moderación
  reason: {
    type: String,
    required: true,
  },
  // Duración en días (null si es permanente)
  duration: {
    type: Number,
    default: null,
  },
  // Admin que aplicó la acción
  appliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Fecha de aplicación de la acción
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Fecha de expiración (null si es permanente)
  expiresAt: {
    type: Date,
    default: null,
  },
});

export default mongoose.model('ModerationAction', moderationActionSchema);
