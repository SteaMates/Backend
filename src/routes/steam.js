import { Router } from "express";
import * as cheerio from "cheerio";
import GameCache from "../models/GameCache.js";

const router = Router();
const STEAM_API_BASE = "https://api.steampowered.com";

function getItadApiKey() {
  const key = process.env.ITAD_API_KEY || process.env.ISTHEREANYDEAL_API_KEY;
  if (!key || key === "your_itad_api_key_here") return null;
  return key;
}

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

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function toTimestampMs(raw) {
  if (raw === undefined || raw === null) return null;
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
    const nested = firstDefined(raw.amount, raw.price, raw.value);
    return toNumericPrice(nested);
  }
  return null;
}

function extractItadGameId(payload) {
  if (!payload) return null;

  if (typeof payload === "string") return payload;

  const candidates = [
    payload.id,
    payload.gameId,
    payload.gameID,
    payload.plain,
    payload?.game?.id,
    payload?.game?.plain,
    payload?.data?.id,
    payload?.data?.plain,
    payload?.result?.id,
    payload?.result?.plain,
  ].filter(Boolean);

  if (candidates.length) return String(candidates[0]);

  const arrays = [
    payload.data,
    payload.results,
    payload.items,
    payload.games,
    payload.found,
    payload.matches,
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
  const possibleArrays = [];

  if (Array.isArray(payload)) possibleArrays.push(payload);
  if (Array.isArray(payload?.data)) possibleArrays.push(payload.data);
  if (Array.isArray(payload?.history)) possibleArrays.push(payload.history);
  if (Array.isArray(payload?.entries)) possibleArrays.push(payload.entries);
  if (Array.isArray(payload?.items)) possibleArrays.push(payload.items);
  if (Array.isArray(payload?.prices)) possibleArrays.push(payload.prices);
  if (Array.isArray(payload?.list)) possibleArrays.push(payload.list);
  if (Array.isArray(payload?.result?.history)) possibleArrays.push(payload.result.history);

  const points = [];

  for (const arr of possibleArrays) {
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;

      const price = toNumericPrice(
        firstDefined(
          item.price,
          item.amount,
          item.value,
          item.cut,
          item?.deal?.price,
          item?.deal?.price_new,
          item?.deal?.priceOld,
          item?.deal?.amount,
          item?.shop?.price,
          item?.current,
        ),
      );

      const timestampMs = toTimestampMs(
        firstDefined(
          item.timestamp,
          item.time,
          item.date,
          item.added,
          item.lastChange,
          item.cutAt,
          item?.deal?.timestamp,
          item?.deal?.time,
          item?.deal?.date,
        ),
      );

      if (!timestampMs || price === null || price <= 0) continue;

      points.push({
        timestamp: timestampMs,
        price,
      });
    }
  }

  const deduped = [];
  const seen = new Set();

  points
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((point) => {
      const key = `${point.timestamp}-${point.price}`;
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(point);
    });

  return deduped;
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

    // Exclude known non-game types (DLC, soundtrack, video, hardware, bundle).
    // Using a blocklist so items whose type is absent or unknown are kept.
    const NON_GAME_TYPES = new Set(["dlc", "music", "video", "hardware", "bundle"]);

    const games = data.items
      .filter((item) => !NON_GAME_TYPES.has(item.type))
      .map((item) => {
        // storesearch returns price as an OBJECT: { currency, initial, final, discount_percent }
        // For free games price is null/undefined.
        const priceObj = item.price;  // object or null
        const isFree = !priceObj || priceObj.final === 0;
        const priceDollars = isFree ? 0 : parseFloat((priceObj.final / 100).toFixed(2));

        return {
          appId: item.id,
          name: item.name,
          type: item.type ?? "game",
          isFree,
          price: priceDollars,   // number in dollars, 0 = free
          tinyImage: item.tiny_image,
        };
      });

    res.json(games);
  } catch (error) {
    console.error("Steam search error:", error);
    res.status(500).json({ error: "Error searching games" });
  }
});

