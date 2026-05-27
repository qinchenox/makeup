'use strict';

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database.js');

function createRouter() {
  const router = Router();
  const supabase = getDb();

  router.post('/register', async (req, res) => {
    try {
      const { username, password, displayName, email, department } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: '用户名和密码为必填项' });
      if (password.length < 6) return res.status(400).json({ error: '密码至少需要6个字符' });

      const { data: existing } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
      if (existing) return res.status(409).json({ error: '用户名已存在' });

      const hash = bcrypt.hashSync(password, 10);
      const { data: user, error } = await supabase.from('users').insert({
        username, password_hash: hash, display_name: displayName || '',
        email: email || '', department: department || '', role: 'viewer',
      }).select('id, username, display_name, email, role, department, created_at').single();

      if (error) throw error;

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;
      req.session.displayName = user.display_name;

      res.status(201).json({ user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });

      const { data: user, error } = await supabase.from('users').select('*').eq('username', username).eq('is_active', true).maybeSingle();
      if (error || !user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

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
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: '注销失败' });
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });

  router.get('/me', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '未登录' });
    try {
      const { data: user } = await supabase.from('users')
        .select('id, username, display_name, email, role, department')
        .eq('id', req.session.userId).maybeSingle();
      res.json({ user: user || null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createRouter };
