'use strict';

const { Router } = require('express');
const bcrypt = require('bcryptjs');

function createRouter(db) {
  const router = Router();

  router.post('/register', (req, res) => {
    const { username, password, displayName, email, department } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码为必填项' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少需要6个字符' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, display_name, email, role, department) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(username, hash, displayName || '', email || '', 'viewer', department || '');
    const user = db.prepare('SELECT id, username, display_name, email, role, department, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.displayName = user.display_name;
    res.status(201).json({ user });
  });

  router.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.displayName = user.display_name;
    res.json({
      user: {
        id: user.id, username: user.username, display_name: user.display_name,
        email: user.email, role: user.role, department: user.department,
      },
    });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: '注销失败' });
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });

  router.get('/me', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '未登录' });
    const user = db.prepare('SELECT id, username, display_name, email, role, department FROM users WHERE id = ?').get(req.session.userId);
    res.json({ user });
  });

  return router;
}

module.exports = { createRouter };