// GET /api/steam/free-games - Browse free games from Steam Store with sorting & pagination
router.get("/free-games", async (req, res) => {
  try {
    // Map frontend sortBy values to Steam Store sort_by params
    const SORT_MAP = {
      "_ASC":          "_ASC",
      "Reviews_DESC":  "Reviews_DESC",   // Most popular (Highest rated)
      "Released_DESC": "Released_DESC",  // Most recent
      "Price_ASC":     "Price_ASC",      // Cheapest
      "Discount_DESC": "Discount_DESC",  // Most discounted
    };
    const sort     = SORT_MAP[req.query.sort] ?? "_ASC";
    const page     = Math.max(0, parseInt(req.query.page) || 0);
    const start    = page * 40;

    const url = new URL("https://store.steampowered.com/search/results/");
    url.searchParams.set("infinite",   "1");
    url.searchParams.set("maxprice",   "free");
    url.searchParams.set("count",      "40");
    url.searchParams.set("start",      start.toString());
    url.searchParams.set("sort_by",    sort);
    url.searchParams.set("os",         "win");

    const response = await fetch(url.toString());
    const data     = await response.json();

    const games = [];
    if (data.results_html) {
      const $ = cheerio.load(data.results_html);
      $("a.search_result_row").each((i, el) => {
        const elem = $(el);
        const appId = elem.attr("data-ds-appid") || "";
        if (!appId || appId.includes(",")) return; // skip bundles/empty

        const name = elem.find(".title").text().trim();
        const tinyImage = elem.find(".search_capsule img").attr("src") 
          || `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
        
        games.push({
          appId,
          name,
          type: "game",
          isFree: true,
          price: "Gratis",
          tinyImage
        });
      });
    }

    res.json({
      games,
      hasMore: (data.total_count ?? 0) > start + 40,
    });
  } catch (error) {
    console.error("Steam free-games error:", error);
    res.status(500).json({ error: "Error fetching free games" });
  }
});

// GET /api/steam/by-tags - Browse games by Steam tags
router.get("/by-tags", async (req, res) => {
  try {
    const SORT_MAP = {
      "_ASC":          "_ASC",
      "Reviews_DESC":  "Reviews_DESC",
      "Released_DESC": "Released_DESC",
      "Price_ASC":     "Price_ASC",
      "Discount_DESC": "Discount_DESC",
    };
    const sort   = SORT_MAP[req.query.sort] ?? "_ASC";
    const page   = Math.max(0, parseInt(req.query.page) || 0);
    const tags   = req.query.tags || "";
    const isFree = req.query.isFree === "true";
    const start  = page * 40;

    const url = new URL("https://store.steampowered.com/search/results/");
    url.searchParams.set("infinite", "1");
    url.searchParams.set("count",   "40");
    url.searchParams.set("start",   start.toString());
    url.searchParams.set("sort_by", sort);
    url.searchParams.set("os",      "win");
    url.searchParams.set("category1", "998"); // Games only
    if (tags) {
      url.searchParams.set("tags", tags);
    }
    if (isFree) {
      url.searchParams.set("maxprice", "free");
    }

    const response = await fetch(url.toString());
    const data     = await response.json();

    const games = [];
    if (data.results_html) {
      const $ = cheerio.load(data.results_html);
      $("a.search_result_row").each((i, el) => {
        const elem = $(el);
        const appId = elem.attr("data-ds-appid") || "";
        if (!appId || appId.includes(",")) return;

        const name = elem.find(".title").text().trim();
        const tinyImage = elem.find(".search_capsule img").attr("src") 
          || `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
        
        let priceRaw = elem.find(".discount_final_price").text().trim();
        if (!priceRaw) priceRaw = elem.find(".search_price").text().trim();
        
        let priceDollars = null;
        let originalPriceDollars = null;
        let discountPct = 0;
        let isFreeGame = isFree; // If the query was for isFree, they are all free

        let originalRaw = elem.find(".discount_original_price").text().trim();
        let discountRaw = elem.find(".discount_pct, .search_discount span").text().trim();
        
        if (discountRaw && discountRaw.includes("%")) {
          discountPct = parseInt(discountRaw.replace("-", "").replace("%", "")) || 0;
        }

        if (priceRaw.toLowerCase().includes("free") || priceRaw.toLowerCase().includes("gratis") || priceRaw === "Free To Play") {
          isFreeGame = true;
        } else if (priceRaw) {
          // Find digits and commas/dots. e.g. "59,99€" -> "59.99"
          const match = priceRaw.match(/[\d.,]+/);
          if (match) {
            priceDollars = parseFloat(match[0].replace(",", "."));
            if (priceDollars === 0) isFreeGame = true;
          }
          if (originalRaw) {
             const oMatch = originalRaw.match(/[\d.,]+/);
             if (oMatch) {
               originalPriceDollars = parseFloat(oMatch[0].replace(",", "."));
             }
          }
        }

        games.push({
          appId,
          name,
          type: "game",
          isFree: isFreeGame,
          price: isFreeGame ? "Gratis" : priceDollars,
          originalPrice: originalPriceDollars,
          discountPct,
          tinyImage
        });
      });
    }

    res.json({
      games,
      hasMore: (data.total_count ?? 0) > start + 40,
    });
  } catch (error) {
    console.error("Steam by-tags error:", error);
    res.status(500).json({ error: "Error fetching games by tags" });
  }
});


