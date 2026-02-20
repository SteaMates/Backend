# SteaMates Backend

API server for SteaMates — Express.js + MongoDB + Groq AI + Steam Web API.

## Tech Stack

- **Runtime:** Node.js (ESM)
- **Framework:** Express.js
- **Database:** MongoDB Atlas (Mongoose)
- **AI:** Groq SDK (llama-3.3-70b-versatile)
- **Auth:** Steam OpenID (passport-steam)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template and fill in your keys
cp .env.example .env

# 3. Start development server (auto-restart on changes)
npm run dev

# Or start production server
npm start
```

The server runs on `http://localhost:3001` by default.

## Environment Variables

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `GROQ_API_KEY` | Groq API key ([get one](https://console.groq.com/keys)) |
| `STEAM_API_KEY` | Steam Web API key ([get one](https://steamcommunity.com/dev/apikey)) |
| `SESSION_SECRET` | Random string for session encryption |
| `CLIENT_URL` | Frontend URL for CORS (default: `http://localhost:5173`) |
| `BACKEND_URL` | Backend URL for Steam callback (default: `http://localhost:3001`) |
| `PORT` | Server port (default: `3001`) |

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/steam` | Redirect to Steam login |
| GET | `/api/auth/steam/callback` | Steam login callback |
| GET | `/api/auth/me` | Get current user session |
| POST | `/api/auth/logout` | Log out |

### AI Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/message` | Send message, get AI response |
| GET | `/api/chat/history/:sessionId` | Get chat history |

### Steam Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/steam/profile/:steamId` | User profile |
| GET | `/api/steam/games/:steamId` | Owned games |
| GET | `/api/steam/friends/:steamId` | Friends list |
| GET | `/api/steam/recent/:steamId` | Recently played |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |

## Project Structure

```
src/
├── index.js              # Express server setup
├── config/
│   ├── database.js       # MongoDB connection
│   └── passport.js       # Steam OpenID strategy
├── models/
│   ├── User.js           # User schema
│   └── ChatSession.js    # Chat history schema
└── routes/
    ├── auth.js           # Steam authentication
    ├── chat.js           # AI chat with Steam context
    └── steam.js          # Steam Web API proxy
```
