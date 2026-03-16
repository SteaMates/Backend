import express from 'express';
import GameList from '../models/GameList.js';
import User from '../models/User.js';

const router = express.Router();

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Please log in.' });
};

// POST /api/lists - Create a new game list
router.post('/', isAuthenticated, async (req, res) => {
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
      .sort({ createdAt: -1 });
    res.json(lists);
  } catch (error) {
    console.error('Error fetching lists:', error);
    res.status(500).json({ error: 'Failed to fetch game lists' });
  }
});

export default router;
