'use strict';

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { initDatabase } = require('./config/database.js');
const { mountRoutes } = require('./routes/index.js');
const { errorHandler } = require('./middleware/errorHandler.js');

function createApp(options) {
  const opts = options || {};
  const app = express();

  // Database
  const dbPath = opts.dbPath || path.join(__dirname, 'database', 'makeup.db');
  const db = initDatabase(dbPath);
  app.locals.db = db;

  // Middleware stack
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));

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

  // Routes
  app.use(mountRoutes(db));

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

  return { app, db };
}

module.exports = { createApp };
