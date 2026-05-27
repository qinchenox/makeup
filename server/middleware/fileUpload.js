'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'storage', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const ALLOWED_EXTS = ['.csv', '.xlsx', '.xls', '.json', '.pdf', '.docx', '.png', '.jpg', '.jpeg', '.txt'];

function fileFilter(_req, file, cb) {
  const ext = file.originalname.split('.').pop().toLowerCase();
  if (ALLOWED_EXTS.includes('.' + ext)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型: ' + file.originalname));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

module.exports = { upload };
