import mongoose from "mongoose";

/**
 * Notification
 *
 * In-app notifications persisted in MongoDB.
 *
 * Notes on retention:
 * - We use an `expiresAt` field with a TTL index (expireAfterSeconds: 0)
 *   so each notification can expire at a specific time.
 */

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    type: {
      type: String,
      enum: [
        "session_invite",
        "session_response",
        "session_cancelled",
        "session_updated",
        "price_alert_triggered",
      ],
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    // Optional "pointer" to a session, so the client can navigate.
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GamingSession",
      default: null,
      index: true,
    },

    // Any extra payload the UI might use.
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    readAt: {
      type: Date,
      default: null,
      index: true,
    },

    // TTL field. With expireAfterSeconds: 0, the document expires at this exact date.
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// TTL index: expire documents at `expiresAt`.
// MongoDB will remove them asynchronously in the background.
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Common query pattern: list notifications for a user ordered by time.
notificationSchema.index({ recipient: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
