import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8');

function getEnv(key) {
  const line = envContent.split('\n').find(l => l.startsWith(key + '='));
  return line?.split('=').slice(1).join('=').trim();
}

const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, key);

const { data: brands, error } = await supabase.from('brands').select('*');
console.log('=== BRANDS ===');
if (error) console.log('Error:', error.message);
else console.log(JSON.stringify(brands, null, 2));

if (brands?.length) {
  const brandId = brands[0].id;

  const { data: wallets } = await supabase.from('wallets').select('*').eq('brand_id', brandId);
  console.log('\n=== WALLETS ===');
  console.log(JSON.stringify(wallets, null, 2));

  const { data: runs } = await supabase.from('skill_runs').select('id, skill_id, status, error_message, created_at').eq('brand_id', brandId).order('created_at', { ascending: false }).limit(5);
  console.log('\n=== RECENT SKILL RUNS ===');
  console.log(JSON.stringify(runs, null, 2));
}
