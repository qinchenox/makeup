'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function initDatabase(dbPath) {
  const resolved = dbPath || path.join(__dirname, 'makeup.db');
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf-8');
  db.exec(schema);

  return db;
}

module.exports = { initDatabase };
