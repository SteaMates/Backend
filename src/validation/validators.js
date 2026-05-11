import mongoose from "mongoose";

const STEAM_ID_REGEX = /^\d{17}$/;

const MAX_LIST_TITLE = 120;
const MAX_LIST_DESCRIPTION = 1000;
const MAX_LIST_CATEGORIES = 10;
const MAX_LIST_GAMES = 50;
const MAX_GAME_NAME = 120;
const MAX_COMMENT_LENGTH = 1000;
const MAX_REPORT_DESCRIPTION = 500;
const MAX_REASON_LENGTH = 240;
const MAX_MARKET_TITLE = 200;
const MAX_URL_LENGTH = 500;

const REPORT_ALLOWED_REASONS = [
  "Spam",
  "Contenido Ofensivo",
  "Informacion Falsa",
  "Informaci\u00f3n Falsa",
  "Otros",
  "Nombre Ofensivo",
  "Imagen Inadecuada",
  "Se hace pasar por otra persona",
];

const trimValue = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const isObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(String(value || ""));

const addError = (errors, field, code, message) => {
  errors.push({ field, code, message });
};

const buildResult = (errors, value) => ({
  ok: errors.length === 0,
  errors,
  value,
});

export function validateListCreate(body) {
  const errors = [];

  const title = trimValue(body?.title);
  if (!title) addError(errors, "title", "required", "title is required");
  if (title.length > MAX_LIST_TITLE) {
    addError(
      errors,
      "title",
      "too_long",
      `title must be <= ${MAX_LIST_TITLE} chars`,
    );
  }

  const description = trimValue(body?.description);
  if (description.length > MAX_LIST_DESCRIPTION) {
    addError(
      errors,
      "description",
      "too_long",
      `description must be <= ${MAX_LIST_DESCRIPTION} chars`,
    );
  }

  const categoriesRaw = body?.categories;
  if (categoriesRaw !== undefined && !Array.isArray(categoriesRaw)) {
    addError(errors, "categories", "invalid", "categories must be an array");
  }
  const categories = Array.isArray(categoriesRaw)
    ? categoriesRaw.map((c) => trimValue(c)).filter(Boolean)
    : [];

  if (categories.length === 0) {
    addError(
      errors,
      "categories",
      "required",
      "at least 1 category is required",
    );
  } else if (categories.length > MAX_LIST_CATEGORIES) {
    addError(
      errors,
      "categories",
      "too_many",
      `categories must be <= ${MAX_LIST_CATEGORIES}`,
    );
  }

  const coverImage = trimValue(body?.coverImage);
  if (coverImage && coverImage.length > MAX_URL_LENGTH) {
    addError(errors, "coverImage", "too_long", "coverImage is too long");
  }

  const gamesRaw = body?.games;
  if (!Array.isArray(gamesRaw) || gamesRaw.length === 0) {
    addError(errors, "games", "required", "at least 1 game is required");
  }

  if (Array.isArray(gamesRaw) && gamesRaw.length > MAX_LIST_GAMES) {
    addError(errors, "games", "too_many", `games must be <= ${MAX_LIST_GAMES}`);
  }

  const games = Array.isArray(gamesRaw) ? gamesRaw : [];
  let invalidGame = false;

  const normalizedGames = games.map((game) => {
    const appId = toNumber(game?.appId ?? game?.appid);
    const name = trimValue(game?.name);
    const imageUrl = trimValue(game?.imageUrl || game?.headerImage);

    if (!appId || appId <= 0 || !name || name.length > MAX_GAME_NAME) {
      invalidGame = true;
    }

    if (imageUrl && imageUrl.length > MAX_URL_LENGTH) {
      invalidGame = true;
    }

    return {
      appId: appId || 0,
      name,
      imageUrl: imageUrl || undefined,
    };
  });

  if (games.length > 0 && invalidGame) {
    addError(errors, "games", "invalid", "games entries are invalid");
  }

  return buildResult(errors, {
    title,
    description,
    categories,
    coverImage,
    games: normalizedGames,
  });
}

export function validateCommentCreate(body) {
  const errors = [];
  const content = trimValue(body?.content);
  if (!content) addError(errors, "content", "required", "content is required");
  if (content.length > MAX_COMMENT_LENGTH) {
    addError(
      errors,
      "content",
      "too_long",
      `content must be <= ${MAX_COMMENT_LENGTH} chars`,
    );
  }

  const parentId = trimValue(body?.parentId);
  if (parentId && !isObjectId(parentId)) {
    addError(errors, "parentId", "invalid", "parentId is invalid");
  }

  return buildResult(errors, { content, parentId: parentId || null });
}

