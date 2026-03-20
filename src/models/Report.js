import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  // Tipo de contenido reportado: lista, comentario o usuario
  type: {
    type: String,
    enum: ['list', 'comment', 'user'],
    required: true,
  },
  // ID del contenido/usuario reportado (referencia dinámica según targetType)
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'targetType',
  },
  // Tipo del documento referenciado (GameList, Comment o User)
  targetType: {
    type: String,
    enum: ['GameList', 'Comment', 'User'],
    required: true,
  },
  // Usuario que realiza el reporte
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Categoría del reporte (spam, ofensivo, inapropiado, etc)
  reason: {
    type: String,
    required: true,
  },
  // Descripción detallada del reporte
  description: {
    type: String,
    default: '',
  },
  // Estado del reporte: pendiente, resuelto o descartado
  status: {
    type: String,
    enum: ['pending', 'resolved', 'dismissed'],
    default: 'pending',
  },
  // Explicación de cómo se resolvió el reporte
  resolution: {
    type: String,
    default: '',
  },
  // Admin que resolvió el reporte
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  // Fecha de creación del reporte
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Fecha de resolución del reporte
  resolvedAt: {
    type: Date,
    default: null,
  },
});

export default mongoose.model('Report', reportSchema);
