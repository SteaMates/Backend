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

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function getOwnedGamesWithCacheValue(steamId) {
  const games = await fetchOwnedGames(steamId);

  if (!games || games.length === 0) {
    return {
      games: [],
      totalGames: 0,
      totalMinutes: 0,
      totalHours: 0,
      playedGames: 0,
      unplayedGames: 0,
      libraryValue: 0,
      costPerHour: 0,
      topGame: null,
    };
  }

  const totalMinutes = games.reduce((acc, g) => acc + (g.playtime_forever || 0), 0);
  const totalHours = round(totalMinutes / 60, 1);
  const playedGames = games.filter((g) => (g.playtime_forever || 0) > 0).length;
  const unplayedGames = games.length - playedGames;

  const sorted = [...games].sort(
    (a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0)
  );
  const top = sorted[0] || null;

  const appIds = games.map((g) => g.appid);
  const cachedGames = await GameCache.find({ appId: { $in: appIds } });

  const cacheMap = new Map();
  for (const cg of cachedGames) {
    cacheMap.set(cg.appId, cg);
  }

  let libraryValue = 0;
  for (const game of games) {
    const cached = cacheMap.get(game.appid);
    if (cached) {
      if (!cached.isFree) {
        libraryValue += cached.price || 0;
      }
    } else {
      // fallback conservador para juegos sin cache
      libraryValue += 10;
    }
  }

  libraryValue = round(libraryValue, 0);

  const costPerHour =
    totalHours > 0 ? round(libraryValue / totalHours, 2) : round(libraryValue, 2);

  return {
    games,
    totalGames: games.length,
    totalMinutes,
    totalHours,
    playedGames,
    unplayedGames,
    libraryValue,
    costPerHour,
    topGame: top
      ? {
          appId: top.appid,
          name: top.name,
          hours: round((top.playtime_forever || 0) / 60, 1),
          percentOfTotal:
            totalHours > 0
              ? Math.round((((top.playtime_forever || 0) / 60) / totalHours) * 100)
              : 0,
        }
      : null,
  };
}

async function getAchievementSummary(steamId, ownedGames) {
  if (!ownedGames || ownedGames.length === 0) {
    return {
      completionPct: 0,
      totalAchievements: 0,
      perfectGames: 0,
      totalGames: 0,
      rarestAchievement: null,
      rarestGame: null,
      rarityPct: null,
    };
  }

  const sorted = [...ownedGames].sort(
    (a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0)
  );
  const topGames = sorted.slice(0, 10).filter((g) => (g.playtime_forever || 0) > 0);

  let totalAchievements = 0;
  let totalUnlocked = 0;
  let perfectGames = 0;
  let rarestAchievement = null;
  let rarestGame = null;
  let rarityPct = null;

  for (const game of topGames) {
    try {
      const achRes = await fetch(
        `${STEAM_API_BASE}/ISteamUserStats/GetPlayerAchievements/v0001/?key=${getSteamApiKey()}&steamid=${steamId}&appid=${game.appid}&l=spanish`
      );
      const achData = await achRes.json();
      const achievements = achData.playerstats?.achievements || [];

      if (!achievements.length) continue;

      const unlocked = achievements.filter((a) => a.achieved === 1);

      totalAchievements += achievements.length;
      totalUnlocked += unlocked.length;

      if (unlocked.length === achievements.length) {
        perfectGames++;
      }

      let globalPercentages = {};
      try {
        const globalRes = await fetch(
          `${STEAM_API_BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${game.appid}`
        );
        const globalData = await globalRes.json();

        for (const a of globalData.achievementpercentages?.achievements || []) {
          globalPercentages[a.name] = a.percent;
        }
      } catch {}

      for (const ach of unlocked) {
        const gp = globalPercentages[ach.apiname];
        if (gp !== undefined) {
          if (rarityPct === null || gp < rarityPct) {
            rarityPct = round(gp, 1);
            rarestAchievement = ach.name || ach.apiname;
            rarestGame = game.name;
          }
        }
      }

      await new Promise((r) => setTimeout(r, 250));
    } catch {
      continue;
    }
  }

  const completionPct =
    totalAchievements > 0 ? Math.round((totalUnlocked / totalAchievements) * 100) : 0;

  return {
    completionPct,
    totalAchievements: totalUnlocked,
    perfectGames,
    totalGames: topGames.length,
    rarestAchievement,
    rarestGame,
    rarityPct,
  };
}

function buildRadarMetrics({ economy, time, achievements }) {
  const volumenRaw = economy.totalGames;
  const dedicacionRaw = time.totalHours;
  const rentabilidadRaw = economy.costPerHour > 0 ? 1 / economy.costPerHour : 0;
  const perfeccionismoRaw = achievements.completionPct;
  const fidelidadRaw = time.topGame?.percentOfTotal || 0;

  return {
    raw: {
      volumen: volumenRaw,
      dedicacion: dedicacionRaw,
      rentabilidad: rentabilidadRaw,
      perfeccionismo: perfeccionismoRaw,
      fidelidad: fidelidadRaw,
    },
  };
}

function scaleRadarScores(players) {
  const axes = ["volumen", "dedicacion", "rentabilidad", "perfeccionismo", "fidelidad"];

  const maxByAxis = {};
  for (const axis of axes) {
    maxByAxis[axis] = Math.max(...players.map((p) => p.radar.raw[axis]), 0);
  }

  for (const player of players) {
    const scores = {};
    let total = 0;

    for (const axis of axes) {
      const max = maxByAxis[axis];
      const raw = player.radar.raw[axis];
      const score = max > 0 ? round((raw / max) * 10, 1) : 0;
      scores[axis] = score;
      total += score;
    }

    player.radar.scores = scores;
    player.radar.average = round(total / axes.length, 1);
  }

  return players;
}

