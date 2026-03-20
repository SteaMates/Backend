import { Router } from "express";
import GamingSession from "../models/GamingSession.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { verifyToken } from "../middleware/auth.js";

const router = Router();

const NOTIFICATION_TTL_DAYS = Number(process.env.NOTIFICATIONS_TTL_DAYS || 30);

function expiresAtFromNow(days = NOTIFICATION_TTL_DAYS) {
  const ms = Math.max(1, days) * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

function uniqStrings(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

/**
 * Upsert a User by steamId.
 * We accept username/avatar as "best effort" for users that haven't logged in yet.
 */
async function upsertUserFromSteamProfile({ steamId, username, avatar }) {
  if (!steamId) return null;

  const safeUsername = username?.trim() || "Steam User";
  const safeAvatar = avatar || "";

  // IMPORTANT: do not override an existing user's stored profile.
  // The canonical profile is refreshed on real login via Passport Steam.
  return User.findOneAndUpdate(
    { steamId },
    {
      $setOnInsert: {
        steamId,
        username: safeUsername,
        avatar: safeAvatar,
      },
    },
    { new: true, upsert: true },
  );
}

/**
 * POST /api/sessions
 * Create a new gaming session and (optionally) create invite notifications.
 */
router.post("/", verifyToken, async (req, res) => {
  try {
    const { game, date, time, scheduledAt, participants, notes, notifyFriends } =
      req.body || {};

    const appId = game?.appId ?? game?.appid;
    const gameName = game?.name;
    const headerImage = game?.headerImage || game?.header_image || "";

    if (!appId || !gameName) {
      return res
        .status(400)
        .json({ error: "game.appId/appid and game.name are required" });
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }

    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ error: "time must be HH:MM" });
    }

    const scheduled = new Date(scheduledAt);
    if (!scheduledAt || Number.isNaN(scheduled.getTime())) {
      return res.status(400).json({ error: "scheduledAt must be an ISO date" });
    }

    // Participants can be passed as array of { steamId, username, avatar }
    const participantProfiles = Array.isArray(participants) ? participants : [];
    const participantSteamIds = uniqStrings(
      participantProfiles.map((p) => p?.steamId),
    ).filter((sid) => sid !== req.user.steamId);

    if (participantSteamIds.length === 0) {
      return res
        .status(400)
        .json({ error: "At least 1 participant is required" });
    }

    // Upsert users for all participants
    const participantUsers = [];
    for (const steamId of participantSteamIds) {
      const profile = participantProfiles.find((p) => p?.steamId === steamId);
      const userDoc = await upsertUserFromSteamProfile({
        steamId,
        username: profile?.username,
        avatar: profile?.avatar,
      });
      if (userDoc) participantUsers.push(userDoc);
    }

    const sessionDoc = await GamingSession.create({
      host: req.user._id,
      game: {
        appId: Number(appId),
        name: String(gameName),
        headerImage: String(headerImage || ""),
      },
      date,
      time,
      scheduledAt: scheduled,
      participants: participantUsers.map((u) => ({
        user: u._id,
        status: "invited",
      })),
      notes: notes || "",
      status: "scheduled",
    });

    // Create invite notifications (default: true)
    const shouldNotify = notifyFriends !== false;
    if (shouldNotify) {
      const expiresAt = expiresAtFromNow();
      const notifications = participantUsers.map((u) => ({
        recipient: u._id,
        from: req.user._id,
        type: "session_invite",
        title: "Invitación a sesión",
        message: `${req.user.username} te ha invitado a jugar a ${gameName} el ${date} a las ${time}.`,
        session: sessionDoc._id,
        data: {
          game: { appId: Number(appId), name: String(gameName), headerImage },
          date,
          time,
          scheduledAt: scheduled.toISOString(),
        },
        readAt: null,
        expiresAt,
      }));

      await Notification.insertMany(notifications);
    }

    const populated = await GamingSession.findById(sessionDoc._id)
      .populate("host", "steamId username avatar")
      .populate("participants.user", "steamId username avatar");

    return res.json({ session: populated });
  } catch (error) {
    console.error("Create session error:", error);
    return res.status(500).json({ error: "Error creating session" });
  }
});

