'use strict';

const fs = require('fs');
const path = require('path');

async function parseImage(filePath) {
  const Tesseract = require('tesseract.js');

  let text = '';
  try {
    const { data } = await Tesseract.recognize(filePath, 'chi_sim+eng', {
      logger: () => {}, // Silent
    });
    text = data.text || '';
  } catch (err) {
    // OCR failed, return basic file info
    const stats = fs.statSync(filePath);
    return [{
      row_index: 0,
      columns: ['filename', 'filesize', 'note'],
      values: [
        { label: 'filename', value: path.basename(filePath) },
        { label: 'filesize', value: String(stats.size) + ' bytes' },
        { label: 'note', value: 'OCR识别失败: ' + (err.message || 'unknown') },
      ],
    }];
  }

  if (!text.trim()) {
    return [{
      row_index: 0,
      columns: ['note'],
      values: [{ label: 'note', value: '图片中未检测到文字，请人工标注数据点' }],
    }];
  }

  // Parse OCR text into data points
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const points = [];

  // Try key:value detection
  const kvPattern = /^(.+?)[：:]\s*(.+)$/;
  lines.forEach((line, idx) => {
    const match = line.match(kvPattern);
    if (match) {
      points.push({
        row_index: idx,
        source_type: 'ocr',
        columns: ['label', 'value'],
        values: [
          { label: 'label', value: match[1].trim() },
          { label: 'value', value: match[2].trim() },
        ],
      });
    } else if (line.length > 2) {
      points.push({
        row_index: idx,
        source_type: 'ocr',
        columns: ['content'],
        values: [{ label: 'content', value: line.substring(0, 200) }],
      });
    }
  });

  // Mark all points as AI-OCR for verification
  points.unshift({
    row_index: -1,
    columns: ['warning'],
    values: [{ label: 'warning', value: '⚠ AI-OCR识别结果，请人工核实所有数据点' }],
  });

  return points;
}

module.exports = { parseImage };
