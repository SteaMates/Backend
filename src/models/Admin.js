import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  steamId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  }
});

// A collection to manually configure who is an admin by storing their steamId.
// When an admin logs in, the app can query `Admin.findOne({ steamId: user.steamId })`.
export default mongoose.model('Admin', adminSchema);
