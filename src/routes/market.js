import { Router } from "express";
import { verifyToken } from "../middleware/auth.js";
import User from "../models/User.js";

const router = Router();

const CHEAPSHARK_BASE_URL = "https://www.cheapshark.com/api/1.0";
const CHEAPSHARK_HEADERS = {
  "User-Agent": "SteaMates-Backend/1.0 (+https://steamates-frontend.vercel.app)",
};

function normalizeText(value) {
  return String(value || "").trim();
}

function toNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function getIdentityMatches(item, id) {
  return item?.steamAppId === id || item?.gameId === id;
}

function findDealIdentity(item) {
  return normalizeText(item?.steamAppId) || normalizeText(item?.gameId) || normalizeText(item?.title).toLowerCase();
}

function mapDeal(deal) {
  if (!deal) return null;
  return {
    dealID: deal.dealID,
    title: deal.title,
    steamAppID: deal.steamAppID,
    gameID: deal.gameID,
    salePrice: deal.salePrice,
    normalPrice: deal.normalPrice,
    savings: deal.savings,
    storeID: deal.storeID,
    thumb: deal.thumb,
    lastChange: deal.lastChange,
  };
}

async function fetchCurrentDealForItem(item) {
  const params = new URLSearchParams();
  params.set("storeID", "1");
  params.set("pageSize", "1");

  const steamAppId = normalizeText(item?.steamAppId);
  if (steamAppId) {
    params.set("steamAppID", steamAppId);
  } else {
    const title = normalizeText(item?.title);
    if (!title) return null;
    params.set("title", title);
  }

  const response = await fetch(`${CHEAPSHARK_BASE_URL}/deals?${params.toString()}`, {
    headers: CHEAPSHARK_HEADERS,
  });

  if (!response.ok) return null;

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0];
}

function enrichWithLiveData(items, liveDataMap) {
  return items.map((item) => {
    const identity = findDealIdentity(item);
    const liveDeal = liveDataMap.get(identity) || null;
    const currentPrice = toNumber(liveDeal?.salePrice);
    const normalPrice = toNumber(liveDeal?.normalPrice);
    const savings = toNumber(liveDeal?.savings);

    return {
      ...item,
      liveDeal: mapDeal(liveDeal),
      currentPrice,
      normalPrice,
      savings,
      hasDiscount: savings !== null ? savings > 0 : false,
    };
  });
}

// GET /api/market/wishlist
router.get("/wishlist", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const wishlist = [...(user.wishlist || [])]
      .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());

    const withLive = String(req.query.live ?? "true") !== "false";
    if (!withLive || wishlist.length === 0) {
      return res.json({ wishlist });
    }

    const liveEntries = await Promise.all(
      wishlist.map(async (item) => {
        try {
          const deal = await fetchCurrentDealForItem(item);
          return [findDealIdentity(item), deal];
        } catch {
          return [findDealIdentity(item), null];
        }
      }),
    );

    const liveDataMap = new Map(liveEntries);
    return res.json({ wishlist: enrichWithLiveData(wishlist, liveDataMap) });
  } catch (error) {
    console.error("Wishlist list error:", error);
    return res.status(500).json({ error: "Error fetching wishlist" });
  }
});

