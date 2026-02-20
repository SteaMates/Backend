import passport from 'passport';
import SteamStrategy from 'passport-steam';
import User from '../models/User.js';

export function configureSteamStrategy() {
  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });

  const steamApiKey = process.env.STEAM_API_KEY;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const serverPort = process.env.PORT || 3001;

  if (!steamApiKey || steamApiKey === 'your_steam_api_key_here') {
    console.warn('⚠️  STEAM_API_KEY not configured. Steam login will not work.');
    console.warn('   Get your key at: https://steamcommunity.com/dev/apikey');
    return;
  }

  const backendUrl = process.env.BACKEND_URL || `http://localhost:${serverPort}`;

  passport.use(new SteamStrategy({
    returnURL: `${backendUrl}/api/auth/steam/callback`,
    realm: backendUrl + '/',
    apiKey: steamApiKey,
  },
  async (identifier, profile, done) => {
    try {
      const steamId = profile.id;
      
      // Find or create user
      let user = await User.findOne({ steamId });
      
      if (!user) {
        user = await User.create({
          steamId,
          username: profile.displayName,
          avatar: profile.photos?.[2]?.value || profile.photos?.[0]?.value || '',
          profileUrl: profile._json?.profileurl || '',
          realName: profile._json?.realname || '',
        });
        console.log(`New user created: ${profile.displayName} (${steamId})`);
      } else {
        // Update profile info on login
        user.username = profile.displayName;
        user.avatar = profile.photos?.[2]?.value || profile.photos?.[0]?.value || user.avatar;
        user.profileUrl = profile._json?.profileurl || user.profileUrl;
        user.lastLogin = new Date();
        await user.save();
      }

      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }));
}
