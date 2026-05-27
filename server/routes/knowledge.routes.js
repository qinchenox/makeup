'use strict';

const { Router } = require('express');
const { upload } = require('../middleware/fileUpload.js');
const { parseFile } = require('../utils/fileParser.js');
const { generatePPTX } = require('../generators/pptx/index.js');
const { generateDOCX } = require('../generators/docx/index.js');
const { analyzeContent, structureForPPT, generateDocContent, askAI, parseJSON } = require('../services/aiService.js');
const { SYSTEM_PROMPT, DESIGNER_PROMPT } = require('../services/agentRules.js');
const { getDb } = require('../config/database.js');
const { createJob, updateJob, completeJob, failJob, sseHandler, jobs } = require('../middleware/sse.js');

function createRouter() {
  const router = Router();
  const supabase = getDb();

  // List knowledge entries
  router.get('/', async (req, res) => {
    try {
      const { data, count, error } = await supabase.from('data_sources')
        .select('*', { count: 'exact' }).eq('owner_id', req.user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ data, total: count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload knowledge → AI analyzes, stores ALL content
  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: '请选择文件' });
      const { title, description } = req.body || {};
      const docTitle = title || req.file.originalname.replace(/\.[^.]+$/, '');

      const ext = req.file.originalname.split('.').pop().toLowerCase();
      const fileType = ext === 'xls' ? 'xlsx' : ext;

      // Parse all content
      const rows = parseFile(req.file.path, fileType);
      const allContent = rows.map(r => r.values.map(v => `${v.label}: ${v.value}`).join(' | ')).join('\n\n');

      // AI deep analysis
      let aiResult = null;
      try {
        const deepPrompt = `深度分析以下文件内容，输出结构化梳理结果。

【文件标题】${docTitle}
【内容】${allContent.substring(0, 6000)}

输出JSON:
{
  "summary": "100字内核心摘要",
  "topics": ["主题标签1", "主题标签2"],
  "dataStats": {"totalMetrics": 0, "numericCount": 0, "textCount": 0, "hasTimeSeries": false},
  "sections": [{"title": "段落主题", "content": "段落摘要"}],
  "keywords": ["关键词"],
  "category": "市场数据|研发配方|销售数据|消费者调研|竞品分析|其他",
  "suggestedUse": "建议用途(PPT主题/Word报告/数据对比/趋势分析)",
  "qualityNote": "数据质量说明(完整/部分缺失/需补充)"
}`;
        const text = await askAI(SYSTEM_PROMPT, deepPrompt, 2000);
        aiResult = parseJSON(text);
      } catch (_) {}

      const summary = aiResult?.summary || '文件已上传，等待进一步分析';
      const keywords = aiResult?.keywords || [];
      const topics = aiResult?.topics || [];
      const category = aiResult?.category || '其他';
      const suggestedUse = aiResult?.suggestedUse || '';
      const qualityNote = aiResult?.qualityNote || '';
      const dataStats = aiResult?.dataStats || {};

      // Store as knowledge entry
      const { data: entry, error } = await supabase.from('data_sources').insert({
        title: docTitle,
        description: description || summary,
        category: category,
        trust_level: '用户提供',
        file_path: req.file.path,
        file_type: fileType,
        file_size: req.file.size,
        ref_id: 'KN-' + Date.now(),
        owner_id: req.user.id,
        metadata_json: { summary, keywords, topics, rowCount: rows.length, content: allContent.substring(0, 50000), dataStats, suggestedUse, qualityNote },
      }).select('*').single();

      if (error) throw error;

      res.status(201).json({
        entry,
        analysis: {
          summary, keywords: keywords.slice(0, 10), topics: topics.slice(0, 8),
          sections: aiResult?.sections || [], category, suggestedUse, qualityNote, dataStats,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate document from knowledge base (AI-powered, no data points)
  router.post('/generate', async (req, res) => {
    try {
      const { title, doc_type = 'pptx', template_name = 'business-blue', instruction, source_ids = [], author_name } = req.body || {};
      if (!title) return res.status(400).json({ error: '请输入文档标题' });
      if (!source_ids.length) return res.status(400).json({ error: '请选择知识库资料' });

      // Load ALL content from selected sources
      const { data: sources } = await supabase.from('data_sources').select('*').in('id', source_ids).eq('owner_id', req.user.id);
      if (!sources?.length) return res.status(400).json({ error: '未找到所选资料' });

      // Collect all content
      const allContent = sources.map(s => {
        const meta = typeof s.metadata_json === 'string' ? JSON.parse(s.metadata_json || '{}') : (s.metadata_json || {});
        return `【${s.title}】\n${meta.content || s.description || ''}`;
      }).join('\n\n');

      // AI generates document structure
      const aiDoc = await generateDocContent(title, instruction || '', [
        { label: '资料来源', value: sources.length + '个文件', ref_id: 'KN-BASE' },
        { label: '内容摘要', value: allContent.substring(0, 500), ref_id: 'KN-SUMMARY' },
      ]);

      // Build data points from AI analysis (for PPT generation structure)
      const dataPoints = [];
      let idx = 0;
      if (aiDoc?.chapters) {
        for (const ch of aiDoc.chapters) {
          for (const finding of (ch.keyFindings || [])) {
            dataPoints.push({
              id: ++idx, source_id: 1, label: ch.title, value: finding, unit: '',
              ref_id: 'AI-' + String(idx).padStart(4, '0'),
            });
          }
        }
      }
      // Fallback: use source content directly
      if (!dataPoints.length) {
        const lines = allContent.split('\n').filter(Boolean);
        for (let i = 0; i < Math.min(lines.length, 50); i++) {
          dataPoints.push({
            id: i + 1, source_id: 1, label: `内容行${i + 1}`, value: lines[i].substring(0, 200), unit: '',
            ref_id: 'KN-' + String(i + 1).padStart(4, '0'),
          });
        }
      }

      const dataSources = sources.map(s => ({
        id: s.id, title: s.title, ref_id: s.ref_id,
        trust_level: s.trust_level, category: s.category,
      }));

      // Generate
      let result;
      const genTitle = aiDoc?.executiveSummary ? title : title;
      const genInstruction = aiDoc?.executiveSummary
        ? (aiDoc.executiveSummary + '\n\n' + (aiDoc.overallConclusion || ''))
        : instruction;

      if (doc_type === 'docx') {
        result = await generateDOCX({ title: genTitle, instruction: genInstruction, dataPoints, dataSources, brandConfig: {}, templateName: template_name, authorName: author_name || '' });
      } else {
        result = await generatePPTX({ title: genTitle, instruction: genInstruction, dataPoints, dataSources, brandConfig: {}, templateName: template_name, authorName: author_name || '' });
      }

      // Store document record
      const { data: doc } = await supabase.from('documents').insert({
        title, doc_type, template_name, author_id: req.user.id,
        status: 'complete', file_path: result.filePath, source_link_count: sources.length,
        instruction: instruction || '', data_point_ids: [],
      }).select('*').single();

      res.download(result.filePath, title + (doc_type === 'pptx' ? '.pptx' : '.docx'), (err) => {
        if (err) res.status(500).json({ error: '文件发送失败' });
      });
    } catch (err) {
      res.status(500).json({ error: '生成失败: ' + err.message });
    }
  });

  // SSE progress stream
  router.get('/progress/:jobId', sseHandler);

  // Clarify: Designer agent asks clarifying questions before outline
  router.post('/clarify', async (req, res) => {
    try {
      const { title, source_ids = [], instruction } = req.body || {};
      if (!source_ids.length) return res.status(400).json({ error: '请选择知识库资料' });

      const { data: sources } = await supabase.from('data_sources').select('*').in('id', source_ids).eq('owner_id', req.user.id);
      const kbSummary = (sources || []).map(s => {
        const meta = typeof s.metadata_json === 'string' ? JSON.parse(s.metadata_json || '{}') : (s.metadata_json || {});
        return `【${s.title}】${(meta.summary || '').substring(0, 100)}`;
      }).join('; ');

      const { CLARIFY_PROMPT } = require('../services/agentRules.js');
      const text = await askAI(DESIGNER_PROMPT, CLARIFY_PROMPT(title, instruction, kbSummary), 1500);
      const result = parseJSON(text);

      if (result?.needsClarification && result.questions?.length) {
        res.json({ needsClarification: true, questions: result.questions, suggestedAudience: result.suggestedAudience, suggestedStyle: result.suggestedStyle });
      } else {
        res.json({ needsClarification: false, quickOutline: result?.quickOutline });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Outline: AI generates structured outline first
  router.post('/outline', async (req, res) => {
    try {
      const { title, source_ids = [], instruction } = req.body || {};
      if (!source_ids.length) return res.status(400).json({ error: '请选择知识库资料' });

      const { data: sources } = await supabase.from('data_sources').select('*').in('id', source_ids).eq('owner_id', req.user.id);
      if (!sources?.length) return res.status(400).json({ error: '未找到所选资料' });

      const allContent = sources.map(s => {
        const meta = typeof s.metadata_json === 'string' ? JSON.parse(s.metadata_json || '{}') : (s.metadata_json || {});
        return `【${s.title}】\n${meta.content || s.description || ''}`;
      }).join('\n\n');

      const prompt = `你是PPT策划专家。根据以下内容设计一份专业PPT的大纲框架。

【标题】${title}
【指令】${instruction || '生成专业演示文稿'}
【内容】${allContent.substring(0, 5000)}

设计要点：
1. 每页一个主题，页面数量控制在5-10页
2. 每页指定最合适的布局类型
3. 核心数据规划可视化方式（图表/卡片/表格）
4. 确保逻辑递进：引入→分析→洞察→结论

输出JSON：
{
  "theme": "整体主题定位(一句话)",
  "totalSlides": 7,
  "slides": [
    {
      "pageNum": 1,
      "title": "页标题",
      "layout": "cover|stats|chart|content|table|comparison|quote|image|conclusion",
      "purpose": "该页在整体逻辑中的作用",
      "keyContent": "该页要呈现的核心信息",
      "visualHint": "可视化建议(图表类型/卡片数量/图片建议)",
      "dataRefs": ["REF-XXX"]
    }
  ],
  "colorScheme": "推荐配色方向",
  "designNotes": "整体设计建议"
}`;

      const text = await askAI(SYSTEM_PROMPT, prompt, 3000);
      const outline = parseJSON(text);

      res.json({
        outline: outline || { theme: title, totalSlides: 3, slides: [
          { pageNum: 1, title: title, layout: 'cover', purpose: '封面', keyContent: title },
          { pageNum: 2, title: '核心内容', layout: 'content', purpose: '主体', keyContent: allContent.substring(0, 200) },
          { pageNum: 3, title: '总结', layout: 'conclusion', purpose: '结尾', keyContent: '总结与建议' },
        ]},
        sources: sources.map(s => ({ id: s.id, title: s.title })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate from approved outline — per-slide AI content filling
  router.post('/generate-from-outline', async (req, res) => {
    try {
      const { title, doc_type = 'pptx', template_name = 'business-blue', outline, source_ids = [], instruction, author_name } = req.body || {};
      if (!outline?.slides?.length) return res.status(400).json({ error: '请提供大纲' });

      const { data: sources } = await supabase.from('data_sources').select('*').in('id', source_ids).eq('owner_id', req.user.id);
      const kbContent = (sources || []).map(s => {
        const meta = typeof s.metadata_json === 'string' ? JSON.parse(s.metadata_json || '{}') : (s.metadata_json || {});
        return `【${s.title}】\n${meta.content || s.description || ''}`;
      }).join('\n\n');

      // Per-slide AI content filling
      const filledSlides = [];
      for (const slide of outline.slides) {
        if (slide.layout === 'cover' || slide.layout === 'conclusion') {
          filledSlides.push(slide); // Cover/conclusion don't need KB data
          continue;
        }

        try {
          const fillPrompt = `根据知识库内容，为以下PPT页面填充具体内容。

【页面标题】${slide.title}
【页面布局】${slide.layout}
【页面目的】${slide.purpose || ''}
【知识库内容】
${kbContent.substring(0, 4000)}

输出JSON:
{
  "title": "优化后的页标题",
  "bullets": ["要点1(含具体数据)", "要点2", "要点3"],
  "keyStats": [{"label":"指标名","value":"数值","unit":"%"}],
  "chartData": [{"label":"类别","value":100}],
  "insight": "该页核心洞察一句话",
  "sourceRefs": ["REF-XXX"]
}`;

          const text = await askAI(SYSTEM_PROMPT, fillPrompt, 1500);
          const filled = parseJSON(text);
          if (filled) {
            filledSlides.push({ ...slide, ...filled, _filled: true });
          } else {
            filledSlides.push(slide);
          }
        } catch (_) {
          filledSlides.push(slide);
        }
      }

      // Build rich dataPoints from filled slides
      const dataPoints = [];
      const dataSources = (sources || []).map(s => ({
        id: s.id, title: s.title, ref_id: s.ref_id,
        trust_level: s.trust_level, category: s.category,
      }));

      let idx = 0;
      for (const slide of filledSlides) {
        // Key stats become data points
        if (slide.keyStats) {
          for (const stat of slide.keyStats) {
            dataPoints.push({
              id: ++idx, source_id: 1, label: stat.label,
              value: stat.value, unit: stat.unit || '',
              ref_id: (slide.sourceRefs || ['OUTLINE'])[0],
              _layout: 'stat', _slideTitle: slide.title,
            });
          }
        }
        // Bullets become data points
        if (slide.bullets) {
          for (const bullet of slide.bullets) {
            dataPoints.push({
              id: ++idx, source_id: 1, label: slide.title,
              value: bullet, unit: '',
              ref_id: (slide.sourceRefs || ['OUTLINE'])[0],
              _layout: slide.layout, _visualHint: slide.visualHint,
            });
          }
        }
        // Chart data
        if (slide.chartData) {
          for (const cd of slide.chartData) {
            dataPoints.push({
              id: ++idx, source_id: 1, label: cd.label,
              value: String(cd.value), unit: cd.unit || '',
              ref_id: (slide.sourceRefs || ['OUTLINE'])[0],
              _layout: 'chart', _chartType: slide.layout === 'comparison' ? 'bar' : 'pie',
            });
          }
        }
        // Fallback: use original keyContent
        if (!slide.keyStats && !slide.bullets && !slide.chartData && slide.keyContent) {
          dataPoints.push({
            id: ++idx, source_id: 1, label: slide.title,
            value: slide.keyContent.substring(0, 200), unit: '',
            ref_id: (slide.dataRefs || ['OUTLINE'])[0],
            _layout: slide.layout,
          });
        }
      }

      // Build enhanced instruction from outline
      const enhancedInstruction = outline.theme
        ? `${outline.theme}\n\n${outline.designNotes || ''}\n${outline.colorScheme ? '配色: ' + outline.colorScheme : ''}`
        : instruction || '';

      let result;
      if (doc_type === 'docx') {
        result = await generateDOCX({ title, instruction: enhancedInstruction, dataPoints, dataSources, brandConfig: {}, templateName: template_name, authorName: author_name || '' });
      } else {
        result = await generatePPTX({ title, instruction: enhancedInstruction, dataPoints, dataSources, brandConfig: {}, templateName: template_name, authorName: author_name || '' });
      }

      res.download(result.filePath, title + (doc_type === 'pptx' ? '.pptx' : '.docx'), (err) => {
        if (err) res.status(500).json({ error: '文件发送失败' });
      });
    } catch (err) {
      res.status(500).json({ error: '生成失败: ' + err.message });
    }
  });

  // Preview: show what will be generated without creating file
  router.post('/preview', async (req, res) => {
    try {
      const { title, source_ids = [], instruction } = req.body || {};
      if (!source_ids.length) return res.status(400).json({ error: '请选择知识库资料' });

      const { data: sources } = await supabase.from('data_sources').select('*').in('id', source_ids).eq('owner_id', req.user.id);
      if (!sources?.length) return res.status(400).json({ error: '未找到所选资料' });

      const allContent = sources.map(s => {
        const meta = typeof s.metadata_json === 'string' ? JSON.parse(s.metadata_json || '{}') : (s.metadata_json || {});
        return meta.content || s.description || '';
      }).join('\n');

      const aiDoc = await generateDocContent(title || '预览', instruction || '', [
        { label: '来源', value: sources.length + '个文件', ref_id: 'PREVIEW' },
        { label: '内容量', value: allContent.length + '字符', ref_id: 'PREVIEW-SIZE' },
      ]);

      res.json({
        sources: sources.map(s => ({ title: s.title, type: s.file_type })),
        preview: aiDoc ? {
          summary: aiDoc.executiveSummary,
          chapters: (aiDoc.chapters || []).map(c => ({ title: c.title, findings: c.keyFindings || [] })),
          conclusion: aiDoc.overallConclusion,
        } : { summary: 'AI 分析中...', chapters: [], conclusion: '' },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Batch generate: PPTX + DOCX at once
  router.post('/batch-generate', async (req, res) => {
    try {
      const { title, template_name = 'business-blue', instruction, source_ids = [], author_name } = req.body || {};
      if (!title || !source_ids.length) return res.status(400).json({ error: '请填写标题并选择资料' });

      const job = createJob();
      res.json({ jobId: job.id });

      // Async generation
      (async () => {
        try {
          updateJob(job.id, 'loading', 10, '加载知识库...');
          const { data: sources } = await supabase.from('data_sources').select('*').in('id', source_ids).eq('owner_id', req.user.id);
          if (!sources?.length) return failJob(job.id, '未找到资料');

          updateJob(job.id, 'ai', 25, 'AI 分析内容...');
          const allContent = sources.map(s => {
            const meta = typeof s.metadata_json === 'string' ? JSON.parse(s.metadata_json || '{}') : (s.metadata_json || {});
            return `【${s.title}】\n${meta.content || s.description || ''}`;
          }).join('\n\n');

          const aiDoc = await generateDocContent(title, instruction || '', [
            { label: '来源', value: sources.length + '个文件', ref_id: 'BATCH' },
          ]);

          const dataPoints = [];
          if (aiDoc?.chapters) {
            let idx = 0;
            for (const ch of aiDoc.chapters) {
              for (const f of (ch.keyFindings || [])) {
                dataPoints.push({ id: ++idx, source_id: 1, label: ch.title, value: f, unit: '', ref_id: 'B' + String(idx).padStart(4, '0') });
              }
            }
          }

          const dataSources = sources.map(s => ({ id: s.id, title: s.title, ref_id: s.ref_id, trust_level: s.trust_level, category: s.category }));
          const genInstruction = aiDoc?.executiveSummary || instruction || '';

          updateJob(job.id, 'pptx', 50, '生成 PPTX...');
          const pptxRes = await generatePPTX({ title, instruction: genInstruction, dataPoints, dataSources, brandConfig: {}, templateName: template_name, authorName: author_name || '' });

          updateJob(job.id, 'docx', 75, '生成 DOCX...');
          const docxRes = await generateDOCX({ title, instruction: genInstruction, dataPoints, dataSources, brandConfig: {}, templateName: template_name, authorName: author_name || '' });

          updateJob(job.id, 'done', 100, '完成');
          completeJob(job.id, { pptx: pptxRes.filePath, docx: docxRes.filePath, pptxName: title + '.pptx', docxName: title + '.docx' });
        } catch (e) {
          failJob(job.id, e.message);
        }
      })();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Download batch result
  router.get('/download/:type/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job?.result) return res.status(404).json({ error: '文件不存在' });
    const filePath = req.params.type === 'pptx' ? job.result.pptx : job.result.docx;
    const fileName = req.params.type === 'pptx' ? job.result.pptxName : job.result.docxName;
    res.download(filePath, fileName);
  });

  // List available PPT templates
  router.get('/templates', (req, res) => {
    try {
      const { listAllTemplates } = require('../generators/pptx/index.js');
      res.json({ templates: listAllTemplates() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete knowledge entry
  router.delete('/:id', async (req, res) => {
    try {
      await supabase.from('data_sources').delete().eq('id', req.params.id).eq('owner_id', req.user.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createRouter };
