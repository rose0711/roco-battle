// ============================================================
// store.js — 简易发布订阅状态管理
// ============================================================

/**
 * 极简 Event Bus，用于模块间解耦通信。
 * 模块 emit 事件 → 其他模块的 listener 响应。
 */
class Store {
  constructor() {
    this._listeners = {};
  }

  /** 订阅事件 */
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return () => this.off(event, fn); // 返回取消订阅函数
  }

  /** 取消订阅 */
  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  }

  /** 触发事件 */
  emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(fn => fn(data));
  }
}

export const store = new Store();
