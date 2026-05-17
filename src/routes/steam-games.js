/**
 * Nombre del fichero: steam-games.js
 * Descripción: Rutas de biblioteca de juegos: owned games, juegos recientes, juegos en común e info de juegos.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import express from "express";
import GameCache from "../models/GameCache.js";
import { verifyToken } from "../middleware/auth.js";
import { validateSteamIdsPayload } from "../validation/validators.js";
import { STEAM_API_BASE, getSteamApiKey, fetchOwnedGames } from "../utils/steam-utils.js";
import logger from "../config/logger.js";

const router = express.Router();

/**
 * Calcula el valor estimado de la biblioteca a partir del caché de MongoDB.
 */
async function computeLibraryValue(games) {
  let libraryValue = 0;
  try {
    const appIds = games.map((g) => g.appId);
    const cachedGames = await GameCache.find({ appId: { $in: appIds } });
    cachedGames.forEach((cg) => {
      if (!cg.isFree && cg.price) libraryValue += cg.price;
    });
    const missingCount = games.length - cachedGames.length;
    if (missingCount > 0) libraryValue += missingCount * 10;
  } catch (e) {
    logger.error("Error computing library value:", e);
  }
  if (libraryValue === 0 && games.length > 0) libraryValue = games.length * 15;
  return Math.round(libraryValue);
}

/**
 * Mapea la respuesta de Steam a un formato normalizado de juegos.
 */
function mapGames(rawGames) {
  return rawGames.map((game) => ({
    appId: game.appid,
    name: game.name,
    playtime: game.playtime_forever,
    lastPlayed: game.rtime_last_played,
    icon: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
    logo: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`,
  }));
}

// GET /api/steam/games/:steamId
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
    const games = mapGames(data.response?.games || []).sort((a, b) => b.playtime - a.playtime);
    const libraryValue = await computeLibraryValue(games);
    const gameCount = data.response?.game_count;
    const hasData = games.length > 0;

    return res.json({
      totalCount: data.response?.game_count || 0,
      games,
      libraryValue,
      dataStatus: {
        hasData,
        reason: hasData ? null : gameCount === 0 ? "no_games" : "private_or_unavailable",
        gameCount: gameCount ?? games.length,
      },
    });
  } catch (error) {
    logger.error("Steam games error:", error);
    return res.status(500).json({ error: "Error fetching Steam games" });
  }
});

// GET /api/steam/me/games
router.get("/me/games", verifyToken, async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: "Steam API key not configured" });
    }

    const steamId = req.user?.steamId;
    if (!steamId) {
      return res.status(400).json({ error: "Authenticated user has no steamId" });
    }

    const response = await fetch(
      `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`,
    );
    const data = await response.json();
    const games = mapGames(data.response?.games || []).sort((a, b) => b.playtime - a.playtime);
    const libraryValue = await computeLibraryValue(games);
    const gameCount = data.response?.game_count;
    const hasData = games.length > 0;

    return res.json({
      totalCount: data.response?.game_count || 0,
      games,
      libraryValue,
      dataStatus: {
        hasData,
        reason: hasData ? null : gameCount === 0 ? "no_games" : "private_or_unavailable",
        gameCount: gameCount ?? games.length,
      },
    });
  } catch (error) {
    logger.error("Steam self games error:", error);
    return res.status(500).json({ error: "Error fetching Steam games" });
  }
});

// GET /api/steam/recent/:steamId
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
      lastPlayed: game.rtime_last_played,
      icon: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
    }));

    return res.json({ totalCount: data.response?.total_count || 0, games });
  } catch (error) {
    logger.error("Steam recent games error:", error);
    return res.status(500).json({ error: "Error fetching recent games" });
  }
});

// GET /api/steam/me/recent
router.get("/me/recent", verifyToken, async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: "Steam API key not configured" });
    }

    const steamId = req.user?.steamId;
    if (!steamId) {
      return res.status(400).json({ error: "Authenticated user has no steamId" });
    }

    const response = await fetch(
      `${STEAM_API_BASE}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${apiKey}&steamid=${steamId}&count=10&format=json`,
    );
    const data = await response.json();

    const games = (data.response?.games || []).map((game) => ({
      appId: game.appid,
      name: game.name,
      playtime2Weeks: game.playtime_2weeks,
      playtimeForever: game.playtime_forever,
      lastPlayed: game.rtime_last_played,
      icon: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
    }));

    return res.json({ totalCount: data.response?.total_count || 0, games });
  } catch (error) {
    logger.error("Steam self recent games error:", error);
    return res.status(500).json({ error: "Error fetching recent games" });
  }
});

// POST /api/steam/common-games
router.post("/common-games", async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: "Steam API key not configured" });
    }

    const { ok, errors, value } = validateSteamIdsPayload(req.body?.steamIds, { min: 2, max: 6 });
    if (!ok) {
      return res.status(400).json({ error: errors[0].message, details: errors });
    }

    const ownedGamesPerUser = [];
    for (const steamId of value) {
      const games = await fetchOwnedGames(steamId);
      ownedGamesPerUser.push(games);
    }

    if (ownedGamesPerUser.length === 0 || !ownedGamesPerUser[0]?.length) {
      return res.json({ games: [] });
    }

    const appSets = ownedGamesPerUser.map((games) => new Set(games.map((g) => g.appid)));
    const commonGames = ownedGamesPerUser[0].filter((game) =>
      appSets.every((set) => set.has(game.appid)),
    );

    const games = commonGames
      .map((game) => ({
        appid: game.appid,
        name: game.name,
        headerImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
        owners: value.length,
        lastPlayed: game.rtime_last_played || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    return res.json({ games });
  } catch (error) {
    logger.error("Common games error:", error);
    return res.status(500).json({ error: "Error fetching common games" });
  }
});

// POST /api/steam/games-info
router.post("/games-info", async (req, res) => {
  try {
    const { appIds } = req.body;
    if (!appIds || !Array.isArray(appIds)) {
      return res.status(400).json({ error: "appIds must be an array" });
    }

    const cachedGames = await GameCache.find({ appId: { $in: appIds } });
    const cachedMap = {};
    cachedGames.forEach((g) => { cachedMap[g.appId] = g; });

    const missingIds = appIds.filter((id) => id && !cachedMap[id]);
    const toFetch = missingIds.slice(0, 8);

    for (const appId of toFetch) {
      try {
        const response = await fetch(
          `https://store.steampowered.com/api/appdetails?appids=${appId}&l=spanish`,
        );
        const data = await response.json();

        if (data?.[appId]?.success) {
          const details = data[appId].data;
          const genres = details.genres ? details.genres.map((g) => g.description) : [];
          const newCache = await GameCache.findOneAndUpdate(
            { appId },
            {
              appId,
              name: details.name,
              genres,
              isFree: details.is_free,
              price: details.price_overview ? details.price_overview.final / 100 : 0,
              headerImage: details.header_image,
              lastUpdated: new Date(),
            },
            { upsert: true, new: true },
          );
          cachedMap[appId] = newCache;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err) {
        logger.error("Steam app metadata error for " + appId, err);
      }
    }

    return res.json(cachedMap);
  } catch (error) {
    logger.error("Games-info error:", error);
    return res.status(500).json({ error: "Error fetching game information" });
  }
});

export default router;