export function validateSessionCreate(body) {
  const errors = [];
  const game = body?.game || {};
  const appId = toNumber(game?.appId ?? game?.appid);
  const name = trimValue(game?.name);
  const headerImage = trimValue(game?.headerImage || game?.header_image || "");

  if (!appId || appId <= 0) {
    addError(errors, "game.appId", "required", "game.appId is required");
  }
  if (!name) addError(errors, "game.name", "required", "game.name is required");

  const date = trimValue(body?.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    addError(errors, "date", "invalid", "date must be YYYY-MM-DD");
  }

  const time = trimValue(body?.time);
  if (!/^\d{2}:\d{2}$/.test(time)) {
    addError(errors, "time", "invalid", "time must be HH:MM");
  }

  const scheduledAtRaw = body?.scheduledAt;
  const scheduledAt = new Date(scheduledAtRaw);
  if (!scheduledAtRaw || Number.isNaN(scheduledAt.getTime())) {
    addError(
      errors,
      "scheduledAt",
      "invalid",
      "scheduledAt must be a valid ISO date",
    );
  } else {
    const minTime = Date.now() - 5 * 60 * 1000;
    if (scheduledAt.getTime() < minTime) {
      addError(
        errors,
        "scheduledAt",
        "in_past",
        "scheduledAt must be in the future",
      );
    }
  }

  const participantsRaw = Array.isArray(body?.participants)
    ? body.participants
    : [];
  if (participantsRaw.length === 0) {
    addError(
      errors,
      "participants",
      "required",
      "at least 1 participant is required",
    );
  }

  const participants = participantsRaw.map((p) => ({
    steamId: trimValue(p?.steamId),
    username: trimValue(p?.username),
    avatar: trimValue(p?.avatar),
  }));

  const invalidParticipant = participants.some(
    (p) => !p.steamId || !p.username,
  );
  if (participantsRaw.length > 0 && invalidParticipant) {
    addError(
      errors,
      "participants",
      "invalid",
      "participants must include steamId and username",
    );
  }

  const notes = trimValue(body?.notes);
  if (notes.length > 500) {
    addError(errors, "notes", "too_long", "notes must be <= 500 chars");
  }

  return buildResult(errors, {
    appId: appId || 0,
    name,
    headerImage,
    date,
    time,
    scheduledAt,
    participants,
    notes,
    notifyFriends: body?.notifyFriends !== false,
  });
}

export function validateReportCreate(body) {
  const errors = [];
  const targetId = trimValue(body?.targetId);
  const targetType = trimValue(body?.targetType).toLowerCase();
  const reason = trimValue(body?.reason);
  const description = trimValue(body?.description);

  if (!targetId || !isObjectId(targetId)) {
    addError(errors, "targetId", "invalid", "targetId is invalid");
  }

  if (!targetType || !["list", "comment", "user"].includes(targetType)) {
    addError(errors, "targetType", "invalid", "targetType is invalid");
  }

  if (!reason) addError(errors, "reason", "required", "reason is required");
  if (reason && !REPORT_ALLOWED_REASONS.includes(reason)) {
    addError(errors, "reason", "invalid", "reason is invalid");
  }

  if (description.length > MAX_REPORT_DESCRIPTION) {
    addError(
      errors,
      "description",
      "too_long",
      `description must be <= ${MAX_REPORT_DESCRIPTION} chars`,
    );
  }

  return buildResult(errors, {
    targetId,
    targetType,
    reason,
    description,
  });
}

export function validateModerationAction(body) {
  const errors = [];
  const userId = trimValue(body?.userId);
  const action = trimValue(body?.action);
  const reason = trimValue(body?.reason);
  const durationRaw = body?.duration;

  if (!userId || !isObjectId(userId)) {
    addError(errors, "userId", "invalid", "userId is invalid");
  }

  if (
    !action ||
    !["warned", "silenced", "banned", "suspended"].includes(action)
  ) {
    addError(errors, "action", "invalid", "action is invalid");
  }

  if (!reason) addError(errors, "reason", "required", "reason is required");
  if (reason.length > MAX_REASON_LENGTH) {
    addError(
      errors,
      "reason",
      "too_long",
      `reason must be <= ${MAX_REASON_LENGTH} chars`,
    );
  }

  let duration = null;
  if (durationRaw !== undefined && durationRaw !== null && durationRaw !== "") {
    const parsed = Number(durationRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      addError(
        errors,
        "duration",
        "invalid",
        "duration must be a positive integer",
      );
    } else {
      duration = parsed;
    }
  }

  return buildResult(errors, { userId, action, reason, duration });
}

