import { Router } from 'express';
import Groq from 'groq-sdk';
import ChatSession from '../models/ChatSession.js';

const router = Router();
const STEAM_API_BASE = 'https://api.steampowered.com';

// Base system prompt for the gaming assistant
const SYSTEM_PROMPT_BASE = `Eres SteaMate AI, un asistente experto en videojuegos de Steam. Tu personalidad es amigable, entusiasta y conocedora.

Tus capacidades:
- Recomendar juegos basado en los gustos REALES del usuario (tienes acceso a su biblioteca de Steam)
- Informar sobre ofertas y precios en Steam
- Sugerir juegos cooperativos para jugar con sus amigos reales
- Analizar géneros y dar recomendaciones personalizadas basadas en su historial
- Hablar sobre noticias y tendencias de gaming
- Ayudar a descubrir juegos indie ocultos similares a los que ya juega
- Entender el CONTEXTO de lo que el usuario está viendo en pantalla cuando te lo comparte
// FUTURO: **VER Y ANALIZAR IMÁGENES O CAPTURAS DE PANTALLA** que el usuario comparta (requiere API con modelo de visión)

Reglas:
- Responde siempre en español
- Sé conciso pero informativo 
- Usa negritas para nombres de juegos
- Incluye precios aproximados cuando sea relevante
- Sé honesto cuando no tengas información suficiente
- Prioriza la personalización de la respuesta usando biblioteca, amigos y contexto antes que respuestas genéricas
- Mantén un tono casual y gamer
- Usa los datos de la biblioteca y amigos del usuario para personalizar tus respuestas
- Cuando recomiendes juegos, ten en cuenta lo que ya tiene y lo que juega más
- Si el usuario pregunta por juegos cooperativos, mira qué amigos están online y qué juegan
- Si el usuario comparte el contexto de su pantalla, usa esa información para dar respuestas más relevantes

Formato de respuesta:
- Máximo 2-3 párrafos
- Si haces recomendaciones, prioriza una lista breve de 3 opciones como máximo
- Para cada juego recomendado, explica en una frase por qué encaja con el usuario
- Evita respuestas largas, repetitivas o demasiado genéricas`;

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    return null;
  }
  // Soporte automático para OpenRouter si la key empieza por sk-or-
  const baseURL = apiKey.startsWith('sk-or-') ? 'https://openrouter.ai/api/v1' : undefined;
  return new Groq({ apiKey, baseURL });
}

function getSteamApiKey() {
  const key = process.env.STEAM_API_KEY;
  if (!key || key === 'your_steam_api_key_here') return null;
  return key;
}

// Fetch Steam data for a user to build AI context
async function fetchSteamContext(steamId) {
  const apiKey = getSteamApiKey();
  if (!apiKey || !steamId) return null;

  try {
    // Fetch profile, owned games, recent games, and friends in parallel
    const [profileRes, gamesRes, recentRes, friendsRes] = await Promise.all([
      fetch(`${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`)
        .then(r => r.json()).catch(() => null),
      fetch(`${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`)
        .then(r => r.json()).catch(() => null),
      fetch(`${STEAM_API_BASE}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${apiKey}&steamid=${steamId}&count=10&format=json`)
        .then(r => r.json()).catch(() => null),
      fetch(`${STEAM_API_BASE}/ISteamUser/GetFriendList/v0001/?key=${apiKey}&steamid=${steamId}&relationship=friend`)
        .then(r => r.json()).catch(() => null),
    ]);

    const profile = profileRes?.response?.players?.[0];
    const allGames = gamesRes?.response?.games || [];
    const recentGames = recentRes?.response?.games || [];
    const friendsList = friendsRes?.friendslist?.friends || [];

    // Get friend profiles (max 25 for context size)
    let friendProfiles = [];
    if (friendsList.length > 0) {
      const friendIds = friendsList.slice(0, 25).map(f => f.steamid).join(',');
      try {
        const fpRes = await fetch(
          `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${friendIds}`
        );
        const fpData = await fpRes.json();
        friendProfiles = fpData.response?.players || [];
      } catch {
        // ignore
      }
    }

    // Sort games by playtime
    const topGames = [...allGames]
      .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
      .slice(0, 30);

    return { profile, topGames, recentGames, friendProfiles, totalGames: allGames.length };
  } catch (error) {
    console.error('Error fetching Steam context:', error);
    return null;
  }
}

