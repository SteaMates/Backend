import mongoose from "mongoose";

/**
 * GamingSession
 *
 * Persisted "plan" for a gaming session:
 * - host creates it
 * - participants are invited and can accept/decline
 * - notifications are created for invited users
 */

const participantSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["invited", "accepted", "declined"],
      default: "invited",
      index: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const gamingSessionSchema = new mongoose.Schema(
  {
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    game: {
      appId: { type: Number, required: true },
      name: { type: String, required: true, trim: true },
      headerImage: { type: String, default: "" },
    },

    /**
     * Client-selected date/time preserved as strings.
     * This avoids confusion and makes UI rendering trivial.
     */
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    time: {
      type: String,
      required: true,
      match: /^\d{2}:\d{2}$/,
    },

    /**
     * Canonical timestamp used for sorting and upcoming filtering.
     * Recommended: client sends ISO based on its local timezone.
     */
    scheduledAt: {
      type: Date,
      required: true,
      index: true,
    },

    participants: {
      type: [participantSchema],
      default: [],
    },

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },

    status: {
      type: String,
      enum: ["scheduled", "cancelled"],
      default: "scheduled",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Query helpers / indexes
gamingSessionSchema.index({ host: 1, scheduledAt: 1 });
gamingSessionSchema.index({ "participants.user": 1, scheduledAt: 1 });

export default mongoose.model("GamingSession", gamingSessionSchema);
