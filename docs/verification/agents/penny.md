# Penny — Verification Report (Re-audit)

**Date:** 2026-04-17
**Agent:** Penny (Finance)
**Skills:** 3 (`billing-check`, `unit-economics`, `cash-flow-forecast`)
**Prior grade:** FAIL (billing-check scope mismatch + no tool plumbing)

## Status of originally-flagged issues

### billing-check — FIXED
- **Rewrite confirmed.** `skills/ops/billing-check.md` now scoped to Growth OS wallet (balance, free credits, auto-recharge, daily burn). Shopify/app/vendor language removed. New name: "Growth OS Billing Monitor". Prompt explicitly disclaims vendor billing ("You do NOT audit Shopify apps, ad platform spend, or third-party SaaS tools").
- **Frontmatter:** `mcp_tools: [gos.wallet.summary]` — declared.
- **Output schema:** rewritten to match new scope — `wallet{balance, free_credits, free_credits_expires_at, auto_recharge_*}`, `usage{credits_used_today, credits_used_this_month, daily_burn_rate, projected_days_to_empty}`, `alerts[]`, `top_cost_drivers[]`, `recommendations[]`. Clean, parseable, numerically typed.
- **Data resolves:** PASS.

### gos.wallet.summary handler — EXISTS AND CORRECT
Located at `src/lib/mcp-client.ts:483–522`. Queries `wallets` (balance, free_credits, free_credits_expires_at, auto_recharge, auto_recharge_threshold, auto_recharge_amount) via service client, aggregates `wallet_transactions` debits for today + month-to-date, returns 20 most recent transactions. Schema returned matches fields the skill prompt consumes. Handler-only correctness looks clean (single-brand scope, null-guards, abs-value sum). One minor note: not wired into `TOOL_PLATFORM` — fine, it's a GOS-internal tool using the service client, no platform credential needed.

### unit-economics / cash-flow-forecast — STILL UNFIXED (as expected)
- `unit-economics` body still references `brand.customers` but `mcp_tools: [brand.orders.list, brand.products.list]` — `brand.customers.list` undeclared.
- `unit-economics` still asks for per-channel CAC/ROAS without `meta_ads.*` or `google_ads.*` declared.
- `cash-flow-forecast` body still references `brand.customers` / `brand.products` but only declares `brand.orders.list`. "Current cash position" still has no dedicated resolver (wallet tool now exists but isn't wired here).

## New aggregate grade: PASS-W-NOTES

| Skill | Prior | Now |
|-------|-------|-----|
| billing-check | FAIL | **PASS** |
| unit-economics | PASS | PASS (same notes) |
| cash-flow-forecast | PASS-W-NOTES | PASS-W-NOTES |

billing-check is no longer the hard structural failure — scope, tool declaration, and backing handler are all coherent. Remaining notes on `unit-economics` / `cash-flow-forecast` are soft (missing tool declarations for body-referenced data), not hard blocks. Live-run checks (runs e2e, output usable, UI renders) still pending across all three.
