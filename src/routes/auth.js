import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { verifyToken } from '../middleware/auth.js';

const router = Router();
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.SESSION_SECRET || 'steamates-secret-key';

// GET /api/auth/steam - Redirect to Steam login
router.get('/steam', passport.authenticate('steam', { failureRedirect: clientUrl + '/login' }));

// GET /api/auth/steam/callback - Steam login callback
router.get('/steam/callback',
  passport.authenticate('steam', { failureRedirect: clientUrl + '/login?error=auth_failed' }),
  (req, res) => {
    const user = req.user;
    
    // Generate JWT Token
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });

    // Redirect to frontend with token and user data
    const params = new URLSearchParams({
      token, // <-- Passing token to frontend safely via callback
      id: user._id.toString(),
      steamId: user.steamId,
      username: user.username,
      avatar: user.avatar || '',
      profileUrl: user.profileUrl || '',
    });
    res.redirect(`${clientUrl}/login?${params.toString()}`);
  }
);

// GET /api/auth/me - Get current user session via JWT Token
router.get('/me', verifyToken, (req, res) => {
  return res.json({
    authenticated: true,
    user: {
      id: req.user._id,
      steamId: req.user.steamId,
      username: req.user.username,
      avatar: req.user.avatar,
      profileUrl: req.user.profileUrl,
    },
  });
});

// POST /api/auth/logout - Log out
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) console.error('Error logging out passport:', err);
    if (req.session) {
       req.session.destroy();
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

export default router;