export function validateModerationReportResolution(body) {
  const errors = [];
  const status = trimValue(body?.status);
  const resolution = trimValue(body?.resolution);

  if (!status || !["pending", "resolved", "dismissed"].includes(status)) {
    addError(errors, "status", "invalid", "status is invalid");
  }

  if (resolution.length > MAX_REPORT_DESCRIPTION) {
    addError(
      errors,
      "resolution",
      "too_long",
      `resolution must be <= ${MAX_REPORT_DESCRIPTION} chars`,
    );
  }

  return buildResult(errors, { status, resolution });
}

export function validateWishlistCreate(body) {
  const errors = [];
  const steamAppId = trimValue(body?.steamAppId);
  const gameId = trimValue(body?.gameId);
  const title = trimValue(body?.title);
  const thumb = trimValue(body?.thumb);

  if (!title) addError(errors, "title", "required", "title is required");
  if (title.length > MAX_MARKET_TITLE) {
    addError(
      errors,
      "title",
      "too_long",
      `title must be <= ${MAX_MARKET_TITLE} chars`,
    );
  }

  if (!steamAppId && !gameId) {
    addError(
      errors,
      "steamAppId",
      "required",
      "steamAppId or gameId is required",
    );
  }

  if (steamAppId && steamAppId.length > 64) {
    addError(errors, "steamAppId", "too_long", "steamAppId is too long");
  }

  if (gameId && gameId.length > 64) {
    addError(errors, "gameId", "too_long", "gameId is too long");
  }

  if (thumb && thumb.length > MAX_URL_LENGTH) {
    addError(errors, "thumb", "too_long", "thumb is too long");
  }

  return buildResult(errors, { steamAppId, gameId, title, thumb });
}

export function validatePriceAlertCreate(body) {
  const errors = [];
  const steamAppId = trimValue(body?.steamAppId);
  const gameId = trimValue(body?.gameId);
  const title = trimValue(body?.title);
  const thumb = trimValue(body?.thumb);
  const targetPrice = toNumber(body?.targetPrice);

  if (!title) addError(errors, "title", "required", "title is required");
  if (title.length > MAX_MARKET_TITLE) {
    addError(
      errors,
      "title",
      "too_long",
      `title must be <= ${MAX_MARKET_TITLE} chars`,
    );
  }

  if (!steamAppId && !gameId) {
    addError(
      errors,
      "steamAppId",
      "required",
      "steamAppId or gameId is required",
    );
  }

  if (targetPrice === null || targetPrice <= 0) {
    addError(
      errors,
      "targetPrice",
      "invalid",
      "targetPrice must be greater than 0",
    );
  }

  if (thumb && thumb.length > MAX_URL_LENGTH) {
    addError(errors, "thumb", "too_long", "thumb is too long");
  }

  return buildResult(errors, { steamAppId, gameId, title, thumb, targetPrice });
}

export function validatePriceAlertUpdate(body) {
  const errors = [];
  const targetPriceRaw = body?.targetPrice;
  const enabled = body?.enabled;

  const hasTargetPrice = targetPriceRaw !== undefined;
  const hasEnabled = enabled !== undefined;

  if (!hasTargetPrice && !hasEnabled) {
    addError(
      errors,
      "payload",
      "empty",
      "payload must include targetPrice or enabled",
    );
  }

  const targetPrice = hasTargetPrice ? toNumber(targetPriceRaw) : null;
  if (hasTargetPrice && (targetPrice === null || targetPrice <= 0)) {
    addError(
      errors,
      "targetPrice",
      "invalid",
      "targetPrice must be greater than 0",
    );
  }

  return buildResult(errors, { targetPrice, enabled });
}

export function validateSteamIdsPayload(steamIds, options = {}) {
  const errors = [];
  const min = options.min ?? 1;
  const max = options.max ?? 6;

  if (!Array.isArray(steamIds) || steamIds.length < min) {
    addError(
      errors,
      "steamIds",
      "required",
      `steamIds must contain at least ${min} ids`,
    );
  }

  const normalized = Array.isArray(steamIds)
    ? [...new Set(steamIds.map((id) => trimValue(id)).filter(Boolean))]
    : [];

  if (normalized.length > max) {
    addError(errors, "steamIds", "too_many", `steamIds must be <= ${max}`);
  }

  const invalidIds = normalized.filter((id) => !STEAM_ID_REGEX.test(id));
  if (invalidIds.length > 0) {
    addError(
      errors,
      "steamIds",
      "invalid",
      "steamIds must be 17-digit strings",
    );
  }

  if (normalized.length < min) {
    addError(
      errors,
      "steamIds",
      "invalid",
      `steamIds must contain at least ${min} valid ids`,
    );
  }

  return buildResult(errors, normalized);
}
