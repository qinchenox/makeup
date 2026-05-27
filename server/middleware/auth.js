'use strict';

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    req.user = {
      id: req.session.userId,
      username: req.session.username,
      role: req.session.role,
      displayName: req.session.displayName,
    };
    return next();
  }
  res.status(401).json({ error: '请先登录' });
}

module.exports = { requireAuth };
