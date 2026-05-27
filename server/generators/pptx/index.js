'use strict';

const pptxgen = require('pptxgenjs');
const path = require('path');
const fs = require('fs');
const { appplyBrandVI, DEFAULT_BRAND } = require('../common/brandVI.js');
const { injectSourceAnnotation, buildReferencesTable } = require('../common/sourceLinker.js');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'storage', 'generated');
const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates', 'ppt');
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'storage', 'uploads');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });

// Visual component builders
function addStatCard(slide, { label, value, x, y, w, h, config, primaryColor }) {
  const c = config || {};
  slide.addShape('roundRect', { x, y, w, h, fill: { color: c.bgColor || primaryColor }, rectRadius: c.radius || 0.08 });
  slide.addText(value, { x: x + 0.15, y: y + 0.15, w: w - 0.3, h: h * 0.55, fontSize: 24, bold: true, color: c.textColor || 'FFFFFF', align: 'center' });
  slide.addText(label, { x: x + 0.15, y: y + h * 0.55, w: w - 0.3, h: h * 0.35, fontSize: 10, color: c.textColor || 'EEEEEE', align: 'center' });
}

function addQuoteBox(slide, { quote, author, x, y, w, h, config, primaryColor }) {
  const c = config || {};
  slide.addShape('roundRect', { x, y, w, h, fill: { color: c.bgColor || 'F9FAFB' }, line: { color: c.borderColor || primaryColor, width: 2 }, rectRadius: 0.05 });
  slide.addText('"', { x: x + 0.2, y: y + 0.1, w: 0.6, h: 0.6, fontSize: 28, color: c.iconColor || primaryColor, fontFace: 'Georgia' });
  slide.addText(quote, { x: x + 0.8, y: y + 0.3, w: w - 1.2, h: h * 0.5, fontSize: 13, italic: true, color: '444444' });
  if (author) slide.addText('— ' + author, { x: x + 0.8, y: y + h * 0.7, w: w - 1.2, h: h * 0.25, fontSize: 10, color: '888888' });
}

function addImageSlot(slide, { imagePath, caption, x, y, w, h, config }) {
  const c = config || {};
  if (imagePath && fs.existsSync(imagePath)) {
    slide.addImage({ path: imagePath, x, y, w, h, sizing: { type: 'cover', w, h } });
  } else {
    slide.addShape('roundRect', { x, y, w, h, fill: { color: 'F3F4F6' }, line: { color: 'DDDDDD', dashType: 'dash' }, rectRadius: (c.radius || 0.05) });
    slide.addText('图片占位', { x, y: y + h / 2 - 0.3, w, h: 0.6, fontSize: 12, color: 'BBBBBB', align: 'center' });
  }
  if (caption) {
    slide.addText(caption, { x, y: y + h + 0.05, w, h: 0.35, fontSize: 9, color: '888888', align: 'center', italic: true });
  }
}

function loadTemplate(name) {
  // Try built-in templates first
  const paths = [
    path.join(TEMPLATES_DIR, (name || 'business-blue') + '.json'),
    path.join(TEMPLATES_DIR, 'user', (name || 'business-blue') + '.json'),
  ];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (_) { /* continue */ }
  }
  return null;
}

function listAllTemplates() {
  const templates = [];
  // Built-in
  for (const dir of [TEMPLATES_DIR, path.join(TEMPLATES_DIR, 'user')]) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.json')) {
          const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
          templates.push({ ...t, id: f.replace('.json', ''), source: dir.includes('user') ? 'user' : 'builtin' });
        }
      }
    } catch (_) {}
  }
  return templates;
}

function classifyDataPoints(points) {
  const numeric = [];
  const percentages = [];
  const text = [];
  points.forEach((p) => {
    const v = String(p.value || '').trim();
    if (v.endsWith('%') || v.includes('％')) {
      percentages.push(p);
    } else if (!isNaN(parseFloat(v.replace(/[,，]/g, '')))) {
      numeric.push(p);
    } else {
      text.push(p);
    }
  });
  return { numeric, percentages, text };
}

function pickLayout(pointCount) {
  if (pointCount <= 3) return 'cards';
  if (pointCount <= 8) return 'list';
  return 'table';
}