/**
 * GET /api/sessions/mine
 * List sessions where current user is host or participant.
 */
router.get("/mine", verifyToken, async (req, res) => {
  try {
    const sessions = await GamingSession.find({
      $or: [{ host: req.user._id }, { "participants.user": req.user._id }],
    })
      .sort({ scheduledAt: 1 })
      .populate("host", "steamId username avatar")
      .populate("participants.user", "steamId username avatar");

    return res.json({ sessions });
  } catch (error) {
    console.error("List sessions error:", error);
    return res.status(500).json({ error: "Error fetching sessions" });
  }
});

/**
 * PATCH /api/sessions/:id/respond
 * Participant accepts or declines a session invite.
 * Body: { response: 'accepted' | 'declined' }
 */
router.patch("/:id/respond", verifyToken, async (req, res) => {
  try {
    const { response } = req.body || {};
    if (!response || !["accepted", "declined"].includes(response)) {
      return res
        .status(400)
        .json({ error: "response must be 'accepted' or 'declined'" });
    }

    const session = await GamingSession.findById(req.params.id)
      .populate("host", "steamId username avatar")
      .populate("participants.user", "steamId username avatar");

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.status === "cancelled") {
      return res.status(400).json({ error: "Session is cancelled" });
    }

    const me = req.user._id;
    const participant = session.participants.find((p) =>
      p.user?._id?.equals(me),
    );

    if (!participant) {
      return res.status(403).json({ error: "You are not a participant" });
    }

    participant.status = response;
    participant.respondedAt = new Date();
    await session.save();

    // Notify host about response
    const expiresAt = expiresAtFromNow();
    await Notification.create({
      recipient: session.host._id,
      from: req.user._id,
      type: "session_response",
      title: "Respuesta a invitación",
      message: `${req.user.username} ha ${
        response === "accepted" ? "aceptado" : "rechazado"
      } la sesión de ${session.game.name} (${session.date} ${session.time}).`,
      session: session._id,
      data: {
        response,
        game: session.game,
        date: session.date,
        time: session.time,
      },
      readAt: null,
      expiresAt,
    });

    const updated = await GamingSession.findById(session._id)
      .populate("host", "steamId username avatar")
      .populate("participants.user", "steamId username avatar");

    return res.json({ session: updated });
  } catch (error) {
    console.error("Respond session error:", error);
    return res.status(500).json({ error: "Error responding to session" });
  }
});

/**
 * PATCH /api/sessions/:id/cancel
 * Only host can cancel the session.
 */
router.patch("/:id/cancel", verifyToken, async (req, res) => {
  try {
    const session = await GamingSession.findById(req.params.id)
      .populate("host", "steamId username avatar")
      .populate("participants.user", "steamId username avatar");

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (!session.host._id.equals(req.user._id)) {
      return res.status(403).json({ error: "Only host can cancel" });
    }

    if (session.status === "cancelled") {
      return res.json({ session });
    }

    session.status = "cancelled";
    await session.save();

    // Notify participants
    const expiresAt = expiresAtFromNow();
    const participantUsers = session.participants
      .map((p) => p.user)
      .filter(Boolean);

    if (participantUsers.length > 0) {
      await Notification.insertMany(
        participantUsers.map((u) => ({
          recipient: u._id,
          from: req.user._id,
          type: "session_cancelled",
          title: "Sesión cancelada",
          message: `${req.user.username} ha cancelado la sesión de ${session.game.name} (${session.date} ${session.time}).`,
          session: session._id,
          data: {
            game: session.game,
            date: session.date,
            time: session.time,
          },
          readAt: null,
          expiresAt,
        })),
      );
    }

    const updated = await GamingSession.findById(session._id)
      .populate("host", "steamId username avatar")
      .populate("participants.user", "steamId username avatar");

    return res.json({ session: updated });
  } catch (error) {
    console.error("Cancel session error:", error);
    return res.status(500).json({ error: "Error cancelling session" });
  }
});

export default router;
