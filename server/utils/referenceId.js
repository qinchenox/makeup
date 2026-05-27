'use strict';

const crypto = require('crypto');

let _counter = 0;
let _lastSecond = '';

function generateRefId() {
  const now = new Date();
  const ts = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  if (ts !== _lastSecond) {
    _lastSecond = ts;
    _counter = 0;
  }
  _counter++;
  const rand = crypto.randomBytes(2).toString('hex');
  return 'REF-' + now.getFullYear() + '-' + rand + String(_counter).padStart(3, '0');
}

function generateContentHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

module.exports = { generateRefId, generateContentHash };
