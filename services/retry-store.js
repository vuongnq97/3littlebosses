'use strict';

/**
 * Quản lý các phiên Thử lại (Retry) cho các kênh đăng tải bị lỗi
 */
class RetryStore {
  constructor() {
    this.store = new Map();

    // Định kỳ dọn dẹp các phiên quá 2 giờ
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, val] of this.store.entries()) {
        if (now - val.createdAt > 2 * 60 * 60 * 1000) {
          this.store.delete(key);
        }
      }
    }, 15 * 60 * 1000);

    if (cleanupInterval && typeof cleanupInterval.unref === 'function') {
      cleanupInterval.unref();
    }
  }

  create(data) {
    const id = 'r_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    this.store.set(id, {
      ...data,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  }

  get(id) {
    return this.store.get(id) || null;
  }

  update(id, data) {
    const existing = this.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...data,
      updatedAt: Date.now(),
    };
    this.store.set(id, updated);
    return updated;
  }

  delete(id) {
    this.store.delete(id);
  }
}

const retryStore = new RetryStore();
module.exports = retryStore;
