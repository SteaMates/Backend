/**
 * Nombre del fichero: Notification.js
 * Descripción: Fichero fuente de la aplicación SteaMates.
 * Autor: Adrián Artigas Subiras, Adrián Becerril Granada, Pablo Nicolás Fabra Roque, Enrique Baldovin Cotela, Adrián Nasarre
 */
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
        "list_mention" 
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
    // index: true se omite aquí porque el TTL index ya se define abajo con schema.index()
    expiresAt: {
      type: Date,
      required: true,
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
