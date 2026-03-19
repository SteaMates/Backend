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
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
});

export default mongoose.model('User', userSchema);
