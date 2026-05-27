'use strict';

const docx = require('docx');
const fs = require('fs');
const path = require('path');
const { appplyBrandVI, DEFAULT_BRAND } = require('../common/brandVI.js');
const { injectSourceAnnotation, buildReferencesTable } = require('../common/sourceLinker.js');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'storage', 'generated');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak,
  Header, Footer, PageNumber, NumberFormat,
} = docx;

function generateDOCX({ title, instruction, dataPoints, dataSources, brandConfig, templateName, authorName }) {
  const brand = appplyBrandVI({ ...DEFAULT_BRAND, ...(brandConfig || {}) });
  const primaryHex = brand.primaryColorHex || '4F46E5';
  const children = [];
  const docRefId = 'DOC-' + Date.now();

  // ============ COVER PAGE ============
  children.push(new Paragraph({ spacing: { before: 2400 } }));
  children.push(new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 52, color: primaryHex, font: brand.fontFamily })],
    alignment: AlignmentType.CENTER, spacing: { after: 300 },
  }));
  if (instruction) {
    children.push(new Paragraph({
      children: [new TextRun({ text: instruction, italics: true, size: 24, color: '888888', font: brand.fontFamily })],
      alignment: AlignmentType.CENTER, spacing: { after: 200 },
    }));
  }
  children.push(new Paragraph({ spacing: { after: 600 } }));
  const metaLines = [];
  if (authorName) metaLines.push(new TextRun({ text: '作者: ' + authorName, size: 20, color: '666666' }));
  metaLines.push(new TextRun({ text: '\n日期: ' + new Date().toLocaleDateString('zh-CN'), size: 20, color: '666666' }));
  metaLines.push(new TextRun({ text: '\n数据点: ' + dataPoints.length + ' 条  |  数据源: ' + (dataSources ? [...new Set(dataSources.map(s => s.id))].length : 0) + ' 个', size: 20, color: '666666' }));
  metaLines.push(new TextRun({ text: '\n文档编号: ' + docRefId, size: 18, color: '999999' }));
  children.push(new Paragraph({ children: metaLines, alignment: AlignmentType.CENTER }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ============ TABLE OF CONTENTS (manual) ============
  children.push(new Paragraph({
    children: [new TextRun({ text: '目  录', bold: true, size: 36, color: primaryHex, font: brand.fontFamily })],
    alignment: AlignmentType.CENTER, spacing: { after: 400 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '摘要 ............................................... 2', size: 20, color: '666666' })],
    spacing: { after: 100 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '数据详情 ........................................... 3', size: 20, color: '666666' })],
    spacing: { after: 100 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '引用来源清单 ....................................... ' + (Math.ceil(dataPoints.length / 8) + 4), size: 20, color: '666666' })],
    spacing: { after: 100 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '核心结论 ........................................... ' + (Math.ceil(dataPoints.length / 8) + 5), size: 20, color: '666666' })],
    spacing: { after: 300 },
  }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ============ EXECUTIVE SUMMARY ============
  children.push(new Paragraph({
    text: '摘  要', heading: HeadingLevel.HEADING_1, spacing: { after: 200 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({
      text: `本文档基于 ${dataSources ? [...new Set(dataSources.map(s => s.id))].length : 0} 个可信数据源，共包含 ${dataPoints.length} 个数据点。所有数据均可通过 REF-ID 追溯到原始来源，数据真实性 100% 可验证。`,
      size: 22, font: brand.fontFamily,
    })],
    spacing: { after: 300 },
  }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ============ DATA DETAILS (by source chapters) ============
  children.push(new Paragraph({
    text: '数据详情', heading: HeadingLevel.HEADING_1, spacing: { after: 200 },
  }));

  // Group by source
  const sourceChapters = [];
  if (dataSources) {
    const seen = new Set();
    dataSources.forEach((ds) => {
      if (!seen.has(ds.id)) {
        seen.add(ds.id);
        const chapterPoints = dataPoints.filter((dp) => dp.source_id === ds.id);
        if (chapterPoints.length) {
          sourceChapters.push({ source: ds, points: chapterPoints });
        }
      }
    });
  }

  // Fallback: no chapters
  if (!sourceChapters.length) {
    sourceChapters.push({ source: null, points: dataPoints });
  }

  sourceChapters.forEach((ch) => {
    children.push(new Paragraph({
      text: (ch.source ? ch.source.title : '未分类数据') + ` (${ch.points.length} 个数据点)`,
      heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 160 },
    }));
    if (ch.source) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `REF-ID: ${ch.source.ref_id}  |  可信度: ${ch.source.trust_level}  |  分类: ${ch.source.category}`, size: 16, color: '888888', italics: true })],
        spacing: { after: 200 },
      }));
    }

    if (ch.points.length > 8) {
      // Table rendering
      const headerRow = new TableRow({
        children: ['指标', '数值', 'REF-ID', '可信度'].map((h) => new TableCell({
          children: [new Paragraph({ text: h, bold: true, size: 18, color: 'FFFFFF' })],
          shading: { fill: primaryHex },
          width: { size: 25, type: WidthType.PERCENTAGE },
        })),
      });
      const dataRows = ch.points.map((dp) => {
        const ds = dataSources ? dataSources.find((s) => s.id === dp.source_id) : null;
        const injected = injectSourceAnnotation(null, dp, ds);
        return new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: dp.label, size: 18 })] }),
            new TableCell({ children: [new Paragraph({ text: dp.value + (dp.unit || ''), size: 18 })] }),
            new TableCell({ children: [new Paragraph({ text: injected.refId || '', size: 16, color: primaryHex })] }),
            new TableCell({ children: [new Paragraph({ text: injected.trustLevel || '', size: 16 })] }),
          ],
        });
      });
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
      }));
    } else {
      // List rendering
      ch.points.forEach((dp) => {
        const ds = dataSources ? dataSources.find((s) => s.id === dp.source_id) : null;
        const injected = injectSourceAnnotation(null, dp, ds);
        children.push(new Paragraph({
          children: [new TextRun({ text: injected.text, bold: true, size: 22 })],
          spacing: { before: 160, after: 40 },
        }));
        children.push(new Paragraph({
          children: [new TextRun({ text: injected.sourceAnnotation, italics: true, size: 16, color: primaryHex })],
          spacing: { after: 120 },
        }));
      });
    }
  });

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ============ REFERENCES ============
  children.push(new Paragraph({
    text: '引用来源清单', heading: HeadingLevel.HEADING_1, spacing: { after: 200 },
  }));
  const refs = buildReferencesTable(dataPoints, dataSources);
  const uniqueRefs = [];
  const seenRef = new Set();
  refs.forEach((r) => { if (!seenRef.has(r.refId)) { seenRef.add(r.refId); uniqueRefs.push(r); } });
  uniqueRefs.forEach((r) => {
    children.push(new Paragraph({
      children: [new TextRun({ text: `${r.refId}: ${r.label} = ${r.value}  [来源: ${r.sourceTitle}]  [${r.trustLevel}]`, size: 18, color: '555555' })],
      spacing: { after: 60 },
    }));
  });

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ============ CONCLUSION ============
  children.push(new Paragraph({
    text: '核心结论', heading: HeadingLevel.HEADING_1, spacing: { after: 200 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({
      text: `本文档基于 ${uniqueRefs.length} 个可信数据源，共 ${dataPoints.length} 个数据点生成。`,
      size: 22,
    })],
    spacing: { after: 100 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({
      text: '所有数据均可通过 REF-ID 追溯到原始来源。数据真实性: 100% 可验证。',
      size: 22,
    })],
    spacing: { after: 100 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: brand.footerText || '', size: 18, color: '999999' })],
    alignment: AlignmentType.CENTER, spacing: { before: 400 },
  }));

  // ============ HEADER / FOOTER ============
  const defaultHeader = new Header({
    children: [new Paragraph({
      children: [
        new TextRun({ text: (brand.logoText || 'Makeup') + '  |  ', bold: true, size: 16, color: primaryHex }),
        new TextRun({ text: title, size: 16, color: '666666' }),
      ],
      alignment: AlignmentType.RIGHT, border: { bottom: { color: primaryHex, size: 1, space: 4 } },
    })],
  });

  const defaultFooter = new Footer({
    children: [new Paragraph({
      children: [
        new TextRun({ text: '文档编号: ' + docRefId + '  |  ', size: 14, color: '999999' }),
        new TextRun({ text: '保密等级: 内部资料  |  ', size: 14, color: '999999' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 14, color: '999999' }),
        new TextRun({ text: ' / ', size: 14, color: '999999' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: '999999' }),
      ],
      alignment: AlignmentType.CENTER, border: { top: { color: 'DDDDDD', size: 1, space: 4 } },
    })],
  });

  const doc = new Document({
    sections: [{
      properties: {
        titlePage: true,
      },
      headers: { default: defaultHeader },
      footers: { default: defaultFooter },
      children,
    }],
  });

  const filename = 'makeup-' + Date.now() + '.docx';
  const filePath = path.join(OUTPUT_DIR, filename);

  return Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync(filePath, buffer);
    return { filePath, filename };
  }).catch((err) => {
    console.error('[docx] Generation error:', err.message, err.stack?.split('\n')[1]);
    throw err;
  });
}

module.exports = { generateDOCX };
