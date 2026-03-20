import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  steamId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
  },
  avatar: {
    type: String,
    default: '',
  },
  profileUrl: {
    type: String,
    default: '',
  },
  realName: {
    type: String,
    default: '',
  },
  lastLogin: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Rol del usuario: usuario normal o administrador
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  // Estado de moderación: activo, advertido, silenciado o baneado
  status: {
    type: String,
    enum: ['active', 'warned', 'silenced', 'banned'],
    default: 'active',
  },
  // Historial de acciones de moderación aplicadas a este usuario
  moderationHistory: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ModerationAction',
    },
  ],
});

export default mongoose.model('User', userSchema);
