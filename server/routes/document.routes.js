'use strict';

const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const { generatePPTX } = require('../generators/pptx/index.js');
const { generateDOCX } = require('../generators/docx/index.js');
const { loadSensitiveWords, scanContent, sanitizeText, isBlocked } = require('../generators/common/sanitizer.js');
const { generateRefId } = require('../utils/referenceId.js');

function createRouter(db) {
  const router = Router();

  // List user's documents
  router.get('/', (req, res) => {
    const { status, doc_type, page = 1, limit = 20 } = req.query;
    let sql = 'SELECT * FROM documents WHERE author_id = ?';
    const params = [req.user.id];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (doc_type) { sql += ' AND doc_type = ?'; params.push(doc_type); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = db.prepare(countSql).get(...params).total;
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const data = db.prepare(sql).all(...params);
    res.json({ data, total: Number(total), page: Number(page), limit: Number(limit) });
  });

  // Generate document
  router.post('/generate', async (req, res) => {
    const { title, doc_type, template_name = 'business-blue', instruction = '', data_point_ids = [], brand_config_id, author_name } = req.body || {};
    if (!title) return res.status(400).json({ error: '请输入文档标题' });
    if (!doc_type || !['pptx', 'docx'].includes(doc_type)) return res.status(400).json({ error: '请选择文档类型 (pptx/docx)' });
    if (!data_point_ids.length) return res.status(400).json({ error: '请选择至少一个数据点' });

    // Load data points
    const placeholders = data_point_ids.map(() => '?').join(',');
    const points = db.prepare(`SELECT * FROM data_points WHERE id IN (${placeholders})`).all(...data_point_ids);
    if (!points.length) return res.status(400).json({ error: '未找到有效数据点' });

    // Load data sources
    const sourceIds = [...new Set(points.map((p) => p.source_id))];
    const srcPlaceholders = sourceIds.map(() => '?').join(',');
    const sources = srcPlaceholders.length
      ? db.prepare(`SELECT * FROM data_sources WHERE id IN (${srcPlaceholders})`).all(...sourceIds)
      : [];

    // Content scan (pre-check)
    const sensitiveWords = loadSensitiveWords(db);
    const allText = instruction + ' ' + points.map((p) => p.label + ' ' + p.value).join(' ');
    const findings = scanContent(allText, sensitiveWords);

    if (isBlocked(findings)) {
      return res.status(400).json({
        error: '内容扫描拦截：发现高危敏感词',
        findings: findings.filter((f) => f.severity === 'critical'),
      });
    }

    // Load brand config
    let brandConfig = {};
    try {
      const brandRow = brand_config_id
        ? db.prepare('SELECT config_json FROM brand_configs WHERE id = ?').get(brand_config_id)
        : db.prepare('SELECT config_json FROM brand_configs WHERE is_default = 1 LIMIT 1').get();
      if (brandRow) brandConfig = JSON.parse(brandRow.config_json);
    } catch (_) { /* use defaults */ }

    // Create document record
    const docResult = db.prepare(
      `INSERT INTO documents (title, doc_type, template_name, brand_config, author_id, status, instruction, data_point_ids, source_link_count)
       VALUES (?, ?, ?, ?, ?, 'generating', ?, ?, ?)`
    ).run(title, doc_type, template_name, JSON.stringify(brandConfig), req.user.id, instruction, JSON.stringify(data_point_ids), points.length);

    const docId = docResult.lastInsertRowid;

    try {
      // Generate document
      let result;
      if (doc_type === 'pptx') {
        result = await generatePPTX({ title, instruction, dataPoints: points, dataSources: sources, brandConfig, templateName: template_name, authorName: author_name });
      } else {
        result = await generateDOCX({ title, instruction, dataPoints: points, dataSources: sources, brandConfig });
      }

      const stats = fs.statSync(result.filePath);
      db.prepare(
        `UPDATE documents SET status = 'complete', file_path = ?, file_size = ?, source_link_count = ?, completed_at = datetime('now') WHERE id = ?`
      ).run(result.filePath, stats.size, points.length, docId);

      // Link data points
      const insertLink = db.prepare('INSERT OR IGNORE INTO document_data_points (document_id, data_point_id) VALUES (?, ?)');
      for (const pid of data_point_ids) {
        insertLink.run(docId, pid);
      }

      const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
      res.status(201).json({ document: doc, data_points_count: points.length, source_count: sources.length, sensitive_findings: findings });
    } catch (err) {
      db.prepare("UPDATE documents SET status = 'failed', completed_at = datetime('now') WHERE id = ?").run(docId);
      throw err;
    }
  });

  // Get document details
  router.get('/:id', (req, res) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND author_id = ?').get(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: '文档不存在' });

    const dataPointIds = JSON.parse(doc.data_point_ids || '[]');
    let points = [];
    if (dataPointIds.length) {
      const ph = dataPointIds.map(() => '?').join(',');
      points = db.prepare(`SELECT * FROM data_points WHERE id IN (${ph})`).all(...dataPointIds);
    }
    res.json({ document: doc, data_points: points });
  });

  // Download
  router.get('/:id/download', (req, res) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND author_id = ?').get(req.params.id, req.user.id);
    if (!doc || !doc.file_path) return res.status(404).json({ error: '文档文件不存在' });
    if (!fs.existsSync(doc.file_path)) return res.status(404).json({ error: '文件已丢失' });

    if (!doc.downloaded_at) {
      db.prepare("UPDATE documents SET downloaded_at = datetime('now') WHERE id = ?").run(doc.id);
    }

    const ext = doc.doc_type === 'pptx' ? '.pptx' : '.docx';
    res.download(doc.file_path, doc.title + ext);
  });

  // Delete
  router.delete('/:id', (req, res) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND author_id = ?').get(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ error: '文档不存在' });
    if (doc.file_path && fs.existsSync(doc.file_path)) fs.unlinkSync(doc.file_path);
    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createRouter };
