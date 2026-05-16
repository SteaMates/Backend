/**
 * Nombre del fichero: steam-profile.js
 * Descripción: Rutas de perfil de Steam: perfil público, fondo de perfil y perfil propio.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import express from "express";
import User from "../models/User.js";
import { verifyToken } from "../middleware/auth.js";
import { STEAM_API_BASE, getSteamApiKey } from "../utils/steam-utils.js";

const router = express.Router();

/**
 * Función auxiliar: obtiene el nivel y XP de un usuario desde la API de Steam.
 */
async function fetchPlayerBadges(apiKey, steamId) {
  try {
    const response = await fetch(
      `${STEAM_API_BASE}/IPlayerService/GetBadges/v1/?key=${apiKey}&steamid=${steamId}`,
    );
    if (!response.ok) return { level: 0, xpCurrent: 0, xpTotal: 1 };

    const data = await response.json();
    const level = data.response?.player_level || 0;
    const xpCurrent = data.response?.player_xp || 0;
    const xpNeeded = data.response?.player_xp_needed_to_level_up || 0;
    return { level, xpCurrent, xpTotal: xpCurrent + xpNeeded };
  } catch {
    return { level: 0, xpCurrent: 0, xpTotal: 1 };
  }
}

// GET /api/steam/profile/:steamId
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

    const { level, xpCurrent, xpTotal } = await fetchPlayerBadges(apiKey, steamId);
    const dbUser = await User.findOne({ steamId });

    return res.json({
      _id: dbUser ? dbUser._id : null,
      steamId: player.steamid,
      username: player.personaname,
      avatar: player.avatarfull,
      profileUrl: player.profileurl,
      communityVisibilityState: player.communityvisibilitystate || null,
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
    return res.status(500).json({ error: "Error fetching Steam profile" });
  }
});

// GET /api/steam/profile-background/:steamId
router.get("/profile-background/:steamId", async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) return res.json({ backgroundUrl: null });

    const { steamId } = req.params;
    const response = await fetch(
      `${STEAM_API_BASE}/IPlayerService/GetProfileItemsEquipped/v1/?key=${apiKey}&steamid=${steamId}`,
    );

    if (!response.ok) return res.json({ backgroundUrl: null });

    const data = await response.json();
    const bg = data.response?.profile_background;

    if (!bg?.image_large) return res.json({ backgroundUrl: null });

    const backgroundUrl = `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/${bg.image_large}`;
    return res.json({ backgroundUrl });
  } catch (error) {
    console.error("Profile background error:", error);
    return res.json({ backgroundUrl: null });
  }
});

// GET /api/steam/me/profile
router.get("/me/profile", verifyToken, async (req, res) => {
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
      `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`,
    );
    const data = await response.json();
    const player = data.response?.players?.[0];

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    const { level, xpCurrent, xpTotal } = await fetchPlayerBadges(apiKey, steamId);
    const dbUser = await User.findOne({ steamId });

    return res.json({
      _id: dbUser ? dbUser._id : null,
      steamId: player.steamid,
      username: player.personaname,
      avatar: player.avatarfull,
      profileUrl: player.profileurl,
      communityVisibilityState: player.communityvisibilitystate || null,
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
    console.error("Steam self profile error:", error);
    return res.status(500).json({ error: "Error fetching Steam profile" });
  }
});

export default router;
