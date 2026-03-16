import { Router } from "express";
import GameCache from "../models/GameCache.js";

const router = Router();
const STEAM_API_BASE = "https://api.steampowered.com";
const STORE_API_BASE = "https://store.steampowered.com/api";

function getSteamApiKey() {
  const key = process.env.STEAM_API_KEY;
  if (!key || key === "your_steam_api_key_here") return null;
  return key;
}

// Helper: fetch game genres from Steam Store API, with MongoDB cache
async function getGameGenres(appId) {
  // Check cache first
  const cached = await GameCache.findOne({ appId });
  if (cached && cached.genres.length > 0) {
    return cached;
  }

  try {
    const res = await fetch(
      `${STORE_API_BASE}/appdetails?appids=${appId}&l=spanish`,
    );
    const data = await res.json();
    const appData = data?.[String(appId)]?.data;

    if (!appData) return null;

    const genres = (appData.genres || []).map((g) => g.description);
    const gameDoc = {
      appId,
      name: appData.name || "",
      genres,
      isFree: appData.is_free || false,
      price: appData.price_overview?.final
        ? appData.price_overview.final / 100
        : 0,
      headerImage: appData.header_image || "",
      lastUpdated: new Date(),
    };

    await GameCache.findOneAndUpdate({ appId }, gameDoc, {
      upsert: true,
      new: true,
    });

    return gameDoc;
  } catch (error) {
    console.error(`Error fetching store data for app ${appId}:`, error.message);
    return null;
  }
}

// Helper: fetch owned games for a steamId
async function fetchOwnedGames(steamId) {
  const apiKey = getSteamApiKey();
  if (!apiKey) return [];

  const res = await fetch(
    `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`,
  );
  const data = await res.json();
  return data.response?.games || [];
}

// GET /api/steam/stats/time/:steamId
// Returns time-related stats for TimeCharts
router.get("/time/:steamId", async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey)
      return res.status(503).json({ error: "Steam API key not configured" });

    const games = await fetchOwnedGames(req.params.steamId);
    if (games.length === 0) {
      return res.json({
        totalHours: 0,
        topGame: null,
        gamesPlayed: 0,
        gamesOwned: 0,
      });
    }

    const totalMinutes = games.reduce(
      (acc, g) => acc + (g.playtime_forever || 0),
      0,
    );
    const totalHours = Math.round(totalMinutes / 60);
    const gamesPlayed = games.filter((g) => g.playtime_forever > 0).length;

    // Sort by playtime to find top game
    const sorted = [...games].sort(
      (a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0),
    );
    const top = sorted[0];
    const topHours = Math.round((top.playtime_forever || 0) / 60);

    res.json({
      totalHours,
      topGame: {
        name: top.name,
        hours: topHours,
        percentOfTotal:
          totalHours > 0 ? Math.round((topHours / totalHours) * 100) : 0,
        appId: top.appid,
      },
      gamesPlayed,
      gamesOwned: games.length,
    });
  } catch (error) {
    console.error("Stats time error:", error);
    res.status(500).json({ error: "Error fetching time stats" });
  }
});

// GET /api/steam/stats/genres/:steamId
// Returns genre breakdown for GenreBreakdown chart
router.get("/genres/:steamId", async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey)
      return res.status(503).json({ error: "Steam API key not configured" });

    const games = await fetchOwnedGames(req.params.steamId);
    if (games.length === 0) {
      return res.json({ genres: [], totalHours: 0 });
    }

    // Take top 20 games by playtime to limit API calls
    const sorted = [...games].sort(
      (a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0),
    );
    const topGames = sorted.slice(0, 20).filter((g) => g.playtime_forever > 0);

    // Fetch genres for each game (with cache)
    const genreHours = {};
    const genreGames = {};

    for (const game of topGames) {
      const gameInfo = await getGameGenres(game.appid);
      if (gameInfo && gameInfo.genres) {
        const hours = Math.round((game.playtime_forever || 0) / 60);
        for (const genre of gameInfo.genres) {
          genreHours[genre] = (genreHours[genre] || 0) + hours;
          genreGames[genre] = (genreGames[genre] || 0) + 1;
        }
      }
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 200));
    }

    const GENRE_COLORS = {
      Acción: "#ef4444",
      Action: "#ef4444",
      Aventura: "#f59e0b",
      Adventure: "#f59e0b",
      RPG: "#8b5cf6",
      Estrategia: "#3b82f6",
      Strategy: "#3b82f6",
      Simuladores: "#10b981",
      Simulation: "#10b981",
      Indie: "#ec4899",
      Casual: "#06b6d4",
      Carreras: "#f97316",
      Racing: "#f97316",
      Deportes: "#84cc16",
      Sports: "#84cc16",
      "Multijugador masivo": "#6366f1",
      "Massively Multiplayer": "#6366f1",
      Terror: "#991b1b",
      Horror: "#991b1b",
      "Disparos en primera persona": "#dc2626",
      FPS: "#dc2626",
    };

    const totalHours = Object.values(genreHours).reduce((a, b) => a + b, 0);
    const genres = Object.entries(genreHours)
      .map(([name, hours]) => ({
        name,
        hours,
        games: genreGames[name] || 0,
        color: GENRE_COLORS[name] || "#64748b",
      }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8); // Top 8 genres

    res.json({ genres, totalHours });
  } catch (error) {
    console.error("Stats genres error:", error);
    res.status(500).json({ error: "Error fetching genre stats" });
  }
});

