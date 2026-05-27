'use strict';

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

async function seed() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: 'public' } });

  console.log('[seed] Supabase URL:', SUPABASE_URL);

  // Seed admin user
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const email = process.env.ADMIN_EMAIL || 'admin@makeup.local';

  const { data: existing } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
  if (!existing) {
    const hash = bcrypt.hashSync(password, 10);
    const { error } = await supabase.from('users').insert({
      username, password_hash: hash, display_name: '系统管理员',
      email, role: 'admin', department: 'IT',
    });
    if (error) console.error('[seed] Admin error:', error.message);
    else console.log('[seed] Admin user created:', username);
  } else {
    console.log('[seed] Admin user already exists, skipping');
  }

  // Seed categories
  const categories = ['市场数据','研发配方','安全检测','法规政策','消费者调研','销售数据','竞品分析','其他'];
  for (let i = 0; i < categories.length; i++) {
    const { data: exists } = await supabase.from('categories').select('id').eq('name', categories[i]).maybeSingle();
    if (!exists) {
      await supabase.from('categories').insert({ name: categories[i], name_zh: categories[i], sort_order: i });
    }
  }
  console.log('[seed] Categories seeded:', categories.length);

  // Seed sensitive words
  const words = [
    { word: '身份证号', category: 'PII', severity: 'critical', replacement: '***' },
    { word: '手机号码', category: 'PII', severity: 'high', replacement: '***' },
    { word: '银行卡号', category: 'financial', severity: 'critical', replacement: '***' },
    { word: '薪资', category: 'trade_secret', severity: 'high', replacement: '***' },
    { word: '核心配方', category: 'trade_secret', severity: 'critical', replacement: '***' },
  ];
  for (const w of words) {
    const { data: exists } = await supabase.from('sensitive_words').select('id').eq('word', w.word).maybeSingle();
    if (!exists) {
      await supabase.from('sensitive_words').insert(w);
    }
  }
  console.log('[seed] Sensitive words seeded:', words.length);

  // Seed default brand config
  const { data: existingBrand } = await supabase.from('brand_configs').select('id').eq('is_default', true).maybeSingle();
  if (!existingBrand) {
    const defaultBrand = {
      primaryColor: '#4f46e5', secondaryColor: '#f0f2f5',
      fontFamily: 'Microsoft YaHei, sans-serif', logoText: 'Makeup',
      footerText: '化妆品数据安全智能体 © 2026',
    };
    const { data: admin } = await supabase.from('users').select('id').eq('username', username).single();
    await supabase.from('brand_configs').insert({
      name: '默认品牌', owner_id: admin?.id || 1, is_default: true, config_json: defaultBrand,
    });
    console.log('[seed] Default brand config created');
  }

  console.log('[seed] Done.');
}

seed().catch(e => console.error('[seed] Error:', e.message)).then(() => process.exit(0));
