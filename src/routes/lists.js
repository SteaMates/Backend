import express from 'express';
import GameList from '../models/GameList.js';
import User from '../models/User.js';
import Comment from '../models/Comment.js';
import { verifyToken } from '../middleware/auth.js';
import { requireCanPublish } from '../middleware/moderationStatus.js';

const router = express.Router();

// POST /api/lists - Create a new game list
router.post('/', verifyToken, requireCanPublish, async (req, res) => {
  try {
    const { title, description, categories, coverImage, games } = req.body;
    
    // The user's ID from the session (Passport populates req.user)
    const userId = req.user._id;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const newList = new GameList({
      title,
      description,
      categories: categories || [],
      coverImage: coverImage || 'default-list-cover.jpg',
      games: games || [],
      author: userId,
    });

    const savedList = await newList.save();
    
    res.status(201).json(savedList);
  } catch (error) {
    console.error('Error creating list:', error);
    res.status(500).json({ error: 'Failed to create game list' });
  }
});

// GET /api/lists - Get all lists (with author populated)
router.get('/', async (req, res) => {
  try {
    const lists = await GameList.find()
      .populate('author', 'username avatar steamId')
      .lean()
      .sort({ createdAt: -1 });
      
    // Attach comment counts
    const listsWithComments = await Promise.all(lists.map(async (list) => {
      const count = await Comment.countDocuments({ list: list._id });
      return { ...list, commentsCount: count };
    }));
      
    res.json(listsWithComments);
  } catch (error) {
    console.error('Error fetching lists:', error);
    res.status(500).json({ error: 'Failed to fetch game lists' });
  }
});

// GET /api/lists/:id - Get a single list
router.get('/:id', async (req, res) => {
  try {
    const list = await GameList.findById(req.params.id)
      .populate('author', 'username avatar steamId');
    
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    res.json(list);
  } catch (error) {
    console.error('Error fetching list details:', error);
    res.status(500).json({ error: 'Failed to fetch game list' });
  }
});

// DELETE /api/lists/:id - Delete a list
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const listId = req.params.id;
    const userId = req.user._id;

    const list = await GameList.findById(listId);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Check if the user is the author
    if (list.author.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'You are not authorized to delete this list' });
    }

    await GameList.findByIdAndDelete(listId);
    // Optionally delete related comments
    await Comment.deleteMany({ list: listId });

    res.json({ message: 'List deleted successfully' });
  } catch (error) {
    console.error('Error deleting list:', error);
    res.status(500).json({ error: 'Failed to delete list' });
  }
});

// --- COMMENTS ---

// GET /api/lists/:id/comments
router.get('/:id/comments', async (req, res) => {
  try {
    const comments = await Comment.find({ list: req.params.id })
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 });
    res.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST /api/lists/:id/comments
router.post('/:id/comments', verifyToken, requireCanPublish, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });

    const newComment = new Comment({
      author: req.user._id,
      list: req.params.id,
      content
    });
    const saved = await newComment.save();
    await saved.populate('author', 'username avatar');
    
    res.status(201).json(saved);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// --- LIKES / DISLIKES ---

router.post('/:id/like', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const list = await GameList.findById(req.params.id);
    
    if (!list) return res.status(404).json({ error: 'List not found' });

    // Remove from dislikes if present
    list.dislikes = list.dislikes.filter(id => id.toString() !== userId.toString());
    
    // Toggle like
    const liked = list.likes.some(id => id.toString() === userId.toString());
    if (liked) {
      list.likes = list.likes.filter(id => id.toString() !== userId.toString());
    } else {
      list.likes.push(userId);
    }
    
    await list.save();
    res.json({ likes: list.likes, dislikes: list.dislikes });
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

router.post('/:id/dislike', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const list = await GameList.findById(req.params.id);
    
    if (!list) return res.status(404).json({ error: 'List not found' });

    // Remove from likes if present
    list.likes = list.likes.filter(id => id.toString() !== userId.toString());
    
    // Toggle dislike
    const disliked = list.dislikes.some(id => id.toString() === userId.toString());
    if (disliked) {
      list.dislikes = list.dislikes.filter(id => id.toString() !== userId.toString());
    } else {
      list.dislikes.push(userId);
    }
    
    await list.save();
    res.json({ likes: list.likes, dislikes: list.dislikes });
  } catch (error) {
    console.error('Error toggling dislike:', error);
    res.status(500).json({ error: 'Failed to toggle dislike' });
  }
});

export default router;
