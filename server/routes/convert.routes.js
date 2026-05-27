'use strict';

const { Router } = require('express');
const { upload } = require('../middleware/fileUpload.js');
const { parseFile } = require('../utils/fileParser.js');
const { generatePPTX } = require('../generators/pptx/index.js');
const { generateDOCX } = require('../generators/docx/index.js');
const { analyzeColumns, extractInsights, generateSummary } = require('../services/smartAnalyzer.js');
const { analyzeContent, structureForPPT } = require('../services/aiService.js');

function createRouter() {
  const router = Router();

  // Direct convert: PDF/Word/TXT → PPTX or DOCX (no DB)
  router.post('/', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: '请选择文件' });

      const { title, doc_type = 'pptx', template_name = 'business-blue', author_name } = req.body || {};
      const ext = req.file.originalname.split('.').pop().toLowerCase();
      const fileType = ext === 'xls' ? 'xlsx' : ext;

      // Parse file content
      const rows = parseFile(req.file.path, fileType);

      // Convert parsed rows to data points
      const dataPoints = [];
      const dataSources = [{
        id: 1, title: req.file.originalname, ref_id: 'REF-FILE-001',
        trust_level: '用户提供', category: '文件导入',
      }];

      for (const row of rows) {
        for (const val of row.values) {
          if (!val.value || !val.value.trim()) continue;
          dataPoints.push({
            id: dataPoints.length + 1,
            source_id: 1,
            label: val.label,
            value: String(val.value).trim(),
            unit: '',
            ref_id: 'REF-FILE-' + String(dataPoints.length + 1).padStart(3, '0'),
            row_index: row.row_index,
            sheet_name: row.sheet_name || '',
          });
        }
      }

      if (!dataPoints.length) {
        return res.status(400).json({ error: '文件中未提取到有效内容，请确认文件包含文字数据' });
      }

      // Smart analysis
      const allColumns = [...new Set(dataPoints.map(p => p.label).filter(Boolean))];
      const columnAnalysis = analyzeColumns(allColumns);
      const insights = extractInsights(dataPoints, columnAnalysis);
      const summary = generateSummary(req.file.originalname, dataPoints, insights, columnAnalysis);

      const docTitle = title || req.file.originalname.replace(/\.[^.]+$/, '');

      // AI-powered content analysis
      const rawText = dataPoints.map(p => p.label + ': ' + p.value).join('\n');
  let aiStructure = null;
  try {
    aiStructure = await structureForPPT(docTitle, rawText);
    if (aiStructure && aiStructure.cover) {
      // Use AI-generated cover info
      aiStructure._used = true;
    }
  } catch (_) { /* AI optional, fallback to default */ }

  // Build enhanced instruction from AI
  const enhancedInstruction = aiStructure?._used
    ? (aiStructure.cover?.subtitle || summary) + '\n' + (aiStructure.conclusion || '')
    : summary;

  // Generate document
  let result;
      if (doc_type === 'docx') {
        result = await generateDOCX({
          title: docTitle, instruction: summary, dataPoints, dataSources,
          brandConfig: {}, templateName: template_name, authorName: author_name || '',
        });
      } else {
        result = await generatePPTX({
          title: aiStructure?.cover?.title || docTitle,
          instruction: enhancedInstruction, dataPoints, dataSources,
          brandConfig: {}, templateName: template_name, authorName: author_name || '',
        });
      }

      // Send file for download
      res.download(result.filePath, docTitle + (doc_type === 'pptx' ? '.pptx' : '.docx'), (err) => {
        if (err) res.status(500).json({ error: '文件发送失败' });
      });
    } catch (err) {
      res.status(500).json({ error: '转换失败: ' + err.message });
    }
  });

  return router;
}

module.exports = { createRouter };
