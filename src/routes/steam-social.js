/**
 * Nombre del fichero: steam-social.js
 * Descripción: Rutas sociales de Steam: lista de amigos e historial de precios (IsThereAnyDeal).
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import express from "express";
import { STEAM_API_BASE, getSteamApiKey, getItadApiKey } from "../utils/steam-utils.js";

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers exclusivos de ITAD (solo se usan en este módulo)
// ---------------------------------------------------------------------------

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function toTimestampMs(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string" && isNaN(Number(raw))) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n > 1_000_000_000_000 ? Math.floor(n) : Math.floor(n * 1000);
}

function toNumericPrice(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof raw === "object") {
    return toNumericPrice(firstDefined(raw.amount, raw.price, raw.value));
  }
  return null;
}

function extractItadGameId(payload) {
  if (!payload) return null;
  if (typeof payload === "string") return payload;

  const candidates = [
    payload.id, payload.gameId, payload.gameID, payload.plain,
    payload?.game?.id, payload?.game?.plain,
    payload?.data?.id, payload?.data?.plain,
    payload?.result?.id, payload?.result?.plain,
  ].filter(Boolean);

  if (candidates.length) return String(candidates[0]);

  const arrays = [
    payload.data, payload.results, payload.items,
    payload.games, payload.found, payload.matches,
  ].filter(Array.isArray);

  for (const arr of arrays) {
    if (arr.length === 0) continue;
    const item = arr[0];
    const id = firstDefined(item?.id, item?.plain, item?.gameId, item?.gameID);
    if (id) return String(id);
  }

  return null;
}

function normalizeItadHistory(payload) {
  if (!payload || typeof payload !== "object") return [];

  const possibleArrays = [];

  if (!Array.isArray(payload)) {
    for (const key in payload) {
      if (Array.isArray(payload[key])) possibleArrays.push(payload[key]);
    }
  }

  if (Array.isArray(payload))              possibleArrays.push(payload);
  if (Array.isArray(payload?.data))        possibleArrays.push(payload.data);
  if (Array.isArray(payload?.history))     possibleArrays.push(payload.history);
  if (Array.isArray(payload?.entries))     possibleArrays.push(payload.entries);
  if (Array.isArray(payload?.items))       possibleArrays.push(payload.items);
  if (Array.isArray(payload?.prices))      possibleArrays.push(payload.prices);
  if (Array.isArray(payload?.list))        possibleArrays.push(payload.list);
  if (Array.isArray(payload?.result?.history)) possibleArrays.push(payload.result.history);

  const points = [];

  for (const arr of possibleArrays) {
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;

      const price = toNumericPrice(
        firstDefined(
          item.price, item.amount, item.value, item.cut,
          item?.deal?.price, item?.deal?.price_new, item?.deal?.priceOld,
          item?.deal?.amount, item?.shop?.price, item?.current,
        ),
      );

      const timestampMs = toTimestampMs(
        firstDefined(
          item.timestamp, item.time, item.date, item.added,
          item.lastChange, item.cutAt,
          item?.deal?.timestamp, item?.deal?.time, item?.deal?.date,
        ),
      );

      if (!timestampMs || price === null || price <= 0) continue;
      points.push({ timestamp: timestampMs, price });
    }
  }

  const seen = new Set();
  return points
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter(({ timestamp, price }) => {
      const key = `${timestamp}-${price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

// GET /api/steam/friends/:steamId
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

    if (friendsList.length === 0) return res.json({ friends: [] });

    const friendIds = friendsList.slice(0, 100).map((f) => f.steamid).join(",");

    const profilesResponse = await fetch(
      `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${friendIds}`,
    );
    const profilesData = await profilesResponse.json();
    const profiles = profilesData.response?.players || [];

    const friends = profiles
      .map((p) => ({
        steamId: p.steamid,
        username: p.personaname,
        avatar: p.avatarfull,
        status: p.personastate,
        currentGame: p.gameextrainfo || null,
        friendSince: friendsList.find((f) => f.steamid === p.steamid)?.friend_since,
      }))
      .sort((a, b) => (b.status > 0 ? 1 : 0) - (a.status > 0 ? 1 : 0));

    return res.json({ friends });
  } catch (error) {
    console.error("Steam friends error:", error);
    return res.status(500).json({ error: "Error fetching Steam friends" });
  }
});

// GET /api/steam/itad/history
router.get("/itad/history", async (req, res) => {
  try {
    const key = getItadApiKey();
    if (!key) {
      return res.status(503).json({
        error: "IsThereAnyDeal API key not configured",
        hint: "Set ITAD_API_KEY or ISTHEREANYDEAL_API_KEY in backend .env",
      });
    }

    const appId = typeof req.query.appId === "string" ? req.query.appId.trim() : "";
    const title = typeof req.query.title === "string" ? req.query.title.trim() : "";
    const country = typeof req.query.country === "string" && req.query.country
      ? req.query.country
      : "ES";

    if (!appId && !title) {
      return res.status(400).json({ error: "appId or title query param is required" });
    }

    let gameId = null;

    if (appId) {
      const lookupUrl = new URL("https://api.isthereanydeal.com/games/lookup/v1");
      lookupUrl.searchParams.set("key", key);
      lookupUrl.searchParams.set("appid", appId);
      lookupUrl.searchParams.set("shop", "steam");
      const lookupRes = await fetch(lookupUrl);
      if (lookupRes.ok) gameId = extractItadGameId(await lookupRes.json());
    }

    if (!gameId && title) {
      const searchUrl = new URL("https://api.isthereanydeal.com/games/search/v1");
      searchUrl.searchParams.set("key", key);
      searchUrl.searchParams.set("title", title);
      searchUrl.searchParams.set("results", "1");
      const searchRes = await fetch(searchUrl);
      if (searchRes.ok) gameId = extractItadGameId(await searchRes.json());
    }

    if (!gameId) {
      return res.status(404).json({ error: "Game not found in IsThereAnyDeal" });
    }

    const historyUrl = new URL("https://api.isthereanydeal.com/games/history/v2");
    historyUrl.searchParams.set("key", key);
    historyUrl.searchParams.set("id", gameId);
    historyUrl.searchParams.set("country", country);

    const historyRes = await fetch(historyUrl);
    if (!historyRes.ok) {
      const details = await historyRes.text().catch(() => "");
      return res.status(historyRes.status).json({
        error: "IsThereAnyDeal history request failed",
        details,
      });
    }

    const points = normalizeItadHistory(await historyRes.json());
    return res.json({ gameId, source: "isthereanydeal", points });
  } catch (error) {
    console.error("IsThereAnyDeal history error:", error);
    return res.status(500).json({ error: "Error fetching IsThereAnyDeal history" });
  }
});

export default router;