// GET /api/steam/stats/achievements/:steamId
// Returns achievement stats for AchievementCharts
router.get("/achievements/:steamId", async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey)
      return res.status(503).json({ error: "Steam API key not configured" });

    const games = await fetchOwnedGames(req.params.steamId);
    if (!games || games.length === 0) {
      return res.json({
        completionRate: 0,
        perfectGames: 0,
        totalGamesPlayed: 0,
        totalAchievements: 0,
        rarestAchievement: null,
        rarestAchievementsList: [],
        recentAchievementsList: [],
      });
    }

    // Take top 10 most played games
    const sorted = [...games].sort(
      (a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0),
    );
    const topGames = sorted.slice(0, 10).filter((g) => g.playtime_forever > 0);

    let totalAchievements = 0;
    let totalUnlocked = 0;
    let perfectGames = 0;
    let rarestAchievement = null;
    let allUnlockedAchievements = [];

    for (const game of topGames) {
      try {
        // Get player achievements
        const achRes = await fetch(
          `${STEAM_API_BASE}/ISteamUserStats/GetPlayerAchievements/v0001/?key=${apiKey}&steamid=${req.params.steamId}&appid=${game.appid}&l=spanish`,
        );
        const achData = await achRes.json();
        const achievements = achData.playerstats?.achievements || [];

        if (achievements.length > 0) {
          const unlocked = achievements.filter((a) => a.achieved === 1);
          totalAchievements += achievements.length;
          totalUnlocked += unlocked.length;

          if (unlocked.length === achievements.length) {
            perfectGames++;
          }

          // Try to get global achievement percentages for rarest
          try {
            const globalRes = await fetch(
              `${STEAM_API_BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${game.appid}`,
            );
            const globalData = await globalRes.json();
            const globalPercentages = {};
            (globalData.achievementpercentages?.achievements || []).forEach(
              (a) => {
                globalPercentages[a.name] = a.percent;
              },
            );

            for (const ach of unlocked) {
              const globalPercent = globalPercentages[ach.apiname] || 100;

              const achDetails = {
                name: ach.name || ach.apiname,
                game: game.name,
                globalPercent: Math.round(globalPercent * 10) / 10,
                unlockTime: ach.unlocktime,
              };

              allUnlockedAchievements.push(achDetails);

              if (
                !rarestAchievement ||
                globalPercent < rarestAchievement.globalPercent
              ) {
                rarestAchievement = achDetails;
              }
            }
          } catch {
            // Ignore global stats errors
          }
        }

        // Small delay
        await new Promise((r) => setTimeout(r, 300));
      } catch {
        // Some games don't have achievements
        continue;
      }
    }

    // Sort all unlocked by global rarity (rarest first) and take top 4
    allUnlockedAchievements.sort((a, b) => a.globalPercent - b.globalPercent);
    const rarestArray = allUnlockedAchievements.slice(0, 4);

    // Also get recent achievements
    const recentArray = [...allUnlockedAchievements]
      .sort((a, b) => (b.unlockTime || 0) - (a.unlockTime || 0))
      .slice(0, 4);

    const completionRate =
      totalAchievements > 0
        ? Math.round((totalUnlocked / totalAchievements) * 100)
        : 0;

    res.json({
      completionRate,
      perfectGames,
      totalGamesPlayed: topGames.length,
      totalAchievements: totalUnlocked,
      rarestAchievement,
      rarestAchievementsList: rarestArray,
      recentAchievementsList: recentArray,
    });
  } catch (error) {
    console.error("Stats achievements error:", error);
    res.status(500).json({ error: "Error fetching achievement stats" });
  }
});

export default router;
