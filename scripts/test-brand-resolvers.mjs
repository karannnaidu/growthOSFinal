#!/usr/bin/env node
// Probes the brand.products.list resolver.
//
// This script imports a .ts source file directly, so it must be executed
// via a TypeScript-aware loader. Use:
//   TEST_BRAND_ID=<uuid> npx tsx scripts/test-brand-resolvers.mjs
//
// Running with plain `node` will fail on the .ts import.

import { config } from 'dotenv';
config({ path: '.env.local' });

import { resolveBrandProducts } from '../src/lib/resolvers/brand-products.ts';

const TEST = process.env.TEST_BRAND_ID;
if (!TEST) {
  console.error('TEST_BRAND_ID required');
  process.exit(1);
}

const r = await resolveBrandProducts(TEST);
console.log(
  'result:',
  JSON.stringify(
    {
      source: r.source,
      confidence: r.confidence,
      isComplete: r.isComplete,
      count: r.data?.length ?? 0,
    },
    null,
    2,
  ),
);
if (!r.source) {
  console.error('FAIL — no source resolved');
  process.exit(1);
}
console.log('PASS');
