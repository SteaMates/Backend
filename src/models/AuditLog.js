import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  // Admin que realizó la acción
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // Descripción de la acción realizada (ej: 'delete_report', 'ban_user', 'resolve_report')
  action: {
    type: String,
    required: true,
  },
  // ID del objeto afectado (usuario, reporte, lista, etc)
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  // Tipo del objeto afectado
  targetType: {
    type: String,
    default: '',
  },
  // Cambios realizados (antes/después o detalles)
  changes: {
    type: Object,
    default: {},
  },
  // Timestamp de la acción
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

export default mongoose.model('AuditLog', auditLogSchema);