function getRadarArchetype(scores) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topAxis = entries[0]?.[0];

  switch (topAxis) {
    case "rentabilidad":
      return {
        archetype: "El Ahorrador",
        archetypeEmoji: "💰",
        quote: '"Exprime cada céntimo"',
      };
    case "perfeccionismo":
      return {
        archetype: "El Tryhard",
        archetypeEmoji: "🏆",
        quote: '"No deja logro sin desbloquear"',
      };
    case "fidelidad":
      return {
        archetype: "El Monotemático",
        archetypeEmoji: "❤️",
        quote: '"Tiene su juego favorito y lo demás sobra"',
      };
    case "dedicacion":
      return {
        archetype: "El No-Life",
        archetypeEmoji: "⏰",
        quote: '"Horas y horas, sin mirar el reloj"',
      };
    case "volumen":
    default:
      return {
        archetype: "El Coleccionista",
        archetypeEmoji: "📚",
        quote: '"Su biblioteca no conoce límites"',
      };
  }
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
    let allLockedAchievements = [];

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
          const locked = achievements.filter((a) => a.achieved === 0);

          totalAchievements += achievements.length;
          totalUnlocked += unlocked.length;

          if (unlocked.length === achievements.length) {
            perfectGames++;
          }

          let globalPercentages = {};
          try {
            const globalRes = await fetch(
              `${STEAM_API_BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${game.appid}`,
            );
            const globalData = await globalRes.json();
            (globalData.achievementpercentages?.achievements || []).forEach((a) => {
              globalPercentages[a.name] = a.percent;
            });
          } catch {}

          for (const ach of unlocked) {
            const globalPercent = globalPercentages[ach.apiname];

            const achDetails = {
              name: ach.name || ach.apiname,
              game: game.name,
              globalPercent:
                globalPercent !== undefined
                  ? Math.round(globalPercent * 10) / 10
                  : null,
              unlockTime: ach.unlocktime,
            };

            allUnlockedAchievements.push(achDetails);

            if (globalPercent !== undefined) {
              if (
                !rarestAchievement ||
                globalPercent < rarestAchievement.globalPercent
              ) {
                rarestAchievement = achDetails;
              }
            }
          }

          if (locked.length > 0) {
            for (const ach of locked) {
              allLockedAchievements.push({
                name: ach.name || ach.apiname,
                game: game.name,
                globalPercent: null,
                unlockTime: 0,
                unlocked: false,
              });
            }
          }
        }

        // Small delay
        await new Promise((r) => setTimeout(r, 300));
      } catch {
        // Some games don't have achievements
        continue;
      }
    }

    // Filter out items without globalPercent, sort by global rarity (rarest first) and take top 4
    const rarestArray = allUnlockedAchievements
      .filter((a) => a.globalPercent !== null)
      .sort((a, b) => a.globalPercent - b.globalPercent)
      .slice(0, 4);

    // Also get recent achievements (fallback if rarest fails or no rarely achieved logs)
    let recentArray = [...allUnlockedAchievements]
      .sort((a, b) => (b.unlockTime || 0) - (a.unlockTime || 0))
      .slice(0, 4);

    if (recentArray.length === 0) {
      // If entirely zero unlocked achievements, use locked game achievements
      recentArray = [...allLockedAchievements].slice(0, 4);
    }

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

router.post("/compare", async (req, res) => {
  try {
    const apiKey = getSteamApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: "Steam API key not configured" });
    }

    const { steamIds } = req.body;

    if (!Array.isArray(steamIds) || steamIds.length === 0) {
      return res.status(400).json({ error: "steamIds must be a non-empty array" });
    }

    const uniqueSteamIds = [...new Set(steamIds)].filter(Boolean).slice(0, 6);

    const players = [];

    for (const steamId of uniqueSteamIds) {
      const base = await getOwnedGamesWithCacheValue(steamId);

      const economy = {
        costPerHour: base.costPerHour,
        unplayedPct:
          base.totalGames > 0
            ? Math.round((base.unplayedGames / base.totalGames) * 100)
            : 0,
        libraryValue: base.libraryValue,
        totalGames: base.totalGames,
        unplayed: base.unplayedGames,
      };

      const time = {
        totalHours: round(base.totalHours, 0),
        topGame: base.topGame?.name || "Sin datos",
        topGameHours: round(base.topGame?.hours || 0, 0),
        topGamePct: base.topGame?.percentOfTotal || 0,
      };

      const achievements = await getAchievementSummary(steamId, base.games);

      const radar = buildRadarMetrics({
        economy: {
          totalGames: economy.totalGames,
          costPerHour: economy.costPerHour,
        },
        time: {
          totalHours: time.totalHours,
          topGame: { percentOfTotal: time.topGamePct },
        },
        achievements,
      });

      players.push({
        steamId,
        economy,
        time,
        achievements,
        radar,
      });
    }

    scaleRadarScores(players);

    for (const player of players) {
      const archetype = getRadarArchetype(player.radar.scores);
      player.radar = {
        ...player.radar,
        ...archetype,
      };
    }

    res.json({ players });
  } catch (error) {
    console.error("Stats compare error:", error);
    res.status(500).json({ error: "Error fetching compare stats" });
  }
});

export default router;
