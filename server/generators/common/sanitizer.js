'use strict';

function loadSensitiveWords(db) {
  try {
    return db.prepare('SELECT word, replacement, severity FROM sensitive_words WHERE is_active = 1').all();
  } catch (_) {
    return [];
  }
}

function scanContent(text, words) {
  const findings = [];
  for (const w of words) {
    if (text.includes(w.word)) {
      findings.push({ word: w.word, severity: w.severity });
    }
  }
  return findings;
}

function sanitizeText(text, words) {
  let sanitized = text;
  for (const w of words) {
    const escaped = w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sanitized = sanitized.replace(new RegExp(escaped, 'g'), w.replacement || '***');
  }
  return sanitized;
}

function isBlocked(findings) {
  return findings.some((f) => f.severity === 'critical');
}

module.exports = { loadSensitiveWords, scanContent, sanitizeText, isBlocked };
