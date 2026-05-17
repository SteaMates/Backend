/**
 * Nombre del fichero: index.js
 * Descripción: Fichero fuente de la aplicación SteaMates.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import MongoStore from "connect-mongo";
import passport from "passport";
import { connectDB } from "./config/database.js";
import { configureSteamStrategy } from "./config/passport.js";
import logger, { httpLogger } from "./config/logger.js";

import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import steamRoutes from "./routes/steam.js";
import statsRoutes from "./routes/stats.js";
import listsRoutes from "./routes/lists.js";
import moderationRoutes from "./routes/moderation.js";
import reportsRoutes from "./routes/reports.js";
import marketRoutes from "./routes/market.js";

// NUEVO
import sessionsRoutes from "./routes/sessions.js";
import notificationsRoutes from "./routes/notifications.js";
import siteRoutes from "./routes/site.js";

// Swagger
import swaggerUi from "swagger-ui-express";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const swaggerDocument = require("../swagger-output.json");

const app = express();
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Rate limiting — sin dependencias externas, almacenamiento en memoria
//   generalLimiter : 200 req / 15 min por IP  (rutas públicas)
//   authLimiter    : 30  req / 15 min por IP  (auth)
//   chatLimiter    : 30  req / 1  min por IP  (chat/Groq — límite real de Groq)
// ---------------------------------------------------------------------------
function buildRateLimiter({ windowMs = 15 * 60 * 1000, max = 200 } = {}) {
  const hits = new Map();

  // Limpiar entradas caducadas periódicamente para no acumular memoria
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.start > windowMs) hits.delete(key);
    }
  }, Math.min(windowMs, 5 * 60 * 1000)).unref();

  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next();

    const key = req.ip;
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', Math.ceil((entry.start + windowMs - now) / 1000));
      return res.status(429).json({ error: 'Demasiadas peticiones. Inténtalo más tarde.' });
    }

    return next();
  };
}

const generalLimiter = buildRateLimiter({ windowMs: 15 * 60 * 1000, max: 1000 });
const chatLimiter    = buildRateLimiter({ windowMs:      60 * 1000, max: 30  }); // Groq: 30 req/min

// Connect to MongoDB (SOLO SI NO ESTAMOS EN TESTS)
if (process.env.NODE_ENV !== 'test') {
  await connectDB();
}

// Middleware
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://localhost:4173",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(httpLogger);

// Session (required for Passport Steam)
app.set("trust proxy", 1);
app.use(
  session({
    store: MongoStore.create({
      mongoUrl:
        process.env.MONGODB_URI || "mongodb://localhost:27017/steamates",
      collectionName: "sessions",
      ttl: 24 * 60 * 60,
    }),
    secret: process.env.SESSION_SECRET || "steamates-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  }),
);

// Passport
configureSteamStrategy();
app.use(passport.initialize());
app.use(passport.session());

// ---------------------------------------------------------------------------
// Routes — v0 (legacy, sin prefijo /v1) + v1 (canónico)
// Ambos prefijos apuntan a los mismos routers para compatibilidad.
// ---------------------------------------------------------------------------
function registerRoutes(prefix) {
  app.use(`${prefix}/auth`,          generalLimiter, authRoutes);
  app.use(`${prefix}/chat`,          chatLimiter,    chatRoutes);
  app.use(`${prefix}/steam/stats`,   generalLimiter, statsRoutes);
  app.use(`${prefix}/steam`,         generalLimiter, steamRoutes);
  app.use(`${prefix}/lists`,         generalLimiter, listsRoutes);
  app.use(`${prefix}/reports`,       generalLimiter, reportsRoutes);
  app.use(`${prefix}/moderation`,    generalLimiter, moderationRoutes);
  app.use(`${prefix}/market`,        generalLimiter, marketRoutes);
  app.use(`${prefix}/sessions`,      generalLimiter, sessionsRoutes);
  app.use(`${prefix}/notifications`, generalLimiter, notificationsRoutes);
  app.use(`${prefix}/site`,          generalLimiter, siteRoutes);
}

registerRoutes("/api");     // rutas legacy (compatibilidad con frontend y Vercel)
registerRoutes("/api/v1");  // rutas versionadas (canónico)

// Swagger Documentation Route
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// SOLO SE INICIA EL SERVIDOR SI NO ESTAMOS PASANDO LOS TESTS
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, "0.0.0.0", () => {
    logger.info(
      `SteaMates server running on port ${PORT} [${
        process.env.NODE_ENV || "development"
      }]`,
    );
  });
}

// EXPORTAMOS LA APP PARA QUE JEST Y SUPERTEST PUEDAN USARLA
export default app;
