'use strict';

let nodeFetch;
async function getFetch() {
  if (!nodeFetch) {
    const mod = require('node-fetch');
    nodeFetch = mod.default || mod;
  }
  return nodeFetch;
}

async function parseURL(url) {
  const fetch = await getFetch();
  const cheerio = require('cheerio');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let html = '';
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Makeup-DataGuardian/1.0' },
    });
    html = await res.text();
  } catch (err) {
    throw new Error('URL抓取失败: ' + (err.message || 'timeout'));
  } finally {
    clearTimeout(timeout);
  }

  const $ = cheerio.load(html);
  const points = [];

  // Extract title
  const title = $('title').text().trim() || $('h1').first().text().trim();
  if (title) {
    points.push({ row_index: 0, columns: ['title', 'url'], values: [{ label: 'title', value: title }, { label: 'url', value: url }] });
  }

  // Extract tables
  $('table').each((ti, table) => {
    const headers = [];
    $(table).find('thead th, tr:first-child th, tr:first-child td').each((_, th) => {
      headers.push($(th).text().trim());
    });

    $(table).find('tbody tr, tr').slice(headers.length ? 1 : 0).each((ri, tr) => {
      const values = [];
      $(tr).find('td, th').each((ci, td) => {
        const label = headers[ci] || ('col_' + ci);
        values.push({ label, value: $(td).text().trim() });
      });
      if (values.length >= 2) {
        points.push({
          row_index: points.length,
          columns: headers.length ? headers : values.map((v) => v.label),
          source_type: 'html-table',
          table_index: ti,
          values,
        });
      }
    });
  });

  // Extract list items if no tables
  if (!points.length) {
    $('li, p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 10 && text.length < 500) {
        points.push({
          row_index: points.length,
          columns: ['content'],
          source_type: 'html-text',
          values: [{ label: 'content', value: text }],
        });
      }
    });
  }

  // Fallback: body text
  if (!points.length) {
    const body = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 5000);
    const sentences = body.split(/[。.!！?？\n]/).filter((s) => s.trim().length > 5);
    sentences.slice(0, 30).forEach((s, i) => {
      points.push({
        row_index: i,
        columns: ['content'],
        source_type: 'html-body',
        values: [{ label: 'content', value: s.trim() }],
      });
    });
  }

  return { title, points };
}

module.exports = { parseURL };
