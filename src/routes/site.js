import { Router } from "express";
import User from "../models/User.js";
import GameList from "../models/GameList.js";
import GameCache from "../models/GameCache.js";

const router = Router();

// GET /api/site/stats
// Returns simple global counts for frontend landing/login
router.get("/stats", async (req, res) => {
  try {
    const usersCount = await User.countDocuments();
    const listsCount = await GameList.countDocuments();
    const gamesCached = await GameCache.countDocuments();

    res.json({
      usersCount,
      listsCount,
      gamesCached,
    });
  } catch (error) {
    console.error("Site stats error:", error);
    res.status(500).json({ error: "Error fetching site stats" });
  }
});

export default router;
