import { Router } from "express";
import { randomUUID } from "crypto";
import { verifyToken } from "../middleware/auth.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

const router = Router();

const CHEAPSHARK_BASE_URL = "https://www.cheapshark.com/api/1.0";
const CHEAPSHARK_HEADERS = {
  "User-Agent": "SteaMates-Backend/1.0 (+https://steamates-frontend.vercel.app)",
};
const NOTIFICATION_TTL_DAYS = Number(process.env.NOTIFICATIONS_TTL_DAYS || 30);

function expiresAtFromNow(days = NOTIFICATION_TTL_DAYS) {
  const ms = Math.max(1, days) * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function toNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatUsd(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function createTrackingId() {
  return typeof randomUUID === "function"
    ? randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureTrackingIds(userDoc) {
  let changed = false;

  (userDoc?.wishlist || []).forEach((item) => {
    if (!normalizeText(item?.id)) {
      item.id = createTrackingId();
      changed = true;
    }
  });

  (userDoc?.priceAlerts || []).forEach((item) => {
    if (!normalizeText(item?.id)) {
      item.id = createTrackingId();
      changed = true;
    }
  });

  return changed;
}

function getIdentityMatches(item, id) {
  return item?.id === id || item?.steamAppId === id || item?.gameId === id;
}

function findDealIdentity(item) {
  return (
    normalizeText(item?.id)
    || normalizeText(item?.steamAppId)
    || normalizeText(item?.gameId)
    || normalizeText(item?.title).toLowerCase()
  );
}

function isAlertTriggered(alert, currentPrice) {
  const targetPrice = toNumber(alert?.targetPrice);
  return Boolean(alert?.enabled && currentPrice !== null && targetPrice !== null && currentPrice <= targetPrice);
}

function buildPriceAlertNotification({ recipientId, alert, currentPrice, targetPrice }) {
  return {
    recipient: recipientId,
    from: null,
    type: "price_alert_triggered",
    title: "Objetivo de precio alcanzado",
    message: `${alert.title} bajó a ${formatUsd(currentPrice)} y alcanzó tu objetivo de ${formatUsd(targetPrice)}.`,
    session: null,
    data: {
      steamAppId: alert?.steamAppId || "",
      gameId: alert?.gameId || "",
      title: alert?.title || "Juego",
      thumb: alert?.thumb || "",
      currentPrice,
      targetPrice,
    },
    readAt: null,
    expiresAt: expiresAtFromNow(),
  };
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

async function maybeNotifyTriggeredAlert(userDoc, alertIndex) {
  const alert = userDoc?.priceAlerts?.[alertIndex];
  if (!alert || !alert.enabled) return false;

  let liveDeal = null;
  try {
    liveDeal = await fetchCurrentDealForItem(alert);
  } catch {
    liveDeal = null;
  }

  const currentPrice = toNumber(liveDeal?.salePrice);
  const targetPrice = toNumber(alert?.targetPrice);
  const triggered = isAlertTriggered(alert, currentPrice);

  if (triggered && !alert.notifiedAt && currentPrice !== null && targetPrice !== null) {
    const now = new Date();
    await Notification.create(
      buildPriceAlertNotification({
        recipientId: userDoc._id,
        alert,
        currentPrice,
        targetPrice,
      }),
    );
    alert.notifiedAt = now;
    alert.lastTriggeredAt = now;
    userDoc.markModified("priceAlerts");
    await userDoc.save();
    return true;
  }

  if (!triggered && alert.notifiedAt) {
    alert.notifiedAt = null;
    userDoc.markModified("priceAlerts");
    await userDoc.save();
  }

  return false;
}

// GET /api/market/wishlist
router.get("/wishlist", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const hasBackfilledIds = ensureTrackingIds(user);

    const wishlist = [...(user.wishlist || [])]
      .map((item) => (typeof item?.toObject === "function" ? item.toObject() : item))
      .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());

    const withLive = String(req.query.live ?? "true") !== "false";
    if (!withLive || wishlist.length === 0) {
      if (hasBackfilledIds) {
        user.markModified("wishlist");
        await user.save();
      }
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
    if (hasBackfilledIds) {
      user.markModified("wishlist");
      await user.save();
    }
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
      id: createTrackingId(),
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

    const hasBackfilledIds = ensureTrackingIds(user);

    const before = (user.wishlist || []).length;
    user.wishlist = (user.wishlist || []).filter((item) => !getIdentityMatches(item, id));
    const removed = before - user.wishlist.length;

    if (removed > 0 || hasBackfilledIds) {
      user.markModified("wishlist");
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
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const hasBackfilledIds = ensureTrackingIds(user);

    const alerts = [...(user.priceAlerts || [])]
      .map((item) => (typeof item?.toObject === "function" ? item.toObject() : item))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

    const withLive = String(req.query.live ?? "true") !== "false";
    if (!withLive || alerts.length === 0) {
      if (hasBackfilledIds) {
        user.markModified("priceAlerts");
        await user.save();
      }
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
    const notificationsToCreate = [];
    let hasStateChanges = false;
    const now = new Date();

    const alertIndexByIdentity = new Map(
      (user.priceAlerts || []).map((alert, index) => [findDealIdentity(alert), index]),
    );

    const enrichedAlerts = enrichWithLiveData(alerts, liveDataMap).map((alert) => {
      const currentPrice = alert.currentPrice;
      const targetPrice = toNumber(alert.targetPrice);
      const triggered = isAlertTriggered(alert, currentPrice);

      const identity = findDealIdentity(alert);
      const storedIndex = alertIndexByIdentity.get(identity);
      const storedAlert = storedIndex !== undefined ? user.priceAlerts?.[storedIndex] : null;

      if (storedAlert) {
        if (triggered && !storedAlert.notifiedAt && currentPrice !== null && targetPrice !== null) {
          storedAlert.notifiedAt = now;
          storedAlert.lastTriggeredAt = now;
          hasStateChanges = true;
          notificationsToCreate.push(
            buildPriceAlertNotification({
              recipientId: user._id,
              alert: storedAlert,
              currentPrice,
              targetPrice,
            }),
          );
        }

        if (!triggered && storedAlert.notifiedAt) {
          storedAlert.notifiedAt = null;
          hasStateChanges = true;
        }
      }

      return {
        ...alert,
        targetPrice,
        triggered,
      };
    });

    if (notificationsToCreate.length > 0) {
      await Notification.insertMany(notificationsToCreate);
    }

    if (hasStateChanges || hasBackfilledIds) {
      user.markModified("priceAlerts");
      await user.save();
    }

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
      user.priceAlerts[existingIndex].notifiedAt = null;
      user.priceAlerts[existingIndex].lastTriggeredAt = null;
      user.priceAlerts[existingIndex].updatedAt = new Date();
      await user.save();

      const triggeredNow = await maybeNotifyTriggeredAlert(user, existingIndex);

      return res.json({
        alert: user.priceAlerts[existingIndex],
        existed: true,
        triggeredNow,
      });
    }

    const alert = {
      id: createTrackingId(),
      steamAppId,
      gameId,
      title,
      thumb,
      targetPrice,
      enabled: true,
      notifiedAt: null,
      lastTriggeredAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    user.priceAlerts = [alert, ...(user.priceAlerts || [])].slice(0, 300);
    await user.save();

    const triggeredNow = await maybeNotifyTriggeredAlert(user, 0);

    return res.status(201).json({ alert: user.priceAlerts[0], existed: false, triggeredNow });
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

    ensureTrackingIds(user);

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
      user.priceAlerts[index].notifiedAt = null;
      user.priceAlerts[index].lastTriggeredAt = null;
    }

    if (nextEnabled !== undefined) {
      user.priceAlerts[index].enabled = Boolean(nextEnabled);
      if (!user.priceAlerts[index].enabled) {
        user.priceAlerts[index].notifiedAt = null;
      }
    }

    user.priceAlerts[index].updatedAt = new Date();
    await user.save();

    const triggeredNow = user.priceAlerts[index].enabled
      ? await maybeNotifyTriggeredAlert(user, index)
      : false;

    return res.json({ alert: user.priceAlerts[index], triggeredNow });
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

    const hasBackfilledIds = ensureTrackingIds(user);

    const before = (user.priceAlerts || []).length;
    user.priceAlerts = (user.priceAlerts || []).filter((item) => !getIdentityMatches(item, id));
    const removed = before - user.priceAlerts.length;

    if (removed > 0 || hasBackfilledIds) {
      user.markModified("priceAlerts");
      await user.save();
    }

    return res.json({ success: true, removed });
  } catch (error) {
    console.error("Price alert delete error:", error);
    return res.status(500).json({ error: "Error deleting price alert" });
  }
});

export default router;
