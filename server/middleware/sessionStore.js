'use strict';

const { Store } = require('express-session');

class SqliteSessionStore extends Store {
  constructor(db) {
    super();
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS express_sessions (
      sid TEXT PRIMARY KEY, user_id INTEGER, data TEXT, expired_at TEXT)`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_express_sessions_exp ON express_sessions(expired_at)');
    this._timer = setInterval(() => this._prune(), 15 * 60 * 1000);
    this._timer.unref();
  }

  _prune() {
    try { this.db.prepare("DELETE FROM express_sessions WHERE expired_at < datetime('now')").run(); } catch (_) {}
  }

  get(sid, callback) {
    try {
      const row = this.db.prepare(
        "SELECT data FROM express_sessions WHERE sid = ? AND expired_at > datetime('now')"
      ).get(sid);
      callback(null, row ? JSON.parse(row.data) : null);
    } catch (e) { callback(e); }
  }

  set(sid, session, callback) {
    try {
      const maxAge = (session.cookie && session.cookie.maxAge) ? session.cookie.maxAge : 86400000;
      const expired = new Date(Date.now() + maxAge).toISOString();
      this.db.prepare(
        'INSERT OR REPLACE INTO express_sessions (sid, user_id, data, expired_at) VALUES (?, ?, ?, ?)'
      ).run(sid, session.userId || null, JSON.stringify(session), expired);
      callback(null);
    } catch (e) { callback(e); }
  }

  destroy(sid, callback) {
    try { this.db.prepare('DELETE FROM express_sessions WHERE sid = ?').run(sid); callback(null); }
    catch (e) { callback(e); }
  }

  touch(sid, session, callback) {
    try {
      const maxAge = (session.cookie && session.cookie.maxAge) ? session.cookie.maxAge : 86400000;
      this.db.prepare('UPDATE express_sessions SET expired_at = ? WHERE sid = ?')
        .run(new Date(Date.now() + maxAge).toISOString(), sid);
      callback(null);
    } catch (e) { callback(e); }
  }
}

module.exports = { SqliteSessionStore };
