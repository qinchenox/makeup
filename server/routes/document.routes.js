'use strict';

const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const { generatePPTX } = require('../generators/pptx/index.js');
const { generateDOCX } = require('../generators/docx/index.js');
const { loadSensitiveWords, scanContent, isBlocked } = require('../generators/common/sanitizer.js');
const { getDb } = require('../config/database.js');

function createRouter() {
  const router = Router();
  const supabase = getDb();

  // List user's documents
  router.get('/', async (req, res) => {
    try {
      const { status, doc_type, page = 1, limit = 20 } = req.query;
      let query = supabase.from('documents').select('*', { count: 'exact' }).eq('author_id', req.user.id);
      if (status) query = query.eq('status', status);
      if (doc_type) query = query.eq('doc_type', doc_type);

      const from = (Number(page) - 1) * Number(limit);
      const to = from + Number(limit) - 1;
      const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
      if (error) throw error;
      res.json({ data, total: count, page: Number(page), limit: Number(limit) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate document
  router.post('/generate', async (req, res) => {
    try {
      const { title, doc_type, template_name = 'business-blue', instruction = '', data_point_ids = [], brand_config_id, author_name } = req.body || {};
      if (!title) return res.status(400).json({ error: '请输入文档标题' });
      if (!doc_type || !['pptx', 'docx'].includes(doc_type)) return res.status(400).json({ error: '请选择文档类型' });
      if (!data_point_ids.length) return res.status(400).json({ error: '请选择至少一个数据点' });

      // Load data points
      const { data: points, error: ptErr } = await supabase.from('data_points').select('*').in('id', data_point_ids);
      if (ptErr || !points.length) return res.status(400).json({ error: '未找到有效数据点' });

      // Load data sources
      const sourceIds = [...new Set(points.map(p => p.source_id))];
      const { data: sources } = await supabase.from('data_sources').select('*').in('id', sourceIds);

      // Content scan
      const { data: words } = await supabase.from('sensitive_words').select('*').eq('is_active', true);
      const allText = instruction + ' ' + points.map(p => p.label + ' ' + p.value).join(' ');
      const findings = scanContent(allText, words || []);
      if (isBlocked(findings)) {
        return res.status(400).json({ error: '内容扫描拦截', findings: findings.filter(f => f.severity === 'critical') });
      }

      // Brand config
      let brandConfig = {};
      try {
        const q = brand_config_id
          ? supabase.from('brand_configs').select('config_json').eq('id', brand_config_id)
          : supabase.from('brand_configs').select('config_json').eq('is_default', true).limit(1);
        const { data: brand } = await q.maybeSingle();
        if (brand) brandConfig = typeof brand.config_json === 'string' ? JSON.parse(brand.config_json) : brand.config_json;
      } catch (_) {}

      // Create document record
      const { data: doc, error: docErr } = await supabase.from('documents').insert({
        title, doc_type, template_name, brand_config: brandConfig,
        author_id: req.user.id, status: 'generating', instruction,
        data_point_ids, source_link_count: points.length,
      }).select('*').single();
      if (docErr) throw docErr;

      // Generate
      let result;
      if (doc_type === 'pptx') {
        result = await generatePPTX({ title, instruction, dataPoints: points, dataSources: sources || [], brandConfig, templateName: template_name, authorName: author_name });
      } else {
        result = await generateDOCX({ title, instruction, dataPoints: points, dataSources: sources || [], brandConfig, templateName: template_name, authorName: author_name });
      }

      const stats = fs.statSync(result.filePath);
      await supabase.from('documents').update({
        status: 'complete', file_path: result.filePath, file_size: stats.size,
        source_link_count: points.length, completed_at: new Date().toISOString(),
      }).eq('id', doc.id);

      // Link data points
      for (const pid of data_point_ids) {
        await supabase.from('document_data_points').insert({ document_id: doc.id, data_point_id: pid });
      }

      const { data: finalDoc } = await supabase.from('documents').select('*').eq('id', doc.id).single();
      res.status(201).json({ document: finalDoc, data_points_count: points.length, source_count: (sources || []).length, sensitive_findings: findings });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get document details
  router.get('/:id', async (req, res) => {
    try {
      const { data: doc } = await supabase.from('documents').select('*').eq('id', req.params.id).eq('author_id', req.user.id).maybeSingle();
      if (!doc) return res.status(404).json({ error: '文档不存在' });

      const ids = Array.isArray(doc.data_point_ids) ? doc.data_point_ids : JSON.parse(doc.data_point_ids || '[]');
      let points = [];
      if (ids.length) {
        const { data } = await supabase.from('data_points').select('*').in('id', ids);
        points = data || [];
      }
      res.json({ document: doc, data_points: points });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Download
  router.get('/:id/download', async (req, res) => {
    try {
      const { data: doc } = await supabase.from('documents').select('*').eq('id', req.params.id).eq('author_id', req.user.id).maybeSingle();
      if (!doc || !doc.file_path) return res.status(404).json({ error: '文档文件不存在' });
      if (!fs.existsSync(doc.file_path)) return res.status(404).json({ error: '文件已丢失' });

      if (!doc.downloaded_at) {
        await supabase.from('documents').update({ downloaded_at: new Date().toISOString() }).eq('id', doc.id);
      }

      const ext = doc.doc_type === 'pptx' ? '.pptx' : '.docx';
      res.download(doc.file_path, doc.title + ext);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete
  router.delete('/:id', async (req, res) => {
    try {
      const { data: doc } = await supabase.from('documents').select('*').eq('id', req.params.id).eq('author_id', req.user.id).maybeSingle();
      if (!doc) return res.status(404).json({ error: '文档不存在' });
      if (doc.file_path && fs.existsSync(doc.file_path)) fs.unlinkSync(doc.file_path);
      await supabase.from('documents').delete().eq('id', doc.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createRouter };
