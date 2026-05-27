'use strict';

const { Router } = require('express');
const { createRouter: createAuthRouter } = require('./auth.routes.js');
const { createRouter: createDatasourceRouter } = require('./datasource.routes.js');
const { createRouter: createDocumentRouter } = require('./document.routes.js');
const { createRouter: createConvertRouter } = require('./convert.routes.js');
const { createRouter: createKnowledgeRouter } = require('./knowledge.routes.js');
const { requireAuth } = require('../middleware/auth.js');

function mountRoutes() {
  const router = Router();

  // Public routes (no auth required)
  router.use('/api/auth', createAuthRouter());

  // Protected routes
  const protectedRouter = Router();
  protectedRouter.use(requireAuth);

  protectedRouter.use('/datasources', createDatasourceRouter());
  protectedRouter.use('/documents', createDocumentRouter());
  protectedRouter.use('/convert', createConvertRouter());
  protectedRouter.use('/knowledge', createKnowledgeRouter());
  protectedRouter.get('/audit/logs', (req, res) => res.json({ data: [], total: 0 }));
  protectedRouter.get('/users', (req, res) => res.json({ data: [], total: 0 }));
  protectedRouter.get('/system/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  router.use('/api', protectedRouter);

  return router;
}

module.exports = { mountRoutes };
