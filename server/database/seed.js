'use strict';

const path = require('path');
const { initDatabase } = require('../config/database.js');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'makeup.db');
console.log('[seed] Initializing database at', dbPath);

const db = initDatabase(dbPath);

// Seed admin user
const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'admin123';
const email = process.env.ADMIN_EMAIL || 'admin@makeup.local';

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (!existing) {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO users (username, password_hash, display_name, email, role, department)
    VALUES (?, ?, ?, ?, 'admin', 'IT')`).run(username, hash, '系统管理员', email);
  console.log('[seed] Admin user created:', username);
} else {
  console.log('[seed] Admin user already exists, skipping');
}

// Seed categories
const categories = [
  '市场数据', '研发配方', '安全检测', '法规政策',
  '消费者调研', '销售数据', '竞品分析', '其他',
];

const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, name_zh, sort_order) VALUES (?, ?, ?)');
for (let i = 0; i < categories.length; i++) {
  insertCat.run(categories[i], categories[i], i);
}
console.log('[seed] Categories seeded:', categories.length);

// Seed default sensitive words
const words = [
  { word: '身份证号', category: 'PII', severity: 'critical', replacement: '***' },
  { word: '手机号码', category: 'PII', severity: 'high', replacement: '***' },
  { word: '银行卡号', category: 'financial', severity: 'critical', replacement: '***' },
  { word: '薪资', category: 'trade_secret', severity: 'high', replacement: '***' },
  { word: '核心配方', category: 'trade_secret', severity: 'critical', replacement: '***' },
];

const insertWord = db.prepare('INSERT OR IGNORE INTO sensitive_words (word, category, severity, replacement) VALUES (?, ?, ?, ?)');
for (const w of words) {
  insertWord.run(w.word, w.category, w.severity, w.replacement);
}
console.log('[seed] Sensitive words seeded:', words.length);

// Seed default brand config
const defaultBrand = JSON.stringify({
  primaryColor: '#4f46e5',
  secondaryColor: '#f0f2f5',
  fontFamily: 'Microsoft YaHei, sans-serif',
  logoText: 'Makeup',
  footerText: '化妆品数据安全智能体 © 2026',
});

const existingBrand = db.prepare('SELECT id FROM brand_configs WHERE is_default = 1').get();
if (!existingBrand) {
  db.prepare(`INSERT INTO brand_configs (name, owner_id, is_default, config_json)
    SELECT '默认品牌', id, 1, ? FROM users WHERE username = ?`).run(defaultBrand, username);
  console.log('[seed] Default brand config created');
}

console.log('[seed] Done.');
db.close();
