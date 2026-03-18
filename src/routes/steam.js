import { Router } from "express";
import GameCache from "../models/GameCache.js";

const router = Router();
const STEAM_API_BASE = "https://api.steampowered.com";

function getSteamApiKey() {
  const key = process.env.STEAM_API_KEY;
  if (!key || key === "your_steam_api_key_here") return null;
  return key;
}

async function fetchOwnedGames(steamId) {
  const apiKey = getSteamApiKey();
  if (!apiKey) return [];

  const response = await fetch(
    `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`,
  );
  const data = await response.json();
  return data.response?.games || [];
}

// GET /api/steam/profile/:steamId - Get Steam user profile
router.get("/profile/:steamId", async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: "Steam API key not configured" });
    }

    const { steamId } = req.params;
    const response = await fetch(
      `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`,
    );
    const data = await response.json();
    const player = data.response?.players?.[0];

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    let level = 0;
    let xpCurrent = 0;
    let xpTotal = 1;

    try {
      const badgesResponse = await fetch(
        `${STEAM_API_BASE}/IPlayerService/GetBadges/v1/?key=${apiKey}&steamid=${steamId}`,
      );
      if (badgesResponse.ok) {
        const badgesData = await badgesResponse.json();
        level = badgesData.response?.player_level || 0;
        xpCurrent = badgesData.response?.player_xp || 0;
        const xpNeeded = badgesData.response?.player_xp_needed_to_level_up || 0;
        xpTotal = xpCurrent + xpNeeded;
      }
    } catch (e) {
      console.error("Error fetching steam badges:", e);
    }

    res.json({
      steamId: player.steamid,
      username: player.personaname,
      avatar: player.avatarfull,
      profileUrl: player.profileurl,
      realName: player.realname || "",
      status: player.personastate,
      lastLogoff: player.lastlogoff,
      memberSince: player.timecreated,
      level,
      xpCurrent,
      xpTotal,
      gameId: player.gameid || null,
      gameExtraInfo: player.gameextrainfo || null,
    });
  } catch (error) {
    console.error("Steam profile error:", error);
    res.status(500).json({ error: "Error fetching Steam profile" });
  }
});

// GET /api/steam/games/:steamId - Get owned games
router.get("/games/:steamId", async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: "Steam API key not configured" });
    }

    const { steamId } = req.params;
    const response = await fetch(
      `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`,
    );
    const data = await response.json();

    const games = (data.response?.games || []).map((game) => ({
      appId: game.appid,
      name: game.name,
      playtime: game.playtime_forever,
      lastPlayed: game.rtime_last_played,
      icon: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
      logo: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`,
    }));

    games.sort((a, b) => b.playtime - a.playtime);

    let libraryValue = 0;
    try {
      const appIds = games.map((g) => g.appId);
      const cachedGames = await GameCache.find({ appId: { $in: appIds } });
      cachedGames.forEach((cg) => {
        if (!cg.isFree && cg.price) {
          libraryValue += cg.price;
        }
      });

      const missingCount = games.length - cachedGames.length;
      if (missingCount > 0) {
        libraryValue += missingCount * 10;
      }
    } catch (e) {
      console.error("Error computing library value:", e);
    }

    if (libraryValue === 0 && games.length > 0) {
      libraryValue = games.length * 15;
    }

    res.json({
      totalCount: data.response?.game_count || 0,
      games,
      libraryValue: Math.round(libraryValue),
    });
  } catch (error) {
    console.error("Steam games error:", error);
    res.status(500).json({ error: "Error fetching Steam games" });
  }
});

// GET /api/steam/search - Search for Steam games
router.get("/search", async (req, res) => {
  try {
    const { term } = req.query;
    if (!term) return res.json([]);

    const response = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=spanish&cc=ES`,
    );
    const data = await response.json();

    if (!data.items) {
      return res.json([]);
    }

    const games = data.items.map((item) => ({
      appId: item.id,
      name: item.name,
      price: item.price ? (item.price / 100).toFixed(2) + "€" : "Free",
      tinyImage: item.tiny_image,
    }));

    res.json(games);
  } catch (error) {
    console.error("Steam search error:", error);
    res.status(500).json({ error: "Error searching games" });
  }
});

