import mongoose from "mongoose";
import { jest } from "@jest/globals";
import Admin from "../src/models/Admin.js";
import AuditLog from "../src/models/AuditLog.js";
import ChatSession from "../src/models/ChatSession.js";
import Comment from "../src/models/Comment.js";
import GameCache from "../src/models/GameCache.js";
import GameList from "../src/models/GameList.js";
import GamingSession from "../src/models/GamingSession.js";
import ModerationAction from "../src/models/ModerationAction.js";
import Notification from "../src/models/Notification.js";
import Report from "../src/models/Report.js";
import User from "../src/models/User.js";

describe("Model Coverage", () => {
  it("Admin model", () => {
    expect(Admin.modelName).toBe("Admin");
  });
  it("AuditLog model", () => {
    expect(AuditLog.modelName).toBe("AuditLog");
  });
  it("ChatSession model", () => {
    expect(ChatSession.modelName).toBe("ChatSession");
  });
  it("ChatSession pre-save hook updates updatedAt", () => {
    const preSaveHooks = ChatSession.schema.s.hooks._pres.get("save") || [];
    const customHook = preSaveHooks.find((hook) =>
      String(hook.fn).includes("this.updatedAt = new Date()"),
    );
    expect(customHook).toBeDefined();

    const doc = new ChatSession({
      userId: new mongoose.Types.ObjectId().toString(),
    });
    doc.updatedAt = new Date("2000-01-01T00:00:00.000Z");
    const next = jest.fn();

    customHook.fn.call(doc, next);

    expect(doc.updatedAt.getTime()).toBeGreaterThan(
      new Date("2000-01-01T00:00:00.000Z").getTime(),
    );
    expect(next).toHaveBeenCalled();
  });
  it("Comment model", () => {
    expect(Comment.modelName).toBe("Comment");
  });
  it("GameCache model", () => {
    expect(GameCache.modelName).toBe("GameCache");
  });
  it("GameList model", () => {
    expect(GameList.modelName).toBe("GameList");
  });
  it("GamingSession model", () => {
    expect(GamingSession.modelName).toBe("GamingSession");
  });
  it("ModerationAction model", () => {
    expect(ModerationAction.modelName).toBe("ModerationAction");
  });
  it("Notification model", () => {
    expect(Notification.modelName).toBe("Notification");
  });
  it("Report model", () => {
    expect(Report.modelName).toBe("Report");
  });
  it("User model", () => {
    expect(User.modelName).toBe("User");
  });
});
