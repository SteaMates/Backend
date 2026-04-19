import mongoose from 'mongoose';

const wishlistItemSchema = new mongoose.Schema(
  {
    steamAppId: { type: String, default: '' },
    gameId: { type: String, default: '' },
    title: { type: String, required: true, trim: true },
    thumb: { type: String, default: '' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const priceAlertSchema = new mongoose.Schema(
  {
    steamAppId: { type: String, default: '' },
    gameId: { type: String, default: '' },
    title: { type: String, required: true, trim: true },
    thumb: { type: String, default: '' },
    targetPrice: { type: Number, required: true, min: 0 },
    enabled: { type: Boolean, default: true },
    notifiedAt: { type: Date, default: null },
    lastTriggeredAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

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

  // Juegos guardados por el usuario para seguimiento en mercado.
  wishlist: {
    type: [wishlistItemSchema],
    default: [],
  },

  // Alertas de precio por juego para seguimiento manual.
  priceAlerts: {
    type: [priceAlertSchema],
    default: [],
  },
});

export default mongoose.model('User', userSchema);
