import mongoose from "mongoose";
import {
  validateCommentCreate,
  validateListCreate,
  validateModerationAction,
  validatePriceAlertCreate,
  validatePriceAlertUpdate,
  validateReportCreate,
  validateSessionCreate,
  validateSteamIdsPayload,
  validateWishlistCreate,
} from "../src/validation/validators.js";

describe("Request validators", () => {
  const objectId = new mongoose.Types.ObjectId().toString();
  const validSteamId = "12345678901234567";

  it("validateListCreate rejects missing fields", () => {
    const result = validateListCreate({});
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validateListCreate accepts valid payload", () => {
    const result = validateListCreate({
      title: "Lista de prueba",
      description: "Descripcion valida",
      categories: ["RPG"],
      coverImage: "https://example.com/cover.jpg",
      games: [{ appId: 10, name: "Juego" }],
    });
    expect(result.ok).toBe(true);
  });

  it("validateCommentCreate rejects long content", () => {
    const result = validateCommentCreate({
      content: "a".repeat(1001),
    });
    expect(result.ok).toBe(false);
  });

  it("validateSessionCreate accepts valid payload", () => {
    const result = validateSessionCreate({
      game: { appId: 42, name: "Juego" },
      date: "2026-12-10",
      time: "20:00",
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      participants: [{ steamId: validSteamId, username: "Amigo" }],
      notes: "",
    });
    expect(result.ok).toBe(true);
  });

  it("validateSessionCreate rejects past scheduledAt", () => {
    const result = validateSessionCreate({
      game: { appId: 42, name: "Juego" },
      date: "2020-12-10",
      time: "20:00",
      scheduledAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      participants: [{ steamId: validSteamId, username: "Amigo" }],
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === "in_past")).toBe(true);
  });

  it("validateModerationAction rejects invalid payload", () => {
    const result = validateModerationAction({
      userId: "bad",
      action: "nope",
      reason: "",
    });
    expect(result.ok).toBe(false);
  });

  it("validateModerationAction accepts duration and rejects invalid duration", () => {
    const validResult = validateModerationAction({
      userId: objectId,
      action: "banned",
      reason: "Spam",
      duration: 7,
    });
    expect(validResult.ok).toBe(true);
    expect(validResult.value.duration).toBe(7);

    const invalidResult = validateModerationAction({
      userId: objectId,
      action: "banned",
      reason: "Spam",
      duration: 0,
    });
    expect(invalidResult.ok).toBe(false);
    expect(
      invalidResult.errors.some((error) => error.field === "duration"),
    ).toBe(true);
  });

  it("validateReportCreate accepts valid payload", () => {
    const result = validateReportCreate({
      targetId: objectId,
      targetType: "list",
      reason: "Spam",
      description: "",
    });
    expect(result.ok).toBe(true);
  });

  it("validateWishlistCreate rejects missing title", () => {
    const result = validateWishlistCreate({ gameId: "123" });
    expect(result.ok).toBe(false);
  });

  it("validatePriceAlertCreate rejects invalid price", () => {
    const result = validatePriceAlertCreate({
      gameId: "123",
      title: "Juego",
      targetPrice: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("validatePriceAlertUpdate accepts enabled-only payload", () => {
    const result = validatePriceAlertUpdate({ enabled: false });
    expect(result.ok).toBe(true);
    expect(result.value.enabled).toBe(false);
  });

  it("validatePriceAlertUpdate requires payload", () => {
    const result = validatePriceAlertUpdate({});
    expect(result.ok).toBe(false);
  });

  it("validateSteamIdsPayload flags invalid ids outside test env", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    try {
      const result = validateSteamIdsPayload(["bad-id"], { min: 1, max: 6 });
      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.code === "invalid")).toBe(
        true,
      );
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("validateSteamIdsPayload accepts valid ids", () => {
    const result = validateSteamIdsPayload(
      [validSteamId, "12345678901234568"],
      { min: 2, max: 6 },
    );
    expect(result.ok).toBe(true);
    expect(result.value.length).toBe(2);
  });
});
