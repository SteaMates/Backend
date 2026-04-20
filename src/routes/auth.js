import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { verifyToken } from '../middleware/auth.js';
import ModerationAction from '../models/ModerationAction.js';

const router = Router();
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.SESSION_SECRET || 'steamates-secret-key';

async function getActiveWarningReason(userId) {
  const now = new Date();
  const activeWarning = await ModerationAction.findOne({
    userId,
    action: 'warned',
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .sort({ createdAt: -1 })
    .select('reason');

  return activeWarning?.reason || '';
}

// GET /api/auth/steam - Redirect to Steam login
router.get('/steam', passport.authenticate('steam', { failureRedirect: clientUrl + '/login' }));

// GET /api/auth/steam/callback - Steam login callback
router.get('/steam/callback',
  passport.authenticate('steam', { failureRedirect: clientUrl + '/login?error=auth_failed' }),
  async (req, res) => {
    try {
      const user = req.user;
      const warningReason = user.status === 'warned' ? await getActiveWarningReason(user._id) : '';
      
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
        role: user.role || 'user',
        isAdmin: String(user.role === 'admin'),
        status: user.status || 'active',
        warningReason,
      });
      res.redirect(`${clientUrl}/login?${params.toString()}`);
    } catch (error) {
      console.error('Error en callback de Steam:', error);
      res.redirect(`${clientUrl}/login?error=auth_failed`);
    }
  }
);

// GET /api/auth/me - Get current user session via JWT Token
router.get('/me', verifyToken, (req, res) => {
  const buildResponse = async () => {
    const warningReason = req.user.status === 'warned' ? await getActiveWarningReason(req.user._id) : '';

    return res.json({
      authenticated: true,
      user: {
        id: req.user._id,
        steamId: req.user.steamId,
        username: req.user.username,
        avatar: req.user.avatar,
        profileUrl: req.user.profileUrl,
        role: req.user.role || 'user',
        isAdmin: req.user.role === 'admin',
        status: req.user.status || 'active',
        warningReason,
      },
    });
  };

  return buildResponse().catch((error) => {
    console.error('Error obteniendo datos de sesión:', error);
    return res.status(500).json({ error: 'Error obteniendo sesión de usuario' });
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
