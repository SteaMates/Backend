/**
 * Nombre del fichero: steam-browse.js
 * Descripción: Rutas de exploración del catálogo de Steam: búsqueda, juegos gratuitos,
 *              filtrado por tags, más jugados, detalles de apps y jugadores activos.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import express from "express";
import * as cheerio from "cheerio";
import GameCache from "../models/GameCache.js";
import logger from "../config/logger.js";

const router = express.Router();

const SORT_MAP = {
  _ASC: "_ASC",
  Reviews_DESC: "Reviews_DESC",
  Released_DESC: "Released_DESC",
  Price_ASC: "Price_ASC",
  Discount_DESC: "Discount_DESC",
};

// Cache en memoria para el top 100 de SteamSpy (TTL: 1 hora)
let top100Cache = { data: null, timestamp: 0 };

// GET /api/steam/search
router.get("/search", async (req, res) => {
  try {
    const { term } = req.query;
    if (!term) return res.json([]);

    const response = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=spanish&cc=ES`,
    );
    const data = await response.json();

    if (!data.items) return res.json([]);

    const NON_GAME_TYPES = new Set(["dlc", "music", "video", "hardware", "bundle"]);

    const games = data.items
      .filter((item) => !NON_GAME_TYPES.has(item.type))
      .map((item) => {
        const priceObj = item.price;
        const isFree = !priceObj || priceObj.final === 0;
        const priceDollars = isFree ? 0 : parseFloat((priceObj.final / 100).toFixed(2));
        return {
          appId: item.id,
          name: item.name,
          type: item.type ?? "game",
          isFree,
          price: priceDollars,
          tinyImage: item.tiny_image,
        };
      });

    return res.json(games);
  } catch (error) {
    logger.error("Steam search error:", error);
    return res.status(500).json({ error: "Error searching games" });
  }
});

// GET /api/steam/free-games
router.get("/free-games", async (req, res) => {
  try {
    const sort = SORT_MAP[req.query.sort] ?? "_ASC";
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const start = page * 40;

    const url = new URL("https://store.steampowered.com/search/results/");
    url.searchParams.set("infinite", "1");
    url.searchParams.set("maxprice", "free");
    url.searchParams.set("count", "40");
    url.searchParams.set("start", start.toString());
    url.searchParams.set("sort_by", sort);
    url.searchParams.set("os", "win");

    const response = await fetch(url.toString());
    const data = await response.json();

    const games = [];
    if (data.results_html) {
      const $ = cheerio.load(data.results_html);
      $("a.search_result_row").each((i, el) => {
        const elem = $(el);
        const appId = elem.attr("data-ds-appid") || "";
        if (!appId || appId.includes(",")) return;

        games.push({
          appId,
          name: elem.find(".title").text().trim(),
          type: "game",
          isFree: true,
          price: "Gratis",
          tinyImage:
            elem.find(".search_capsule img").attr("src") ||
            `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
        });
      });
    }

    return res.json({ games, hasMore: (data.total_count ?? 0) > start + 40 });
  } catch (error) {
    logger.error("Steam free-games error:", error);
    return res.status(500).json({ error: "Error fetching free games" });
  }
});

// GET /api/steam/by-tags
router.get("/by-tags", async (req, res) => {
  try {
    const sort = SORT_MAP[req.query.sort] ?? "_ASC";
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const tags = req.query.tags || "";
    const isFree = req.query.isFree === "true";
    const start = page * 40;

    const url = new URL("https://store.steampowered.com/search/results/");
    url.searchParams.set("infinite", "1");
    url.searchParams.set("count", "40");
    url.searchParams.set("start", start.toString());
    url.searchParams.set("sort_by", sort);
    url.searchParams.set("os", "win");
    url.searchParams.set("category1", "998");
    if (tags) url.searchParams.set("tags", tags);
    if (isFree) url.searchParams.set("maxprice", "free");

    const response = await fetch(url.toString());
    const data = await response.json();

    const games = [];
    if (data.results_html) {
      const $ = cheerio.load(data.results_html);
      $("a.search_result_row").each((i, el) => {
        const elem = $(el);
        const appId = elem.attr("data-ds-appid") || "";
        if (!appId || appId.includes(",")) return;

        const name = elem.find(".title").text().trim();
        const tinyImage =
          elem.find(".search_capsule img").attr("src") ||
          `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

        let priceRaw = elem.find(".discount_final_price").text().trim() ||
          elem.find(".search_price").text().trim();
        const originalRaw = elem.find(".discount_original_price").text().trim();
        const discountRaw = elem.find(".discount_pct, .search_discount span").text().trim();

        let priceDollars = null;
        let originalPriceDollars = null;
        let discountPct = 0;
        let isFreeGame = isFree;

        if (discountRaw?.includes("%")) {
          discountPct = parseInt(discountRaw.replace("-", "").replace("%", "")) || 0;
        }

        if (
          priceRaw.toLowerCase().includes("free") ||
          priceRaw.toLowerCase().includes("gratis") ||
          priceRaw === "Free To Play"
        ) {
          isFreeGame = true;
        } else if (priceRaw) {
          const match = priceRaw.match(/[\d.,]+/);
          if (match) {
            priceDollars = parseFloat(match[0].replace(",", "."));
            if (priceDollars === 0) isFreeGame = true;
          }
          if (originalRaw) {
            const oMatch = originalRaw.match(/[\d.,]+/);
            if (oMatch) originalPriceDollars = parseFloat(oMatch[0].replace(",", "."));
          }
        }

        games.push({
          appId, name, type: "game",
          isFree: isFreeGame,
          price: isFreeGame ? "Gratis" : priceDollars,
          originalPrice: originalPriceDollars,
          discountPct,
          tinyImage,
        });
      });
    }

    return res.json({ games, hasMore: (data.total_count ?? 0) > start + 40 });
  } catch (error) {
    logger.error("Steam by-tags error:", error);
    return res.status(500).json({ error: "Error fetching games by tags" });
  }
});

// GET /api/steam/most-played
router.get("/most-played", async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const now = Date.now();

    if (!top100Cache.data || now - top100Cache.timestamp > 1000 * 60 * 60) {
      const response = await fetch("https://steamspy.com/api.php?request=top100in2weeks");
      const data = await response.json();

      top100Cache.data = Object.values(data)
        .sort((a, b) => b.ccu - a.ccu)
        .map((item) => {
          const appId = item.appid.toString();
          const priceDollars =
            item.price == "0" ? "Gratis" : parseFloat((parseInt(item.price) / 100).toFixed(2));
          return {
            appId,
            name: item.name,
            type: "game",
            isFree: item.price == "0",
            price: priceDollars,
            originalPrice: item.initialprice
              ? parseFloat((parseInt(item.initialprice) / 100).toFixed(2))
              : null,
            discountPct: item.discount ? parseInt(item.discount) : 0,
            tinyImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
          };
        });
      top100Cache.timestamp = now;
    }

    const start = page * 40;
    return res.json({
      games: top100Cache.data.slice(start, start + 40),
      hasMore: start + 40 < top100Cache.data.length,
    });
  } catch (error) {
    logger.error("Steam most-played error:", error);
    return res.status(500).json({ error: "Error fetching most played games" });
  }
});

// GET /api/steam/tags
router.get("/tags", async (req, res) => {
  try {
    const raw = typeof req.query.appIds === "string" ? req.query.appIds : "";
    if (!raw) return res.json({});

    const appIds = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 60);
    const TAGS_TTL_DAYS = 7;
    const cutoff = new Date(Date.now() - TAGS_TTL_DAYS * 24 * 60 * 60 * 1000);

    const cached = await GameCache.find({ appId: { $in: appIds } });
    const cachedMap = {};
    const stale = [];

    for (const doc of cached) {
      const id = doc.appId.toString();
      if (doc.tags?.length > 0 && doc.tagsUpdated > cutoff) {
        cachedMap[id] = doc.tags;
      } else {
        stale.push(id);
      }
    }

    const cachedIds = new Set(cached.map((d) => d.appId.toString()));
    const toFetch = [...stale, ...appIds.filter((id) => !cachedIds.has(id))];

    // Responder inmediatamente con lo que hay en caché
    res.json(cachedMap);

    // Actualizar en background los que faltan/están caducados
    if (toFetch.length > 0) {
      (async () => {
        for (const appId of toFetch) {
          try {
            const spyRes = await fetch(
              `https://steamspy.com/api.php?request=appdetails&appid=${appId}`,
            );
            if (!spyRes.ok) continue;
            const spyData = await spyRes.json();
            const tagsObj = spyData?.tags;
            if (!tagsObj || typeof tagsObj !== "object") continue;

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
            logger.error(`SteamSpy tags error for ${appId}:`, err.message);
          }
          await new Promise((r) => setTimeout(r, 1050)); // SteamSpy: 1 req/s
        }
      })().catch((err) => logger.error("Background tags fetch error:", err));
    }
  } catch (error) {
    logger.error("Steam tags error:", error);
    return res.status(500).json({ error: "Error fetching game tags" });
  }
});

// GET /api/steam/app/:appId
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
    logger.error("Steam app details error:", error);
    return res.status(500).json({ error: "Error fetching Steam app details" });
  }
});

// GET /api/steam/players/:appId
router.get("/players/:appId", async (req, res) => {
  try {
    const { appId } = req.params;
    const response = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`,
    );
    if (!response.ok) {
      return res.status(response.status).json({ error: "Steam API returned error" });
    }
    const data = await response.json();
    return res.json({
      player_count: data.response?.player_count || 0,
      result: data.response?.result || 0,
    });
  } catch (error) {
    logger.error("Steam player count error:", error);
    return res.status(500).json({ error: "Error fetching Steam player count" });
  }
});

export default router;