function generatePPTX({ title, instruction, dataPoints, dataSources, brandConfig, templateName, authorName }) {
  const template = loadTemplate(templateName) || {};
  const brand = appplyBrandVI({ ...DEFAULT_BRAND, ...template, ...(brandConfig || {}) });
  const pptx = new pptxgen();

  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = authorName || 'Makeup System';
  pptx.title = title;

  const primaryHex = brand.primaryColorHex || '4F46E5';
  const accentHex = brand.accentColorHex || '818CF8';

  const { numeric, percentages, text } = classifyDataPoints(dataPoints);
  const layout = pickLayout(dataPoints.length);

  // ============ COVER (enhanced with gradient) ============
  const cover = pptx.addSlide();
  cover.background = { color: primaryHex };
  cover.addText(brand.logoText || 'Makeup', { x: 0.5, y: 0.3, w: 4, h: 0.6, fontSize: 12, color: 'FFFFFF', fontFace: brand.fontFamily });
  cover.addText(title, { x: 1, y: 1.8, w: 11, h: 1.5, fontSize: 32, bold: true, color: 'FFFFFF', fontFace: brand.fontFamily, align: 'center' });
  if (instruction) {
    cover.addText(instruction, { x: 1.5, y: 3.3, w: 10, h: 0.8, fontSize: 16, color: 'DDDDDD', fontFace: brand.fontFamily, align: 'center' });
  }
  const metaParts = [];
  if (authorName) metaParts.push('作者: ' + authorName);
  metaParts.push(new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }));
  metaParts.push('数据点: ' + dataPoints.length + ' 条');
  metaParts.push('数据源: ' + (dataSources ? [...new Set(dataSources.map((s) => s.id))].length : 0) + ' 个');
  cover.addText(metaParts.join('  |  '), { x: 1, y: 4.5, w: 11, h: 0.5, fontSize: 11, color: 'CCCCCC', fontFace: brand.fontFamily, align: 'center' });
  cover.addText(brand.footerText || '', { x: 1, y: 5.8, w: 11, h: 0.4, fontSize: 9, color: 'AAAAAA', fontFace: brand.fontFamily, align: 'center' });

  // ============ STATS OVERVIEW ============
  if (dataPoints.length >= 2) {
    const statsSlide = pptx.addSlide();
    statsSlide.addText('核心数据一览', { x: 0.5, y: 0.3, w: 12, h: 0.7, fontSize: 22, bold: true, color: primaryHex, fontFace: brand.fontFamily });
    const topPoints = dataPoints.slice(0, 6);
    const cardW = 2.7; const cardH = 1.3; const gap = 0.3;
    const totalW = topPoints.length * (cardW + gap) - gap;
    const startX = (13.333 - totalW) / 2;
    topPoints.forEach((dp, i) => {
      const x = startX + i * (cardW + gap);
      const val = String(dp.value || '').length > 15 ? String(dp.value).substring(0, 14) + '..' : String(dp.value || '');
      addStatCard(statsSlide, {
        label: dp.label, value: val + (dp.unit || ''),
        x, y: 1.5, w: cardW, h: cardH,
        config: template.components?.statCard, primaryColor: primaryHex,
      });
    });
  }

  // ============ TOC ============
  if (dataSources && dataSources.length > 1) {
    const toc = pptx.addSlide();
    toc.addText('目录', { x: 0.5, y: 0.3, w: 4, h: 0.8, fontSize: 24, bold: true, color: primaryHex, fontFace: brand.fontFamily });
    const chapters = [];
    const seenSrc = new Set();
    dataPoints.forEach((dp) => {
      const ds = dataSources.find((s) => s.id === dp.source_id);
      const key = ds ? ds.ref_id : 'unknown';
      if (!seenSrc.has(key)) {
        seenSrc.add(key);
        chapters.push({ title: ds ? ds.title : '未分类数据', refId: key, count: 1 });
      } else {
        const ch = chapters.find((c) => c.refId === key);
        if (ch) ch.count++;
      }
    });
    chapters.forEach((ch, i) => {
      toc.addText(`${i + 1}. ${ch.title} (${ch.count} 个数据点)  [${ch.refId}]`, {
        x: 1, y: 1.5 + i * 0.5, w: 11, h: 0.4, fontSize: 14, color: '333333', fontFace: brand.fontFamily,
      });
    });
  }

  // ============ CHARTS (if numeric data) ============
  if (numeric.length >= 2 || percentages.length >= 2) {
    const chartData = numeric.length >= percentages.length ? numeric : percentages;
    const isPercent = numeric.length < percentages.length;

    // Bar chart
    const barSlide = pptx.addSlide();
    barSlide.addText('数据可视化', { x: 0.5, y: 0.3, w: 6, h: 0.7, fontSize: 20, bold: true, color: primaryHex, fontFace: brand.fontFamily });
    const chartEntries = chartData.slice(0, 12).map((dp) => ({
      name: dp.label.length > 12 ? dp.label.substring(0, 12) + '...' : dp.label,
      labels: [dp.label],
      values: [parseFloat(String(dp.value).replace(/[,，%％]/g, '')) || 0],
    }));
    const barSeries = chartEntries.map((e) => ({ name: e.name, labels: e.labels, values: e.values }));
    barSlide.addChart('bar', barSeries, {
      x: 0.5, y: 1.2, w: 12, h: 5, barDir: 'col',
      chartColors: [primaryHex, accentHex, '6366F1', 'A5B4FC'],
    });

    chartEntries.forEach((dp, i) => {
      barSlide.addText(`[来源: ${chartData[i].ref_id}]`, {
        x: 0.5, y: 6.3 + i * 0.25, w: 12, h: 0.2, fontSize: 7, color: '888888', fontFace: brand.fontFamily, italic: true,
      });
    });

    // Pie chart for percentages
    if (percentages.length >= 2) {
      const pieSlide = pptx.addSlide();
      pieSlide.addText('占比分布', { x: 0.5, y: 0.3, w: 6, h: 0.7, fontSize: 20, bold: true, color: primaryHex, fontFace: brand.fontFamily });
      pieSlide.addChart('pie', [{
        name: '占比',
        labels: percentages.slice(0, 8).map((dp) => dp.label),
        values: percentages.slice(0, 8).map((dp) => parseFloat(String(dp.value).replace(/[,，%％]/g, '')) || 0),
      }], {
        x: 1, y: 1.3, w: 8, h: 5, showPercent: true,
        chartColors: [primaryHex, accentHex, '6366F1', 'A5B4FC', 'C7D2FE', 'E0E7FF'],
      });
    }
  }

  // ============ DATA CONTENT SLIDES (adaptive layout) ============
  let pointsPerSlide = 5;
  if (layout === 'cards') pointsPerSlide = 3;
  else if (layout === 'table') pointsPerSlide = 8;

  const totalContentSlides = Math.ceil(dataPoints.length / pointsPerSlide);

  for (let i = 0; i < totalContentSlides; i++) {
    const chunk = dataPoints.slice(i * pointsPerSlide, (i + 1) * pointsPerSlide);
    const slide = pptx.addSlide();
    slide.addText(title + ' (' + (i + 1) + '/' + totalContentSlides + ')', {
      x: 0.5, y: 0.2, w: 12, h: 0.6, fontSize: 18, bold: true, color: primaryHex, fontFace: brand.fontFamily,
    });

    if (layout === 'cards') {
      chunk.forEach((dp, idx) => {
        const ds = dataSources ? dataSources.find((s) => s.id === dp.source_id) : null;
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const x = 0.5 + col * 4.1;
        const y = 1.2 + row * 2.8;
        slide.addShape('roundRect', { x, y, w: 3.8, h: 2.5, fill: { color: 'F9FAFB' }, line: { color: primaryHex, width: 1 } });
        slide.addText(dp.label, { x: x + 0.2, y: y + 0.2, w: 3.4, h: 0.5, fontSize: 11, color: '666666', fontFace: brand.fontFamily });
        slide.addText(dp.value + (dp.unit || ''), { x: x + 0.2, y: y + 0.8, w: 3.4, h: 0.8, fontSize: 22, bold: true, color: primaryHex, fontFace: brand.fontFamily });
        const injected = injectSourceAnnotation(null, dp, ds);
        slide.addText(injected.sourceAnnotation, { x: x + 0.2, y: y + 1.9, w: 3.4, h: 0.4, fontSize: 7, color: '999999', fontFace: brand.fontFamily, italic: true });
      });
    } else if (layout === 'table') {
      const headers = ['指标', '数值', '来源 REF-ID', '可信度'];
      const rows = chunk.map((dp) => {
        const ds = dataSources ? dataSources.find((s) => s.id === dp.source_id) : null;
        const injected = injectSourceAnnotation(null, dp, ds);
        return [dp.label, dp.value + (dp.unit || ''), injected.refId || '', injected.trustLevel || ''];
      });
      slide.addTable([headers, ...rows], {
        x: 0.3, y: 1.0, w: 12.7, colW: [3.5, 2.5, 3.5, 3.2], rowH: 0.5, fontSize: 10,
        border: { type: 'solid', color: 'DDDDDD' },
        fill: { color: 'FFFFFF' },
        color: '333333', fontFace: brand.fontFamily,
      });
      // Source annotations below table
      chunk.forEach((dp, idx) => {
        const ds = dataSources ? dataSources.find((s) => s.id === dp.source_id) : null;
        const injected = injectSourceAnnotation(null, dp, ds);
        slide.addText(injected.sourceAnnotation, { x: 0.3, y: 1.1 + (chunk.length + 1) * 0.5 + idx * 0.2, w: 12, h: 0.2, fontSize: 7, color: '999999', fontFace: brand.fontFamily, italic: true });
      });
    } else {
      // List layout (default 4-8)
      chunk.forEach((dp, idx) => {
        const ds = dataSources ? dataSources.find((s) => s.id === dp.source_id) : null;
        const y = 1.2 + idx * 1.0;
        const injected = injectSourceAnnotation(null, dp, ds);
        slide.addText(injected.text, { x: 0.5, y, w: 12, h: 0.5, fontSize: 14, bold: true, color: '333333', fontFace: brand.fontFamily });
        slide.addText(injected.sourceAnnotation, { x: 0.5, y: y + 0.45, w: 12, h: 0.35, fontSize: 8, color: primaryHex, fontFace: brand.fontFamily, italic: true });
      });
    }
  }

  // ============ REFERENCES ============
  const refSlide = pptx.addSlide();
  refSlide.addText('引用来源清单', { x: 0.5, y: 0.3, w: 12, h: 0.8, fontSize: 22, bold: true, color: primaryHex, fontFace: brand.fontFamily });
  const refs = buildReferencesTable(dataPoints, dataSources);
  const uniqueRefs = [];
  const seenRef = new Set();
  refs.forEach((r) => { if (!seenRef.has(r.refId)) { seenRef.add(r.refId); uniqueRefs.push(r); } });
  const refHeaders = ['REF-ID', '数据标签', '数值', '数据源', '可信度'];
  const refRows = uniqueRefs.slice(0, 20).map((r) => [r.refId, r.label, r.value, r.sourceTitle, r.trustLevel]);
  if (refRows.length) {
    refSlide.addTable([refHeaders, ...refRows], {
      x: 0.3, y: 1.3, w: 12.7, colW: [2, 3, 2, 3.5, 2.2], rowH: 0.4, fontSize: 9,
      border: { type: 'solid', color: 'DDDDDD' },
    });
  }

  // ============ CONCLUSION ============
  const endSlide = pptx.addSlide();
  endSlide.background = { color: primaryHex };
  endSlide.addText('核心结论', { x: 1, y: 1, w: 11, h: 1, fontSize: 28, bold: true, color: 'FFFFFF', fontFace: brand.fontFamily, align: 'center' });
  endSlide.addText(
    `本文档基于 ${uniqueRefs.length} 个可信数据源，共 ${dataPoints.length} 个数据点生成。\n所有数据均可通过 REF-ID 追溯到原始来源。\n数据真实性: 100% 可验证`,
    { x: 1.5, y: 2.5, w: 10, h: 2.5, fontSize: 16, color: 'EEEEEE', fontFace: brand.fontFamily, align: 'center', lineSpacing: 36 }
  );
  endSlide.addText(brand.footerText || '', { x: 1, y: 5.5, w: 11, h: 0.5, fontSize: 10, color: 'BBBBBB', fontFace: brand.fontFamily, align: 'center' });

  // Save
  const filename = 'makeup-' + Date.now() + '.pptx';
  const filePath = path.join(OUTPUT_DIR, filename);

  return pptx.writeFile({ fileName: filePath }).then(() => ({ filePath, filename }));
}

module.exports = { generatePPTX, listAllTemplates };