// GET /api/steam/friends/:steamId - Get friends list
router.get("/friends/:steamId", async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: "Steam API key not configured" });
    }

    const { steamId } = req.params;

    const friendsResponse = await fetch(
      `${STEAM_API_BASE}/ISteamUser/GetFriendList/v0001/?key=${apiKey}&steamid=${steamId}&relationship=friend`,
    );
    const friendsData = await friendsResponse.json();
    const friendsList = friendsData.friendslist?.friends || [];

    if (friendsList.length === 0) {
      return res.json({ friends: [] });
    }

    const friendIds = friendsList
      .slice(0, 100)
      .map((f) => f.steamid)
      .join(",");

    const profilesResponse = await fetch(
      `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${friendIds}`,
    );
    const profilesData = await profilesResponse.json();
    const profiles = profilesData.response?.players || [];

    const friends = profiles.map((p) => ({
      steamId: p.steamid,
      username: p.personaname,
      avatar: p.avatarfull,
      status: p.personastate,
      currentGame: p.gameextrainfo || null,
      friendSince: friendsList.find((f) => f.steamid === p.steamid)?.friend_since,
    }));

    friends.sort((a, b) => (b.status > 0 ? 1 : 0) - (a.status > 0 ? 1 : 0));

    res.json({ friends });
  } catch (error) {
    console.error("Steam friends error:", error);
    res.status(500).json({ error: "Error fetching Steam friends" });
  }
});

// GET /api/steam/recent/:steamId - Get recently played games
router.get("/recent/:steamId", async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: "Steam API key not configured" });
    }

    const { steamId } = req.params;
    const response = await fetch(
      `${STEAM_API_BASE}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${apiKey}&steamid=${steamId}&count=10&format=json`,
    );
    const data = await response.json();

    const games = (data.response?.games || []).map((game) => ({
      appId: game.appid,
      name: game.name,
      playtime2Weeks: game.playtime_2weeks,
      playtimeForever: game.playtime_forever,
      icon: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
    }));

    res.json({
      totalCount: data.response?.total_count || 0,
      games,
    });
  } catch (error) {
    console.error("Steam recent games error:", error);
    res.status(500).json({ error: "Error fetching recent games" });
  }
});

// POST /api/steam/common-games - Get common owned games between a group
router.post("/common-games", async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: "Steam API key not configured" });
    }

    const { steamIds } = req.body;

    if (!Array.isArray(steamIds) || steamIds.length < 2) {
      return res
        .status(400)
        .json({ error: "steamIds must contain at least 2 ids" });
    }

    const uniqueSteamIds = [...new Set(steamIds)].filter(Boolean).slice(0, 6);

    const ownedGamesPerUser = [];
    for (const steamId of uniqueSteamIds) {
      const games = await fetchOwnedGames(steamId);
      ownedGamesPerUser.push(games);
    }

    if (ownedGamesPerUser.length === 0 || !ownedGamesPerUser[0]?.length) {
      return res.json({ games: [] });
    }

    const appSets = ownedGamesPerUser.map(
      (games) => new Set(games.map((g) => g.appid)),
    );

    const firstGames = ownedGamesPerUser[0];
    const commonGames = firstGames.filter((game) =>
      appSets.every((set) => set.has(game.appid)),
    );

    const games = commonGames
      .map((game) => ({
        appid: game.appid,
        name: game.name,
        headerImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
        owners: uniqueSteamIds.length,
        lastPlayed: game.rtime_last_played || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    res.json({ games });
  } catch (error) {
    console.error("Common games error:", error);
    res.status(500).json({ error: "Error fetching common games" });
  }
});

// POST /api/steam/games-info - Get genres and details for matching items
router.post("/games-info", async (req, res) => {
  try {
    const { appIds } = req.body;
    if (!appIds || !Array.isArray(appIds)) {
      return res.status(400).json({ error: "appIds must be an array" });
    }

    const cachedGames = await GameCache.find({ appId: { $in: appIds } });
    const cachedMap = {};
    cachedGames.forEach((g) => {
      cachedMap[g.appId] = g;
    });

    const missingIds = appIds.filter((id) => id && !cachedMap[id]);
    const toFetch = missingIds.slice(0, 8);

    for (const appId of toFetch) {
      try {
        const response = await fetch(
          `https://store.steampowered.com/api/appdetails?appids=${appId}&l=spanish`,
        );
        const data = await response.json();

        if (data && data[appId] && data[appId].success) {
          const details = data[appId].data;
          const genres = details.genres
            ? details.genres.map((g) => g.description)
            : [];

          const newCache = await GameCache.findOneAndUpdate(
            { appId: appId },
            {
              appId: appId,
              name: details.name,
              genres: genres,
              isFree: details.is_free,
              price: details.price_overview
                ? details.price_overview.final / 100
                : 0,
              headerImage: details.header_image,
              lastUpdated: new Date(),
            },
            { upsert: true, new: true },
          );
          cachedMap[appId] = newCache;
        }

        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err) {
        console.error("Steam app metadata error for " + appId, err);
      }
    }

    res.json(cachedMap);
  } catch (error) {
    console.error("Games-info error:", error);
    res.status(500).json({ error: "Error fetching game information" });
  }
});

export default router;