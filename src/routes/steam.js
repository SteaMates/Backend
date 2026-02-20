import { Router } from 'express';

const router = Router();
const STEAM_API_BASE = 'https://api.steampowered.com';

function getSteamApiKey() {
  const key = process.env.STEAM_API_KEY;
  if (!key || key === 'your_steam_api_key_here') return null;
  return key;
}

// GET /api/steam/profile/:steamId - Get Steam user profile
router.get('/profile/:steamId', async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: 'Steam API key not configured' });
    }

    const { steamId } = req.params;
    const response = await fetch(
      `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`
    );
    const data = await response.json();
    const player = data.response?.players?.[0];

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({
      steamId: player.steamid,
      username: player.personaname,
      avatar: player.avatarfull,
      profileUrl: player.profileurl,
      realName: player.realname || '',
      status: player.personastate, // 0=Offline, 1=Online, 2=Busy, 3=Away, 4=Snooze, 5=Trade, 6=Play
      lastLogoff: player.lastlogoff,
      gameId: player.gameid || null, // Currently playing
      gameExtraInfo: player.gameextrainfo || null,
    });
  } catch (error) {
    console.error('Steam profile error:', error);
    res.status(500).json({ error: 'Error fetching Steam profile' });
  }
});

// GET /api/steam/games/:steamId - Get owned games
router.get('/games/:steamId', async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: 'Steam API key not configured' });
    }

    const { steamId } = req.params;
    const response = await fetch(
      `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`
    );
    const data = await response.json();

    const games = (data.response?.games || []).map(game => ({
      appId: game.appid,
      name: game.name,
      playtime: game.playtime_forever, // minutes
      lastPlayed: game.rtime_last_played,
      icon: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
      logo: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`,
    }));

    // Sort by playtime descending
    games.sort((a, b) => b.playtime - a.playtime);

    res.json({
      totalCount: data.response?.game_count || 0,
      games,
    });
  } catch (error) {
    console.error('Steam games error:', error);
    res.status(500).json({ error: 'Error fetching Steam games' });
  }
});

// GET /api/steam/friends/:steamId - Get friends list
router.get('/friends/:steamId', async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: 'Steam API key not configured' });
    }

    const { steamId } = req.params;
    
    // Get friends list
    const friendsResponse = await fetch(
      `${STEAM_API_BASE}/ISteamUser/GetFriendList/v0001/?key=${apiKey}&steamid=${steamId}&relationship=friend`
    );
    const friendsData = await friendsResponse.json();
    const friendsList = friendsData.friendslist?.friends || [];

    if (friendsList.length === 0) {
      return res.json({ friends: [] });
    }

    // Get profile details for all friends (batch up to 100)
    const friendIds = friendsList.slice(0, 100).map(f => f.steamid).join(',');
    const profilesResponse = await fetch(
      `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${friendIds}`
    );
    const profilesData = await profilesResponse.json();
    const profiles = profilesData.response?.players || [];

    const friends = profiles.map(p => ({
      steamId: p.steamid,
      username: p.personaname,
      avatar: p.avatarfull,
      status: p.personastate,
      currentGame: p.gameextrainfo || null,
      friendSince: friendsList.find(f => f.steamid === p.steamid)?.friend_since,
    }));

    // Sort: online/ingame first, then offline
    friends.sort((a, b) => (b.status > 0 ? 1 : 0) - (a.status > 0 ? 1 : 0));

    res.json({ friends });
  } catch (error) {
    console.error('Steam friends error:', error);
    res.status(500).json({ error: 'Error fetching Steam friends' });
  }
});

// GET /api/steam/recent/:steamId - Get recently played games
router.get('/recent/:steamId', async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: 'Steam API key not configured' });
    }

    const { steamId } = req.params;
    const response = await fetch(
      `${STEAM_API_BASE}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${apiKey}&steamid=${steamId}&count=10&format=json`
    );
    const data = await response.json();

    const games = (data.response?.games || []).map(game => ({
      appId: game.appid,
      name: game.name,
      playtime2Weeks: game.playtime_2weeks, // minutes last 2 weeks
      playtimeForever: game.playtime_forever,
      icon: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
    }));

    res.json({
      totalCount: data.response?.total_count || 0,
      games,
    });
  } catch (error) {
    console.error('Steam recent games error:', error);
    res.status(500).json({ error: 'Error fetching recent games' });
  }
});

export default router;
