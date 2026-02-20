import { Router } from 'express';
import passport from 'passport';

const router = Router();
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

// GET /api/auth/steam - Redirect to Steam login
router.get('/steam', passport.authenticate('steam', { failureRedirect: clientUrl + '/login' }));

// GET /api/auth/steam/callback - Steam login callback
router.get('/steam/callback',
  passport.authenticate('steam', { failureRedirect: clientUrl + '/login?error=auth_failed' }),
  (req, res) => {
    // Successful login — redirect to frontend with user data as query params
    const user = req.user;
    const params = new URLSearchParams({
      steamId: user.steamId,
      username: user.username,
      avatar: user.avatar || '',
      profileUrl: user.profileUrl || '',
    });
    res.redirect(`${clientUrl}/login?${params.toString()}`);
  }
);

// GET /api/auth/me - Get current user session
router.get('/me', (req, res) => {
  if (req.isAuthenticated() && req.user) {
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
  }
  res.json({ authenticated: false, user: null });
});

// POST /api/auth/logout - Log out
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Error logging out' });
    }
    req.session.destroy();
    res.json({ success: true });
  });
});

export default router;
