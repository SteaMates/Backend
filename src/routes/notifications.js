import { Router } from "express";
import Notification from "../models/Notification.js";
import { verifyToken } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/notifications
 * Query params:
 * - unread: 'true' | 'false'
 * - limit: number
 */
router.get("/", verifyToken, async (req, res) => {
  try {
    const unread = String(req.query.unread || "false") === "true";
    const limit = Math.min(Number(req.query.limit || 30), 100);

    const filter = { recipient: req.user._id };
    if (unread) {
      filter.readAt = null;
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("from", "steamId username avatar")
      .populate("session", "game date time status")
      .lean();

    return res.json({ notifications });
  } catch (error) {
    console.error("List notifications error:", error);
    return res.status(500).json({ error: "Error fetching notifications" });
  }
});

/**
 * PATCH /api/notifications/:id/read
 */
router.patch("/:id/read", verifyToken, async (req, res) => {
  try {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true },
    )
      .populate("from", "steamId username avatar")
      .populate("session", "game date time status");

    if (!n) {
      return res.status(404).json({ error: "Notification not found" });
    }

    return res.json({ notification: n });
  } catch (error) {
    console.error("Read notification error:", error);
    return res.status(500).json({ error: "Error updating notification" });
  }
});

/**
 * PATCH /api/notifications/read-all
 */
router.patch("/read-all", verifyToken, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user._id, readAt: null },
      { $set: { readAt: new Date() } },
    );

    return res.json({ success: true, modified: result.modifiedCount || 0 });
  } catch (error) {
    console.error("Read-all notifications error:", error);
    return res.status(500).json({ error: "Error updating notifications" });
  }
});

export default router;