// In-memory cache for SteamSpy top 100 most played games
let top100Cache = { data: null, timestamp: 0 };

// GET /api/steam/most-played - Browse most played games (top 100 in 2 weeks from SteamSpy)
router.get("/most-played", async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const now = Date.now();
    
    // Cache for 1 hour
    if (!top100Cache.data || now - top100Cache.timestamp > 1000 * 60 * 60) {
      const response = await fetch("https://steamspy.com/api.php?request=top100in2weeks");
      const data = await response.json();
      
      // Data is an object with game objects, sort by ccu (concurrent users / popularity)
      const gamesArray = Object.values(data).sort((a, b) => b.ccu - a.ccu);
      
      top100Cache.data = gamesArray.map(item => {
        const appId = item.appid.toString();
        const priceDollars = item.price == "0" ? "Gratis" : parseFloat((parseInt(item.price) / 100).toFixed(2));
        const originalPriceDollars = item.initialprice ? parseFloat((parseInt(item.initialprice) / 100).toFixed(2)) : null;
        const discountPct = item.discount ? parseInt(item.discount) : 0;
        
        return {
          appId,
          name: item.name,
          type: "game",
          isFree: item.price == "0",
          price: priceDollars,
          originalPrice: originalPriceDollars,
          discountPct,
          tinyImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
        };
      });
      top100Cache.timestamp = now;
    }
    
    const start = page * 40;
    const pageData = top100Cache.data.slice(start, start + 40);
    
    res.json({
      games: pageData,
      hasMore: start + 40 < top100Cache.data.length
    });
  } catch (error) {
    console.error("Steam most-played error:", error);
    res.status(500).json({ error: "Error fetching most played games" });
  }
});

