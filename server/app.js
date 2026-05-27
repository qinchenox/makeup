'use strict';

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { initSupabase } = require('./config/database.js');
const { mountRoutes } = require('./routes/index.js');
const { errorHandler } = require('./middleware/errorHandler.js');

function createApp(options) {
  const opts = options || {};
  const app = express();

  // Express 5 default body limit is 100KB — bump to 500MB
  app.set('maxRequestBodySize', 500 * 1024 * 1024);

  // Initialize Supabase
  initSupabase();

  // Middleware stack
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ extended: true, limit: '500mb' }));

  // Session
  const sessionSecret = process.env.SESSION_SECRET || 'makeup-dev-secret-change-in-production';
  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    },
  }));

  // Multer error handling
  app.use((err, req, res, next) => {
    if (err && err.message && err.message.includes('File too large')) {
      return res.status(413).json({ error: '文件过大，最大支持500MB' });
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '文件过大，最大支持500MB' });
    }
    next(err);
  });

  // Routes
  app.use(mountRoutes());

  // Serve static client build in production
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    const filePath = path.join(clientDist, 'index.html');
    res.sendFile(filePath, (err) => { if (err) next(); });
  });

  // Error handler
  app.use(errorHandler);

  return { app };
}

module.exports = { createApp };
