'use strict';

/**
 * In-memory session store managing per-chat interactive state
 */
class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  get(chatId) {
    const key = String(chatId);
    return this.sessions.get(key) || null;
  }

  set(chatId, sessionData) {
    const key = String(chatId);
    const existing = this.sessions.get(key) || {};
    this.sessions.set(key, {
      ...existing,
      ...sessionData,
      updatedAt: Date.now(),
    });
    return this.sessions.get(key);
  }

  clear(chatId) {
    const key = String(chatId);
    const session = this.sessions.get(key);
    if (session?.timer) {
      clearTimeout(session.timer);
    }
    this.sessions.delete(key);
  }

  isAwaitingCaption(chatId) {
    const session = this.get(chatId);
    return session && session.status === 'AWAITING_CAPTION';
  }

  isPublishing(chatId) {
    const session = this.get(chatId);
    return session && session.status === 'PUBLISHING';
  }
}

const sessionStore = new SessionStore();
module.exports = sessionStore;
