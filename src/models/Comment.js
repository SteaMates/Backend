import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  // The user who wrote the comment
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // The list on which the comment was written
  list: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GameList',
    required: true,
  },
  content: {
    type: String,
    required: true,
    trim: true,
  },
  // For nested replies (a comment replying to another comment)
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

export default mongoose.model('Comment', commentSchema);