// POST /api/market/wishlist
router.post("/wishlist", verifyToken, async (req, res) => {
  try {
    const steamAppId = normalizeText(req.body?.steamAppId);
    const gameId = normalizeText(req.body?.gameId);
    const title = normalizeText(req.body?.title);
    const thumb = normalizeText(req.body?.thumb);

    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    if (!steamAppId && !gameId) {
      return res.status(400).json({ error: "steamAppId or gameId is required" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const existing = (user.wishlist || []).find((item) =>
      (steamAppId && item.steamAppId === steamAppId) ||
      (gameId && item.gameId === gameId),
    );

    if (existing) {
      return res.json({ wishlistItem: existing, existed: true });
    }

    const wishlistItem = {
      steamAppId,
      gameId,
      title,
      thumb,
      addedAt: new Date(),
    };

    user.wishlist = [wishlistItem, ...(user.wishlist || [])].slice(0, 300);
    await user.save();

    return res.status(201).json({ wishlistItem, existed: false });
  } catch (error) {
    console.error("Wishlist create error:", error);
    return res.status(500).json({ error: "Error adding wishlist item" });
  }
});

// DELETE /api/market/wishlist/:id
router.delete("/wishlist/:id", verifyToken, async (req, res) => {
  try {
    const id = normalizeText(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const before = (user.wishlist || []).length;
    user.wishlist = (user.wishlist || []).filter((item) => !getIdentityMatches(item, id));
    const removed = before - user.wishlist.length;

    if (removed > 0) {
      await user.save();
    }

    return res.json({ success: true, removed });
  } catch (error) {
    console.error("Wishlist delete error:", error);
    return res.status(500).json({ error: "Error removing wishlist item" });
  }
});

// GET /api/market/alerts
router.get("/alerts", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const alerts = [...(user.priceAlerts || [])]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

    const withLive = String(req.query.live ?? "true") !== "false";
    if (!withLive || alerts.length === 0) {
      return res.json({ alerts });
    }

    const liveEntries = await Promise.all(
      alerts.map(async (alert) => {
        try {
          const deal = await fetchCurrentDealForItem(alert);
          return [findDealIdentity(alert), deal];
        } catch {
          return [findDealIdentity(alert), null];
        }
      }),
    );

    const liveDataMap = new Map(liveEntries);
    const enrichedAlerts = enrichWithLiveData(alerts, liveDataMap).map((alert) => {
      const currentPrice = alert.currentPrice;
      const targetPrice = toNumber(alert.targetPrice);
      const triggered = Boolean(alert.enabled && currentPrice !== null && targetPrice !== null && currentPrice <= targetPrice);

      return {
        ...alert,
        targetPrice,
        triggered,
      };
    });

    return res.json({ alerts: enrichedAlerts });
  } catch (error) {
    console.error("Price alerts list error:", error);
    return res.status(500).json({ error: "Error fetching price alerts" });
  }
});

// POST /api/market/alerts
router.post("/alerts", verifyToken, async (req, res) => {
  try {
    const steamAppId = normalizeText(req.body?.steamAppId);
    const gameId = normalizeText(req.body?.gameId);
    const title = normalizeText(req.body?.title);
    const thumb = normalizeText(req.body?.thumb);
    const targetPrice = toNumber(req.body?.targetPrice);

    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }
    if (!steamAppId && !gameId) {
      return res.status(400).json({ error: "steamAppId or gameId is required" });
    }
    if (targetPrice === null || targetPrice <= 0) {
      return res.status(400).json({ error: "targetPrice must be greater than 0" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const existingIndex = (user.priceAlerts || []).findIndex((item) =>
      (steamAppId && item.steamAppId === steamAppId) ||
      (gameId && item.gameId === gameId),
    );

    if (existingIndex >= 0) {
      user.priceAlerts[existingIndex].targetPrice = targetPrice;
      user.priceAlerts[existingIndex].enabled = true;
      user.priceAlerts[existingIndex].thumb = thumb || user.priceAlerts[existingIndex].thumb || "";
      user.priceAlerts[existingIndex].title = title || user.priceAlerts[existingIndex].title;
      user.priceAlerts[existingIndex].updatedAt = new Date();
      await user.save();

      return res.json({
        alert: user.priceAlerts[existingIndex],
        existed: true,
      });
    }

    const alert = {
      steamAppId,
      gameId,
      title,
      thumb,
      targetPrice,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    user.priceAlerts = [alert, ...(user.priceAlerts || [])].slice(0, 300);
    await user.save();

    return res.status(201).json({ alert, existed: false });
  } catch (error) {
    console.error("Price alert create error:", error);
    return res.status(500).json({ error: "Error creating price alert" });
  }
});

// PATCH /api/market/alerts/:id
router.patch("/alerts/:id", verifyToken, async (req, res) => {
  try {
    const id = normalizeText(req.params.id);
    const nextTarget = req.body?.targetPrice;
    const nextEnabled = req.body?.enabled;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const index = (user.priceAlerts || []).findIndex((item) => getIdentityMatches(item, id));
    if (index < 0) {
      return res.status(404).json({ error: "Price alert not found" });
    }

    if (nextTarget !== undefined) {
      const target = toNumber(nextTarget);
      if (target === null || target <= 0) {
        return res.status(400).json({ error: "targetPrice must be greater than 0" });
      }
      user.priceAlerts[index].targetPrice = target;
    }

    if (nextEnabled !== undefined) {
      user.priceAlerts[index].enabled = Boolean(nextEnabled);
    }

    user.priceAlerts[index].updatedAt = new Date();
    await user.save();

    return res.json({ alert: user.priceAlerts[index] });
  } catch (error) {
    console.error("Price alert update error:", error);
    return res.status(500).json({ error: "Error updating price alert" });
  }
});

// DELETE /api/market/alerts/:id
router.delete("/alerts/:id", verifyToken, async (req, res) => {
  try {
    const id = normalizeText(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const before = (user.priceAlerts || []).length;
    user.priceAlerts = (user.priceAlerts || []).filter((item) => !getIdentityMatches(item, id));
    const removed = before - user.priceAlerts.length;

    if (removed > 0) {
      await user.save();
    }

    return res.json({ success: true, removed });
  } catch (error) {
    console.error("Price alert delete error:", error);
    return res.status(500).json({ error: "Error deleting price alert" });
  }
});

export default router;
