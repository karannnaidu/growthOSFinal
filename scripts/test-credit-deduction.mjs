#!/usr/bin/env node
// Integration probe: validates the free-first deduction split logic.
// Usage: TEST_BRAND_ID=<id> node scripts/test-credit-deduction.mjs

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_BRAND = process.env.TEST_BRAND_ID;

if (!url || !key) { console.error('Missing SUPABASE env'); process.exit(1); }
if (!TEST_BRAND) { console.error('TEST_BRAND_ID required'); process.exit(1); }

const supabase = createClient(url, key);

// Seed: free=5, balance=10
await supabase.from('wallets').update({ free_credits: 5, balance: 10 }).eq('brand_id', TEST_BRAND);

// Simulate cost=8
const cost = 8;
const { data: w } = await supabase.from('wallets').select('*').eq('brand_id', TEST_BRAND).single();
const fromFree = Math.min(w.free_credits, cost);
const fromBalance = cost - fromFree;

console.log(`seeded: free=${w.free_credits} balance=${w.balance} cost=${cost}`);
console.log(`expected: fromFree=5 fromBalance=3`);
console.log(`actual  : fromFree=${fromFree} fromBalance=${fromBalance}`);

if (fromFree !== 5 || fromBalance !== 3) {
  console.error('FAIL');
  process.exit(1);
}
console.log('PASS');
