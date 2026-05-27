'use strict';

const { Router } = require('express');
const { upload } = require('../middleware/fileUpload.js');
const { parseFile } = require('../utils/fileParser.js');
const { parseImage } = require('../utils/imageParser.js');
const { parseURL } = require('../utils/urlParser.js');
const { generateRefId } = require('../utils/referenceId.js');
const { getDb } = require('../config/database.js');
const { analyzeColumns, extractUnit, scoreDataQuality, extractInsights, generateSummary } = require('../services/smartAnalyzer.js');

const VALID_TRUST = ['内部资料', '行业公开', '用户提供'];
const VALID_CATS = ['市场数据','研发配方','安全检测','法规政策','消费者调研','销售数据','竞品分析','其他'];

function createRouter() {
  const router = Router();
  const supabase = getDb();

  // List user's data sources
  router.get('/', async (req, res) => {
    try {
      const { category, trust_level, search, page = 1, limit = 20 } = req.query;
      let query = supabase.from('data_sources').select('*', { count: 'exact' }).eq('owner_id', req.user.id);

      if (category) query = query.eq('category', category);
      if (trust_level) query = query.eq('trust_level', trust_level);
      if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);

      const from = (Number(page) - 1) * Number(limit);
      const to = from + Number(limit) - 1;
      const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);

      if (error) throw error;
      res.json({ data, total: count, page: Number(page), limit: Number(limit) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload + parse
  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: '请选择文件' });

      let { title, category = '其他', trust_level = '用户提供', description = '' } = req.body || {};
      if (!title) return res.status(400).json({ error: '请输入数据源标题' });
      if (!VALID_TRUST.includes(trust_level)) trust_level = '用户提供';
      if (!VALID_CATS.includes(category)) category = '其他';

      const ext = req.file.originalname.split('.').pop().toLowerCase();
      const fileType = ext === 'xls' ? 'xlsx' : ext;

      // Parse file
      let parseResult = [];
      if (['png', 'jpg', 'jpeg'].includes(fileType)) {
        parseResult = await parseImage(req.file.path);
      } else {
        parseResult = parseFile(req.file.path, fileType);
      }

      const refId = generateRefId();

      // Insert data source
      const { data: source, error: dsErr } = await supabase.from('data_sources').insert({
        title, description, category, trust_level,
        file_path: req.file.path, file_type: fileType, file_size: req.file.size,
        ref_id: refId, owner_id: req.user.id,
      }).select('*').single();
      if (dsErr) throw dsErr;

      // Insert data points — extract ALL metrics per row, not just first pair
      const points = [];
      for (const row of parseResult) {
        const rowPoints = pickAllMetrics(row);
        for (const rp of rowPoints) {
          if (!rp.value) continue;
          const { value: cleanVal, unit } = extractUnit(rp.value);
          const pointRefId = generateRefId();
          const { data: pt, error: ptErr } = await supabase.from('data_points').insert({
            source_id: source.id, label: rp.label, value: cleanVal, unit,
            context: JSON.stringify({ row: row.row_index }), row_index: row.row_index,
            column_name: rp.label, sheet_name: row.sheet_name || '', ref_id: pointRefId,
          }).select('*').single();
          if (!ptErr && pt) points.push(pt);
        }
      }

      // Smart analysis
      const allColumns = [...new Set(points.flatMap(p => [p.label]).filter(Boolean))];
      const columnAnalysis = analyzeColumns(allColumns);
      const insights = extractInsights(points, columnAnalysis);
      const summary = generateSummary(title, points, insights, columnAnalysis);
      const qualityScores = points.map(p => ({ id: p.id, ...scoreDataQuality(p) }));

      res.status(201).json({
        datasource: source, data_points: points, parse_errors: [],
        analysis: { column_analysis: columnAnalysis, insights, summary, quality_scores: qualityScores },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single source with data points + analysis
  router.get('/:id', async (req, res) => {
    try {
      const { data: source, error } = await supabase.from('data_sources')
        .select('*').eq('id', req.params.id).eq('owner_id', req.user.id).maybeSingle();
      if (error || !source) return res.status(404).json({ error: '数据源不存在' });

      const { data: data_points } = await supabase.from('data_points')
        .select('*').eq('source_id', source.id).order('id', { ascending: true });

      const pts = data_points || [];
      const allColumns = [...new Set(pts.flatMap(p => [p.label]).filter(Boolean))];
      const columnAnalysis = analyzeColumns(allColumns);
      const insights = extractInsights(pts, columnAnalysis);
      const summary = generateSummary(source.title, pts, insights, columnAnalysis);

      res.json({
        datasource: source, data_points: pts,
        analysis: { column_analysis: columnAnalysis, insights, summary },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update metadata
  router.put('/:id', async (req, res) => {
    try {
      const { data: source } = await supabase.from('data_sources')
        .select('*').eq('id', req.params.id).eq('owner_id', req.user.id).maybeSingle();
      if (!source) return res.status(404).json({ error: '数据源不存在' });

      const { title, category, trust_level, description } = req.body;
      const updates = { updated_at: new Date().toISOString() };
      if (title) updates.title = title;
      if (category && VALID_CATS.includes(category)) updates.category = category;
      if (trust_level && VALID_TRUST.includes(trust_level)) updates.trust_level = trust_level;
      if (description !== undefined) updates.description = description;

      const { data: updated } = await supabase.from('data_sources').update(updates).eq('id', source.id).select('*').single();
      res.json({ datasource: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete
  router.delete('/:id', async (req, res) => {
    try {
      const { data: source } = await supabase.from('data_sources')
        .select('id').eq('id', req.params.id).eq('owner_id', req.user.id).maybeSingle();
      if (!source) return res.status(404).json({ error: '数据源不存在' });

      await supabase.from('data_sources').delete().eq('id', source.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // URL import
  router.post('/from-url', async (req, res) => {
    try {
      let { url, title, category = '其他', trust_level = '用户提供' } = req.body || {};
      if (!VALID_TRUST.includes(trust_level)) trust_level = '用户提供';
      if (!VALID_CATS.includes(category)) category = '其他';
      if (!url) return res.status(400).json({ error: '请输入URL' });

      const parsed = await parseURL(url);
      const sourceTitle = title || parsed.title || 'URL数据源';
      const refId = generateRefId();

      const { data: source, error: dsErr } = await supabase.from('data_sources').insert({
        title: sourceTitle, description: 'URL: ' + url, category, trust_level,
        file_type: 'url', file_size: 0, ref_id: refId, source_url: url, owner_id: req.user.id,
      }).select('*').single();
      if (dsErr) throw dsErr;

      const points = [];
      for (const row of parsed.points) {
        const bestHeaders = detectBestHeaders([row]);
        const { label, value } = pickLabelValue(row, bestHeaders);
        if (!value) continue;
        const pointRefId = generateRefId();
        const { data: pt } = await supabase.from('data_points').insert({
          source_id: source.id, label, value, ref_id: pointRefId,
        }).select('*').single();
        if (pt) points.push(pt);
      }

      res.status(201).json({ datasource: source, data_points: points, url_title: parsed.title });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Data point CRUD
  router.put('/points/:id', async (req, res) => {
    try {
      const { data: point } = await supabase.from('data_points').select('*, data_sources!inner(owner_id)').eq('id', req.params.id).maybeSingle();
      if (!point) return res.status(404).json({ error: '数据点不存在' });

      const { label, value, unit, tags_json } = req.body || {};
      const updates = {};
      if (label !== undefined) updates.label = label;
      if (value !== undefined) updates.value = value;
      if (unit !== undefined) updates.unit = unit;
      if (tags_json !== undefined) updates.tags_json = tags_json;

      const { data: updated } = await supabase.from('data_points').update(updates).eq('id', point.id).select('*').single();
      res.json({ point: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/points/:id', async (req, res) => {
    try {
      const { data: point } = await supabase.from('data_points').select('*').eq('id', req.params.id).maybeSingle();
      if (!point) return res.status(404).json({ error: '数据点不存在' });
      await supabase.from('data_points').delete().eq('id', point.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

// Helpers
function detectBestHeaders(rows) {
  if (!rows.length) return { labelCol: null, valueCol: null };
  const allCols = new Set();
  rows.forEach((row) => row.values.forEach((v) => allCols.add(v.label)));
  const cols = Array.from(allCols);
  const labelCandidates = cols.filter((c) => /名称|产品|指标|项目|标题|类别|成分|content|label|title|name/i.test(c));
  const valueCandidates = cols.filter((c) => /值|数值|数据|金额|占比|销量|收入|含量|浓度|百分比|value|amount|number/i.test(c));
  return { labelCol: labelCandidates[0] || cols[0] || null, valueCol: valueCandidates[0] || cols[1] || cols[0] || null };
}

function pickAllMetrics(row) {
  const vals = (row.values || []).filter(v => v.value && String(v.value).trim());
  if (!vals.length) return [];

  const points = [];
  // First non-numeric column is the identifier (product name, etc.)
  let identifier = '';
  const numericCols = [];
  const textCols = [];

  for (const v of vals) {
    const { value: clean, unit } = extractUnit(v.value);
    const numVal = parseFloat(clean.replace(/[,，]/g, ''));
    if (!isNaN(numVal) || unit) {
      numericCols.push({ label: v.label, value: v.value, clean, unit, numVal: !isNaN(numVal) ? numVal : null });
    } else {
      textCols.push({ label: v.label, value: v.value });
    }
  }

  // Use first text column as identifier
  if (textCols.length) identifier = textCols[0].value;

  // Create a data point for each numeric column
  for (const nc of numericCols) {
    const label = identifier ? `${nc.label}(${identifier})` : nc.label;
    points.push({ label, value: nc.clean, unit: nc.unit, identifier });
  }

  // If no numeric columns, treat text columns as data points
  if (!numericCols.length && textCols.length >= 2) {
    for (const tc of textCols.slice(1)) {
      points.push({ label: tc.label, value: tc.value, unit: '', identifier: textCols[0]?.value });
    }
  }

  // Fallback: first two columns
  if (!points.length && vals.length >= 2) {
    points.push({ label: vals[0].value, value: vals[1].value, unit: '', identifier: '' });
  }

  return points;
}

function pickLabelValue(row, bestHeaders) {
  const vals = row.values || [];
  let label = '', value = '';
  if (bestHeaders.labelCol) label = (vals.find(v => v.label === bestHeaders.labelCol) || {}).value || '';
  if (bestHeaders.valueCol) value = (vals.find(v => v.label === bestHeaders.valueCol) || {}).value || '';
  if (!label && vals.length >= 1) label = vals[0].value || '';
  if (!value && vals.length >= 2) value = vals[1].value || '';
  if (!value && vals.length === 1) value = vals[0].value || '';
  return { label: label || '未命名', value: value || '', extra: {} };
}

module.exports = { createRouter };
