'use strict';

const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function initSupabase() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  const key = process.env.SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

  supabase = createClient(url, key, {
    db: { schema: 'public' },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return supabase;
}

function getDb() {
  if (!supabase) initSupabase();
  return supabase;
}

module.exports = { initSupabase, getDb };
