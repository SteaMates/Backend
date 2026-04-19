import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import MongoStore from "connect-mongo";
import passport from "passport";
import { connectDB } from "./config/database.js";
import { configureSteamStrategy } from "./config/passport.js";

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

// Swagger
import swaggerUi from "swagger-ui-express";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const swaggerDocument = require("../swagger-output.json");

const app = express();
const PORT = process.env.PORT || 3001;

// Connect to MongoDB
await connectDB();

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

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/steam", steamRoutes);
app.use("/api/steam/stats", statsRoutes);
app.use("/api/lists", listsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/moderation", moderationRoutes);
app.use("/api/market", marketRoutes);

// NUEVO
app.use("/api/sessions", sessionsRoutes);
app.use("/api/notifications", notificationsRoutes);

// Swagger Documentation Route
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `🚀 SteaMates server running on port ${PORT} [${
      process.env.NODE_ENV || "development"
    }]`,
  );
});
