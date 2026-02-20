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

Reglas:
- Responde siempre en español
- Sé conciso pero informativo (máximo 2-3 párrafos)
- Usa **negritas** para nombres de juegos
- Incluye precios aproximados cuando sea relevante
- Si no conoces un juego específico, sé honesto
- Mantén un tono casual y gamer
- IMPORTANTE: Usa activamente los datos de la biblioteca y amigos del usuario para personalizar tus respuestas
- Cuando recomiendes juegos, ten en cuenta lo que ya tiene y lo que juega más
- Si el usuario pregunta por juegos cooperativos, mira qué amigos están online y qué juegan`;

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    return null;
  }
  return new Groq({ apiKey });
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

// POST /api/chat/message - Send a message and get AI response
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId, userId, steamId } = req.body;

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

    // Add user message
    session.messages.push({ role: 'user', content: message });

    // Fetch Steam context for personalized responses
    const steamData = await getSteamContextCached(steamId || userId);
    const steamContext = buildSteamContextPrompt(steamData);
    const fullSystemPrompt = SYSTEM_PROMPT_BASE + steamContext;

    // Build messages for Groq (include recent history for context, max 20 messages)
    const recentMessages = session.messages.slice(-20);
    const groqMessages = [
      { role: 'system', content: fullSystemPrompt },
      ...recentMessages.map(m => ({
        role: m.role === 'system' ? 'assistant' : m.role,
        content: m.content,
      })),
    ];

    // Call Groq API
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
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