// GET /api/steam/tags?appIds=111,222,333 - Get SteamSpy tags for a list of appIds (cached in MongoDB)
// Non-blocking for the user: returns whatever is cached immediately, fetches missing ones async.
router.get("/tags", async (req, res) => {
  try {
    const raw = typeof req.query.appIds === "string" ? req.query.appIds : "";
    if (!raw) return res.json({});

    const appIds = [...new Set(raw.split(",").map(s => s.trim()).filter(Boolean))].slice(0, 60);

    // Fetch all cached entries in one DB query
    const TAGS_TTL_DAYS = 7;
    const cutoff = new Date(Date.now() - TAGS_TTL_DAYS * 24 * 60 * 60 * 1000);

    const cached = await GameCache.find({ appId: { $in: appIds } });
    const cachedMap = {};
    const stale = [];

    for (const doc of cached) {
      const id = doc.appId.toString();
      if (doc.tags && doc.tags.length > 0 && doc.tagsUpdated && doc.tagsUpdated > cutoff) {
        // Fresh cache hit — use immediately
        cachedMap[id] = doc.tags;
      } else {
        // Stale or missing tags — needs refresh
        stale.push(id);
      }
    }

    // Any appId not in DB at all also needs fetching
    const cachedIds = new Set(cached.map(d => d.appId.toString()));
    const missing = appIds.filter(id => !cachedIds.has(id));
    const toFetch = [...stale, ...missing];

    // Respond immediately with whatever we have cached
    res.json(cachedMap);

    // Fetch missing/stale tags from SteamSpy in background (fire-and-forget)
    if (toFetch.length > 0) {
      (async () => {
        for (const appId of toFetch) {
          try {
            const spyRes = await fetch(
              `https://steamspy.com/api.php?request=appdetails&appid=${appId}`
            );
            if (!spyRes.ok) continue;
            const spyData = await spyRes.json();
            const tagsObj = spyData?.tags;
            if (!tagsObj || typeof tagsObj !== "object") continue;

            // Sort by vote count descending, keep top 20 tag names
            const tags = Object.entries(tagsObj)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 20)
              .map(([name]) => name);

            await GameCache.findOneAndUpdate(
              { appId },
              { $set: { tags, tagsUpdated: new Date() } },
              { upsert: true, new: true },
            );
          } catch (err) {
            console.error(`SteamSpy tags error for ${appId}:`, err.message);
          }
          // SteamSpy rate limit: 1 req/s
          await new Promise(r => setTimeout(r, 1050));
        }
      })().catch(err => console.error("Background tags fetch error:", err));
    }
  } catch (error) {
    console.error("Steam tags error:", error);
    res.status(500).json({ error: "Error fetching game tags" });
  }
});

// GET /api/steam/app/:appId - Get Steam app details from Steam Store API
router.get("/app/:appId", async (req, res) => {
  try {
    const { appId } = req.params;
    if (!appId || !/^\d+$/.test(appId)) {
      return res.status(400).json({ error: "Invalid appId" });
    }

    const response = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&l=spanish`,
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: "Steam app request failed" });
    }

    const raw = await response.json();
    const appNode = raw?.[appId];

    if (!appNode?.success || !appNode?.data) {
      return res.status(404).json({ error: "Steam app not found" });
    }

    const app = appNode.data;

    return res.json({
      data: {
        steam_appid: app.steam_appid,
        name: app.name,
        header_image: app.header_image,
        short_description: app.short_description,
        is_free: app.is_free,
        genres: app.genres || [],
        release_date: app.release_date || null,
      },
    });
  } catch (error) {
    console.error("Steam app details error:", error);
    return res.status(500).json({ error: "Error fetching Steam app details" });
  }
});

// GET /api/steam/itad/history - Price history from IsThereAnyDeal
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
      if (lookupRes.ok) {
        const lookupData = await lookupRes.json();
        gameId = extractItadGameId(lookupData);
      }
    }

    if (!gameId && title) {
      const searchUrl = new URL("https://api.isthereanydeal.com/games/search/v1");
      searchUrl.searchParams.set("key", key);
      searchUrl.searchParams.set("title", title);
      searchUrl.searchParams.set("results", "1");

      const searchRes = await fetch(searchUrl);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        gameId = extractItadGameId(searchData);
      }
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

    const historyData = await historyRes.json();
    const points = normalizeItadHistory(historyData);

    return res.json({
      gameId,
      source: "isthereanydeal",
      points,
    });
  } catch (error) {
    console.error("IsThereAnyDeal history error:", error);
    return res.status(500).json({ error: "Error fetching IsThereAnyDeal history" });
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
// GET /api/steam/players/:appId - Get current active players
router.get("/players/:appId", async (req, res) => {
  try {
    const { appId } = req.params;
    const response = await fetch(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`);
    if (!response.ok) {
      return res.status(response.status).json({ error: "Steam API returned error" });
    }
    const data = await response.json();
    res.json({
      player_count: data.response?.player_count || 0,
      result: data.response?.result || 0
    });
  } catch (error) {
    console.error("Steam player count error:", error);
    res.status(500).json({ error: "Error fetching Steam player count" });
  }
});

export default router;