import mongoose from 'mongoose';
import Admin from '../src/models/Admin.js';
import AuditLog from '../src/models/AuditLog.js';
import ChatSession from '../src/models/ChatSession.js';
import Comment from '../src/models/Comment.js';
import GameCache from '../src/models/GameCache.js';
import GameList from '../src/models/GameList.js';
import GamingSession from '../src/models/GamingSession.js';
import ModerationAction from '../src/models/ModerationAction.js';
import Notification from '../src/models/Notification.js';
import Report from '../src/models/Report.js';
import User from '../src/models/User.js';

describe('Model Coverage', () => {
  it('Admin model', () => {
    expect(Admin.modelName).toBe('Admin');
  });
  it('AuditLog model', () => {
    expect(AuditLog.modelName).toBe('AuditLog');
  });
  it('ChatSession model', () => {
    expect(ChatSession.modelName).toBe('ChatSession');
  });
  it('Comment model', () => {
    expect(Comment.modelName).toBe('Comment');
  });
  it('GameCache model', () => {
    expect(GameCache.modelName).toBe('GameCache');
  });
  it('GameList model', () => {
    expect(GameList.modelName).toBe('GameList');
  });
  it('GamingSession model', () => {
    expect(GamingSession.modelName).toBe('GamingSession');
  });
  it('ModerationAction model', () => {
    expect(ModerationAction.modelName).toBe('ModerationAction');
  });
  it('Notification model', () => {
    expect(Notification.modelName).toBe('Notification');
  });
  it('Report model', () => {
    expect(Report.modelName).toBe('Report');
  });
  it('User model', () => {
    expect(User.modelName).toBe('User');
  });
});
