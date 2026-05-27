'use strict';

const { Router } = require('express');
const { createRouter: createAuthRouter } = require('./auth.routes.js');
const { createRouter: createDatasourceRouter } = require('./datasource.routes.js');
const { createRouter: createDocumentRouter } = require('./document.routes.js');
const { requireAuth } = require('../middleware/auth.js');

function mountRoutes(db) {
  const router = Router();

  // Public routes (no auth required)
  const authRouter = createAuthRouter(db);
  router.use('/api/auth', authRouter);

  // Protected routes (auth required)
  const protectedRouter = Router();
  protectedRouter.use(requireAuth);

  const datasourceRouter = createDatasourceRouter(db);
  protectedRouter.use('/datasources', datasourceRouter);

  const documentRouter = createDocumentRouter(db);
  protectedRouter.use('/documents', documentRouter);

  protectedRouter.use('/audit/logs', (req, res) => res.json({ data: [], total: 0 }));
  protectedRouter.use('/users', (req, res) => res.json({ data: [], total: 0 }));
  protectedRouter.get('/system/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  router.use('/api', protectedRouter);

  return router;
}

module.exports = { mountRoutes };
