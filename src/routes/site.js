/**
 * Nombre del fichero: site.js
 * Descripción: Fichero fuente de la aplicación SteaMates.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import express from "express";
import User from "../models/User.js";
import GameList from "../models/GameList.js";
import GameCache from "../models/GameCache.js";
import GamingSession from "../models/GamingSession.js";

const router = express.Router();
// GET /api/site/stats
// Returns simple global counts for frontend landing/login
router.get("/stats", async (req, res) => {
  try {
    const usersCount = await User.countDocuments();
    const listsCount = await GameList.countDocuments();
    const sessionsOrganized = await GamingSession.countDocuments();

    res.json({
      usersCount,
      listsCount,
      sessionsOrganized,
    });
  } catch (error) {
    console.error("Site stats error:", error);
    res.status(500).json({ error: "Error fetching site stats" });
  }
});

export default router;
