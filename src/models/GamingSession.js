import mongoose from 'mongoose';

const gamingSessionSchema = new mongoose.Schema({
  // The creator/host of the gaming session
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Information about the game they will be playing
  game: {
    appId: { type: Number, required: true },
    name: { type: String, required: true },
    imageUrl: { type: String }
  },
  // The date and time when the session takes place
  scheduledAt: {
    type: Date,
    required: true,
  },
  // Friends or users participating
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  // Optional small description or notes for the session
  notes: {
    type: String,
    trim: true,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

export default mongoose.model('GamingSession', gamingSessionSchema);