// Build a context string from Steam data
function buildSteamContextPrompt(data) {
  if (!data) return '';

  const lines = ['\n\n--- DATOS DEL USUARIO DE STEAM (usa esta información para personalizar tus respuestas) ---'];

  if (data.profile) {
    lines.push(`\nUsuario: ${data.profile.personaname}`);
    const statusMap = { 0: 'Offline', 1: 'Online', 2: 'Ocupado', 3: 'Ausente', 6: 'Jugando' };
    lines.push(`Estado: ${statusMap[data.profile.personastate] || 'Desconocido'}`);
    if (data.profile.gameextrainfo) {
      lines.push(`Jugando ahora: ${data.profile.gameextrainfo}`);
    }
  }

  lines.push(`\nTotal de juegos en biblioteca: ${data.totalGames}`);

  if (data.topGames && data.topGames.length > 0) {
    lines.push('\n📊 TOP JUEGOS MÁS JUGADOS:');
    data.topGames.forEach((g, i) => {
      const hours = Math.round((g.playtime_forever || 0) / 60);
      lines.push(`${i + 1}. ${g.name} — ${hours}h jugadas`);
    });
  }

  if (data.recentGames && data.recentGames.length > 0) {
    lines.push('\n🕹️ JUEGOS RECIENTES (últimas 2 semanas):');
    data.recentGames.forEach(g => {
      const hours2w = Math.round((g.playtime_2weeks || 0) / 60);
      const hoursTotal = Math.round((g.playtime_forever || 0) / 60);
      lines.push(`- ${g.name} — ${hours2w}h recientes (${hoursTotal}h totales)`);
    });
  }

  if (data.friendProfiles && data.friendProfiles.length > 0) {
    lines.push('\n👥 AMIGOS DE STEAM:');
    const statusMap = { 0: 'Offline', 1: 'Online', 2: 'Ocupado', 3: 'Ausente', 4: 'Durmiendo', 5: 'Trade', 6: 'Jugando' };
    data.friendProfiles.forEach(f => {
      let info = `- ${f.personaname} (${statusMap[f.personastate] || 'offline'})`;
      if (f.gameextrainfo) {
        info += ` — jugando ${f.gameextrainfo}`;
      }
      lines.push(info);
    });
  }

  lines.push('\n--- FIN DATOS STEAM ---');
  return lines.join('\n');
}

// Cache Steam context per user (refresh every 5 minutes)
const steamContextCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function getSteamContextCached(steamId) {
  if (!steamId) return null;
  
  const cached = steamContextCache.get(steamId);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

  const data = await fetchSteamContext(steamId);
  if (data) {
    steamContextCache.set(steamId, { data, timestamp: Date.now() });
  }
  return data;
}

function parseRecommendationResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  const clean = rawText.replace(/```json|```/gi, '').trim();
  const tryParse = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(clean);

  if (!parsed) {
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      parsed = tryParse(clean.slice(start, end + 1));
    }
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.recommendations)
      ? parsed.recommendations
      : [];

  return list
    .map((item) => ({
      title: String(item?.title || item?.name || '').trim(),
      reason: String(item?.reason || item?.why || '').trim(),
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, 12);
}

function pickBestCheapSharkDeal(rawDeals) {
  if (!Array.isArray(rawDeals) || rawDeals.length === 0) return null;

  const valid = rawDeals.filter((deal) => Number.parseFloat(deal?.savings || '0') > 0);
  if (valid.length === 0) return null;

  return valid.sort(
    (a, b) => Number.parseFloat(b?.savings || '0') - Number.parseFloat(a?.savings || '0')
  )[0];
}

// POST /api/chat/market-recommendations - Personalized recommendations (Groq + CheapShark)
router.post('/market-recommendations', async (req, res) => {
  try {
    const { steamId, limit } = req.body || {};

    if (!steamId || typeof steamId !== 'string') {
      return res.status(400).json({ error: 'steamId is required' });
    }

    const maxItems = Math.min(Math.max(Number(limit) || 6, 1), 12);

    const groq = getGroqClient();
    if (!groq) {
      return res.status(503).json({
        error: 'Groq API key not configured',
        hint: 'Add GROQ_API_KEY to server/.env — get one at https://console.groq.com/keys'
      });
    }

    const steamData = await getSteamContextCached(steamId);
    const topGames = (steamData?.topGames || [])
      .map((g) => g?.name)
      .filter(Boolean)
      .slice(0, 20);

    if (topGames.length === 0) {
      return res.json({ deals: [] });
    }

    const lowerOwned = new Set(topGames.map((name) => name.toLowerCase()));

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.35,
      max_tokens: 700,
      top_p: 0.9,
      messages: [
        {
          role: 'system',
          content:
            'Eres un recomendador de juegos de Steam. Devuelve SIEMPRE JSON válido, sin markdown, sin texto extra. Formato exacto: [{"title":"string","reason":"string"}]',
        },
        {
          role: 'user',
          content:
            `Estos son los juegos más jugados del usuario: ${topGames.join(', ')}. ` +
            'Recomienda 10 juegos de PC en Steam que encajen con sus gustos y NO estén ya en su biblioteca. ' +
            'Cada elemento debe incluir title y reason (máximo 1 frase).',
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content || '[]';
    const recommendations = parseRecommendationResponse(rawContent)
      .filter((rec) => !lowerOwned.has(rec.title.toLowerCase()))
      .slice(0, 10);

    if (recommendations.length === 0) {
      return res.json({ deals: [] });
    }

    const foundDeals = [];
    const seen = new Set();

    for (const rec of recommendations) {
      const url = new URL('https://www.cheapshark.com/api/1.0/deals');
      url.searchParams.set('title', rec.title);
      url.searchParams.set('storeID', '1');
      url.searchParams.set('pageSize', '8');
      url.searchParams.set('sortBy', 'Savings');
      url.searchParams.set('desc', '1');

      try {
        const dealResponse = await fetch(url);
        if (!dealResponse.ok) continue;

        const dealList = await dealResponse.json();
        const best = pickBestCheapSharkDeal(dealList);
        if (!best) continue;

        const uniqueKey = best.steamAppID || best.gameID || best.dealID || rec.title.toLowerCase();
        if (seen.has(uniqueKey)) continue;

        seen.add(uniqueKey);
        foundDeals.push({ ...best, reason: rec.reason });

        if (foundDeals.length >= maxItems) break;
      } catch {
        // Ignore individual title failures and keep trying others.
      }
    }

    return res.json({ deals: foundDeals });
  } catch (error) {
    console.error('Market recommendations error:', error);
    return res.status(500).json({ error: 'Error generating market recommendations' });
  }
});

// POST /api/chat/message - Send a message and get AI response (with optional screen context)
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId, userId, steamId, screenContext, includeSteamContext, image } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const groq = getGroqClient();
    if (!groq) {
      return res.status(503).json({
        error: 'Groq API key not configured',
        hint: 'Add GROQ_API_KEY to server/.env — get one at https://console.groq.com/keys'
      });
    }

    // Load or create chat session
    let session;
    if (sessionId) {
      session = await ChatSession.findById(sessionId);
    }
    if (!session) {
      session = new ChatSession({
        userId: userId || 'anonymous',
        messages: [],
      });
    }

    // Build the user message with optional screen context
    let userMessageContent = message;
    if (screenContext) {
      userMessageContent = `${message}\n\n--- CONTEXTO DE PANTALLA ---\n${screenContext}\n--- FIN CONTEXTO ---`;
    }

    // Add user message
    session.messages.push({
      role: 'user',
      content: userMessageContent,
      hasImage: !!image
    });

    // Fetch Steam context ONLY if includeSteamContext is true (default true for backwards compatibility)
    const shouldIncludeSteam = includeSteamContext !== false;
    const steamData = shouldIncludeSteam ? await getSteamContextCached(steamId || userId) : null;
    const steamContext = shouldIncludeSteam ? buildSteamContextPrompt(steamData) : '';
    const fullSystemPrompt = SYSTEM_PROMPT_BASE + steamContext;

    // Build messages for Groq (include recent history for context, max 20 messages)
    const recentMessages = session.messages.slice(-20);

    // Determine which model to use based on whether we have an image
    const hasVision = !!image;
    
    // Cambiado al modelo solicitado meta-llama/llama-4-scout-17b-16e-instruct para imágenes
    // OJO: asegurate de que estés en un endpoint compatible con la ruta o que Groq suporte esta cadena,
    // de lo contrario este modelo podría estar en ruta diferente.
    const model = hasVision ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.3-70b-versatile';

    let groqMessages;

    if (hasVision) {
      // Vision models on some APIs (like Groq or certain OpenRouter endpoints) 
      // often reject multi-turn history when images are included, 
      // or require strictly format compliance. We send only the system prompt + image message.
      groqMessages = [
        { role: 'system', content: fullSystemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userMessageContent },
            {
              type: 'image_url',
              image_url: { url: image } // base64 data URL
            }
          ]
        }
      ];
    } else {
      // Text-only model
      groqMessages = [
        { role: 'system', content: fullSystemPrompt },
        ...recentMessages.map(m => ({
          role: m.role === 'system' ? 'assistant' : m.role,
          content: m.content,
        })),
      ];
    }

    // Call Groq API
    const completion = await groq.chat.completions.create({
      model,
      messages: groqMessages,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 0.9,
    });

    const aiResponse = completion.choices[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';

    // Save assistant response
    session.messages.push({ role: 'assistant', content: aiResponse });
    await session.save();

    res.json({
      response: aiResponse,
      sessionId: session._id,
    });
  } catch (error) {
    console.error('Chat error:', error);

    if (error?.status === 401) {
      return res.status(401).json({ error: 'Invalid Groq API key' });
    }
    if (error?.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment.' });
    }

    res.status(500).json({ error: 'Error processing chat message' });
  }
});

// GET /api/chat/history/:sessionId - Get chat history
router.get('/history/:sessionId', async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ messages: session.messages, sessionId: session._id });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching chat history' });
  }
});

export default router;
