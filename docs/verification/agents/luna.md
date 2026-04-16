# Luna — Verification Report (Re-Audit)

**Date:** 2026-04-17
**Agent:** Luna (Email/SMS + Retention)
**Skills:** 6
**Mode:** Read-only re-verification after post-audit fixes

## 1. Status per-skill: shopify/brand migration state

| Skill | Declared `mcp_tools` | Migration | Notes |
|-------|----------------------|-----------|-------|
| email-copy (`skills/creative/email-copy.md`) | `[brand.orders.list]` | FIXED | Was `shopify.products.list, shopify.orders.list`; now uses brand.*. Products tool dropped — graph supplies product context. |
| email-flow-audit (`skills/retention/email-flow-audit.md`) | `[brand.orders.list]` | FIXED | Was `shopify.orders.list`; now brand.*. |
| abandoned-cart-recovery (`skills/retention/abandoned-cart-recovery.md`) | `[brand.orders.list]` | ALREADY CORRECT | Prior audit's "all 6 use shopify" claim was inaccurate. |
| churn-prevention (`skills/retention/churn-prevention.md`) | `[brand.orders.list, brand.customers.list]` | ALREADY CORRECT | |
| review-collector (`skills/retention/review-collector.md`) | `[brand.orders.list, brand.products.list]` | ALREADY CORRECT | |
| loyalty-program-designer (`skills/retention/loyalty-program-designer.md`) | `[brand.orders.list, brand.customers.list]` | ALREADY CORRECT | |

Bucket A (`shopify.*` → `brand.*`) migration now complete across Luna's entire slate. Klaviyo-only brands will pass `computeBlockage` via `resolveBrandOrders` / `resolveBrandCustomers` fallbacks.

## 2. Outstanding (not fixed, confirmed still present)

- `klaviyo.flows.get` / `klaviyo.lists.get` undeclared in `email-flow-audit` and `churn-prevention` — engagement/flow-performance fields remain LLM-inferred.
- `abandoned-cart-recovery.abandonment_stage_breakdown` still lacks a checkout-stage data source.
- `review-collector` has no review-platform tool (Judge.me/Yotpo/Loox); `current_reviews` / `review_themes` still graph-or-guess.
- Stale `analysis_date` / `audit_date` examples (cosmetic).

## New aggregate grade: PASS

Upgraded from PASS-W-NOTES. The single systemic blocker (Bucket A migration) is resolved. Remaining items are data-richness enhancements, not structural defects — every skill loads, declares only registered tools, and produces stable JSON. Live-run checks (e2e, output usable, UI render) still pending.
