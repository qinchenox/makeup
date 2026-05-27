'use strict';

const { Router } = require('express');
const { upload } = require('../middleware/fileUpload.js');
const { parseFile } = require('../utils/fileParser.js');
const { parseImage } = require('../utils/imageParser.js');
const { parseURL } = require('../utils/urlParser.js');
const { generateRefId } = require('../utils/referenceId.js');

function createRouter(db) {
  const router = Router();

  // List user's data sources
  router.get('/', (req, res) => {
    const { category, trust_level, search, page = 1, limit = 20 } = req.query;
    let sql = 'SELECT * FROM data_sources WHERE owner_id = ?';
    const params = [req.user.id];

    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (trust_level) { sql += ' AND trust_level = ?'; params.push(trust_level); }
    if (search) { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push('%' + search + '%', '%' + search + '%'); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = db.prepare(countSql).get(...params).total;

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const data = db.prepare(sql).all(...params);
    res.json({ data, total: Number(total), page: Number(page), limit: Number(limit) });
  });

  // Upload + parse
  router.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请选择文件' });

    const { title, category = '其他', trust_level = '用户提供', description = '' } = req.body || {};
    if (!title) return res.status(400).json({ error: '请输入数据源标题' });

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const fileType = ext === 'xls' ? 'xlsx' : ext;

    const refId = generateRefId();

    // Parse file with appropriate parser
    let parseResult = [];
    let parseErrors = [];

    if (['png', 'jpg', 'jpeg'].includes(fileType)) {
      // Image OCR
      parseResult = await parseImage(req.file.path);
    } else {
      parseResult = parseFile(req.file.path, fileType);
    }

    // Find the best label/value columns
    const bestHeaders = detectBestHeaders(parseResult);

    // Insert data source
    const dsResult = db.prepare(
      `INSERT INTO data_sources (title, description, category, trust_level, file_path, file_type, file_size, ref_id, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(title, description, category, trust_level, req.file.path, fileType, req.file.size, refId, req.user.id);

    const sourceId = dsResult.lastInsertRowid;
    const insertPoint = db.prepare(
      `INSERT INTO data_points (source_id, label, value, unit, context, row_index, column_name, sheet_name, ref_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const pointsInserted = [];
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        const { label, value, extra } = pickLabelValue(row, bestHeaders);
        if (!value) continue;
        const pointRefId = generateRefId();
        insertPoint.run(sourceId, label, value, '', JSON.stringify(extra), row.row_index, label, row.sheet_name || '', pointRefId);
      }
    });

    try {
      insertMany(parseResult);
    } catch (err) {
      parseErrors.push(err.message);
    }

    const points = db.prepare('SELECT * FROM data_points WHERE source_id = ?').all(sourceId);
    const source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(sourceId);
    res.status(201).json({ datasource: source, data_points: points, parse_errors: parseErrors });
  });

  // Get single source with data points
  router.get('/:id', (req, res) => {
    const source = db.prepare('SELECT * FROM data_sources WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
    if (!source) return res.status(404).json({ error: '数据源不存在' });
    const data_points = db.prepare('SELECT * FROM data_points WHERE source_id = ?').all(source.id);
    res.json({ datasource: source, data_points });
  });

  // Update metadata
  router.put('/:id', (req, res) => {
    const source = db.prepare('SELECT * FROM data_sources WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
    if (!source) return res.status(404).json({ error: '数据源不存在' });

    const { title, category, trust_level, description } = req.body;
    db.prepare(
      `UPDATE data_sources SET title = COALESCE(?, title), category = COALESCE(?, category),
       trust_level = COALESCE(?, trust_level), description = COALESCE(?, description),
       updated_at = datetime('now') WHERE id = ?`
    ).run(title || null, category || null, trust_level || null, description || null, source.id);

    const updated = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(source.id);
    res.json({ datasource: updated });
  });

  // URL import
  router.post('/from-url', async (req, res) => {
    const { url, title, category = '其他', trust_level = '用户提供' } = req.body || {};
    if (!url) return res.status(400).json({ error: '请输入URL' });

    let parsed;
    try {
      parsed = await parseURL(url);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const sourceTitle = title || parsed.title || 'URL数据源';
    const refId = generateRefId();

    const dsResult = db.prepare(
      `INSERT INTO data_sources (title, description, category, trust_level, file_path, file_type, file_size, ref_id, source_url, owner_id)
       VALUES (?, ?, ?, ?, ?, 'url', 0, ?, ?, ?)`
    ).run(sourceTitle, 'URL: ' + url, category, trust_level, '', refId, url, req.user.id);

    const sourceId = dsResult.lastInsertRowid;
    const bestHeaders = detectBestHeaders(parsed.points);
    const insertPoint = db.prepare(
      `INSERT INTO data_points (source_id, label, value, unit, context, row_index, column_name, sheet_name, ref_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const inserted = [];
    for (const row of parsed.points) {
      const { label, value, extra } = pickLabelValue(row, bestHeaders);
      if (!value) continue;
      const pointRefId = generateRefId();
      insertPoint.run(sourceId, label, value, '', JSON.stringify(extra), row.row_index, label, '', pointRefId);
      inserted.push(pointRefId);
    }

    const points = db.prepare('SELECT * FROM data_points WHERE source_id = ?').all(sourceId);
    const source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(sourceId);
    res.status(201).json({ datasource: source, data_points: points, url_title: parsed.title });
  });

  // --- Data Point CRUD ---
  router.put('/points/:id', (req, res) => {
    const point = db.prepare('SELECT * FROM data_points WHERE id = ?').get(req.params.id);
    if (!point) return res.status(404).json({ error: '数据点不存在' });
    const source = db.prepare('SELECT * FROM data_sources WHERE id = ? AND owner_id = ?').get(point.source_id, req.user.id);
    if (!source) return res.status(403).json({ error: '无权操作' });

    const { label, value, unit, tags_json } = req.body || {};
    db.prepare(
      `UPDATE data_points SET label = COALESCE(?, label), value = COALESCE(?, value),
       unit = COALESCE(?, unit), tags_json = COALESCE(?, tags_json) WHERE id = ?`
    ).run(label || null, value || null, unit || null, tags_json || null, point.id);
    res.json({ point: db.prepare('SELECT * FROM data_points WHERE id = ?').get(point.id) });
  });

  router.delete('/points/:id', (req, res) => {
    const point = db.prepare('SELECT * FROM data_points WHERE id = ?').get(req.params.id);
    if (!point) return res.status(404).json({ error: '数据点不存在' });
    const source = db.prepare('SELECT * FROM data_sources WHERE id = ? AND owner_id = ?').get(point.source_id, req.user.id);
    if (!source) return res.status(403).json({ error: '无权操作' });
    db.prepare('DELETE FROM data_points WHERE id = ?').run(point.id);
    res.json({ ok: true });
  });

  // Delete
  router.delete('/:id', (req, res) => {
    const source = db.prepare('SELECT * FROM data_sources WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
    if (!source) return res.status(404).json({ error: '数据源不存在' });
    db.prepare('DELETE FROM data_sources WHERE id = ?').run(source.id);
    res.json({ ok: true });
  });

  return router;
}

// Helpers: detect best label/value column pair from extracted data
function detectBestHeaders(rows) {
  if (!rows.length) return { labelCol: null, valueCol: null };
  const allCols = new Set();
  rows.forEach((row) => row.values.forEach((v) => allCols.add(v.label)));

  const cols = Array.from(allCols);
  const labelCandidates = cols.filter((c) => /名称|产品|指标|项目|标题|类别|成分|content|label|title|name/i.test(c));
  const valueCandidates = cols.filter((c) => /值|数值|数据|金额|占比|销量|收入|含量|浓度|百分比|value|amount|number/i.test(c));

  const labelCol = labelCandidates.length ? labelCandidates[0] : cols[0] || null;
  const valueCol = valueCandidates.length ? valueCandidates[0] : (cols[1] || cols[0] || null);

  return { labelCol, valueCol };
}

function pickLabelValue(row, bestHeaders) {
  const vals = row.values || [];
  // Find best label
  let label = '';
  let value = '';

  if (bestHeaders.labelCol) {
    label = (vals.find((v) => v.label === bestHeaders.labelCol) || {}).value || '';
  }
  if (bestHeaders.valueCol) {
    value = (vals.find((v) => v.label === bestHeaders.valueCol) || {}).value || '';
  }

  // Fallback: first two values
  if (!label && vals.length >= 1) label = vals[0].value || '';
  if (!value && vals.length >= 2) value = vals[1].value || '';
  if (!value && vals.length === 1) value = vals[0].value || '';

  const extra = {};
  vals.forEach((v) => {
    if (v.label !== bestHeaders.labelCol && v.label !== bestHeaders.valueCol) {
      extra[v.label] = v.value;
    }
  });

  return { label: label || '未命名', value: value || '', extra };
}

module.exports = { createRouter };
