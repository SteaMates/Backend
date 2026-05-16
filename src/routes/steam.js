/**
 * Nombre del fichero: steam.js
 * Descripción: Agregador de rutas de Steam. Combina los módulos especializados en un único
 *              router para mantener la compatibilidad con index.js sin cambios.
 *
 *   steam-profile.js  → /profile/:steamId, /profile-background/:steamId, /me/profile
 *   steam-games.js    → /games/:steamId, /me/games, /recent/:steamId, /me/recent,
 *                        /common-games, /games-info
 *   steam-browse.js   → /search, /free-games, /by-tags, /most-played, /tags,
 *                        /app/:appId, /players/:appId
 *   steam-social.js   → /friends/:steamId, /itad/history
 *
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import express from "express";
import steamProfileRouter from "./steam-profile.js";
import steamGamesRouter  from "./steam-games.js";
import steamBrowseRouter from "./steam-browse.js";
import steamSocialRouter from "./steam-social.js";

const router = express.Router();

router.use(steamProfileRouter);
router.use(steamGamesRouter);
router.use(steamBrowseRouter);
router.use(steamSocialRouter);

export default router;
