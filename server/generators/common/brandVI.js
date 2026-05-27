'use strict';

const DEFAULT_BRAND = {
  primaryColor: '4F46E5',
  secondaryColor: 'F0F2F5',
  accentColor: '818CF8',
  fontFamily: 'Microsoft YaHei',
  logoText: 'Makeup',
  footerText: '化妆品数据安全智能体 - 数据溯源文档',
  fontSize: { title: 28, subtitle: 18, body: 14, footnote: 10 },
};

function loadBrandConfig(db) {
  try {
    const row = db.prepare('SELECT config_json FROM brand_configs WHERE is_default = 1 LIMIT 1').get();
    if (row) return { ...DEFAULT_BRAND, ...JSON.parse(row.config_json) };
  } catch (_) { /* fall through */ }
  return DEFAULT_BRAND;
}

function appplyBrandVI(brand) {
  const b = { ...DEFAULT_BRAND, ...brand };
  return {
    ...b,
    primaryColorHex: b.primaryColor.replace('#', ''),
    secondaryColorHex: b.secondaryColor.replace('#', ''),
    accentColorHex: b.accentColor.replace('#', ''),
  };
}

module.exports = { loadBrandConfig, appplyBrandVI, DEFAULT_BRAND };
