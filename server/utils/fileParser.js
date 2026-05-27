'use strict';

const fs = require('fs');
const xlsx = require('xlsx');
const { parse } = require('csv-parse/sync');

function parseFile(filePath, fileType) {
  switch (fileType) {
    case 'csv': return parseCSV(filePath);
    case 'xlsx': case 'xls': return parseXLSX(filePath);
    case 'json': return parseJSON(filePath);
    case 'pdf': return parsePDF(filePath);
    case 'docx': return parseDOCX(filePath);
    case 'txt': case 'md': return parseText(filePath);
    default: return [];
  }
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true, bom: true });
  return records.map((row, idx) => ({
    row_index: idx,
    columns: Object.keys(row),
    values: Object.entries(row).map(([key, val]) => ({ label: key, value: String(val || '').trim() })),
  }));
}

function parseXLSX(filePath) {
  const workbook = xlsx.readFile(filePath);
  const rows = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    data.forEach((row, idx) => {
      rows.push({
        row_index: idx, sheet_name: sheetName,
        columns: Object.keys(row),
        values: Object.entries(row).map(([key, val]) => ({ label: key, value: String(val || '').trim() })),
      });
    });
  });
  return rows;
}

function parseJSON(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  let data;
  try { data = JSON.parse(content); } catch { return []; }
  if (!Array.isArray(data)) data = [data];
  return data.map((item, idx) => ({
    row_index: idx,
    columns: Object.keys(item),
    values: Object.entries(item).map(([key, val]) => ({
      label: key,
      value: typeof val === 'object' ? JSON.stringify(val) : String(val || '').trim(),
    })),
  }));
}

// ============ TXT / MD ============
function parseText(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  return textToDataPoints(text, 'txt');
}

// ============ PDF ============
function parsePDF(filePath) {
  const pdfParse = require('pdf-parse');
  const buf = fs.readFileSync(filePath);
  let text = '';
  try {
    const data = pdfParse(buf);
    text = data.text || '';
  } catch {
    // Synchronous fallback
  }
  if (!text.trim()) return [];
  return textToDataPoints(text, 'pdf');
}

// ============ DOCX ============
function parseDOCX(filePath) {
  const mammoth = require('mammoth');
  const buf = fs.readFileSync(filePath);
  let text = '';
  try {
    const result = mammoth.extractRawText({ buffer: buf });
    text = result.value || '';
  } catch {
    // Fallback
  }
  if (!text.trim()) return [];
  return textToDataPoints(text, 'docx');
}

// ============ TEXT → DATA POINTS ============
function textToDataPoints(text, sourceType) {
  const points = [];
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

  // Try tabular data first
  const tabLines = lines.filter((l) => l.includes('\t') || l.includes('|'));
  if (tabLines.length >= 3) {
    return parseTabularLines(tabLines, sourceType);
  }

  // Detect key:value patterns
  const kvPattern = /^(.+?)[：:]\s*(.+)$/;
  let currentSection = '';
  let kvCount = 0;
  const kvPoints = [];

  lines.forEach((line) => {
    // Track section headers (Markdown or plain)
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      return;
    }

    const kvMatch = line.match(kvPattern);
    if (kvMatch) {
      kvCount++;
      kvPoints.push({
        row_index: kvPoints.length,
        columns: ['section', 'label', 'value'],
        values: [
          { label: 'section', value: currentSection },
          { label: 'label', value: kvMatch[1].trim() },
          { label: 'value', value: kvMatch[2].trim() },
        ],
      });
      return;
    }

    // Markdown bullet/list items
    const bulletMatch = line.match(/^[\-\*\+]\s+(.+)$/);
    if (bulletMatch) {
      kvPoints.push({
        row_index: kvPoints.length,
        columns: ['section', 'content'],
        values: [
          { label: 'section', value: currentSection },
          { label: 'content', value: bulletMatch[1].trim() },
        ],
      });
    }
  });

  if (kvPoints.length >= 2) return kvPoints;

  // Numbered list
  lines.forEach((line, idx) => {
    const match = line.match(/^[\d]+[\.\、\)]\s*(.+)$/);
    if (match) {
      points.push({
        row_index: idx,
        columns: ['content'],
        values: [{ label: 'content', value: match[1].trim() }],
      });
    }
  });
  if (points.length >= 2) return points;

  // Markdown headers + any content
  lines.forEach((line, idx) => {
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      points.push({
        row_index: idx,
        columns: ['section_title'],
        values: [{ label: 'section_title', value: currentSection }],
      });
      return;
    }
    if (line.length > 5 && !line.startsWith('#')) {
      points.push({
        row_index: idx,
        columns: ['content'],
        values: [{ label: 'content', value: line.substring(0, 300) }],
      });
    }
  });
  if (points.length >= 1) return points;

  // Fallback: all non-empty lines
  lines.slice(0, 50).forEach((line, idx) => {
    if (line.length > 3) {
      points.push({
        row_index: idx,
        columns: ['content'],
        values: [{ label: 'content', value: line.substring(0, 200) }],
      });
    }
  });

  return points;
}

function parseTabularLines(lines, sourceType) {
  // Detect separator
  let sep = '\t';
  if (lines[0].includes('|')) sep = '|';
  else if (lines[0].includes('  ')) sep = '  ';

  const headerLine = lines[0];
  const headers = headerLine.split(sep).map((h) => h.trim()).filter(Boolean);

  if (headers.length < 2) {
    // Not really tabular, treat as lines
    return lines.map((l, i) => ({ row_index: i, columns: ['content'], values: [{ label: 'content', value: l.trim() }] }));
  }

  const points = [];
  // First line might be headers
  const startIdx = headers.some((h) => /指标|名称|数据|值|项目|类别|产品/.test(h)) ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim()).filter(Boolean);
    if (cols.length < 2) continue;
    const values = [];
    headers.forEach((h, j) => {
      values.push({ label: h, value: cols[j] || '' });
    });
    points.push({ row_index: i, columns: headers, values });
  }

  return points;
}

module.exports = { parseFile, parsePDF, parseDOCX, parseText, textToDataPoints };
