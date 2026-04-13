# Mia's Triage Response — Everything On Fire

## Situation Assessment

Scout's health-check came back red across the board:

| Category | Score | Status |
|---|---|---|
| seo | 20 | Critical |
| product_health | 25 | Critical |
| email | 22 | Critical |
| ads | 28 | Critical |
| brand_coherence | 30 | Critical |
| conversion | 35 | Critical |

Connected platforms: Meta Ads only. No Shopify, no GA4, no Klaviyo. Brand DNA exists.

Six critical scores means I can't fix everything at once — I have to sequence this intelligently. Running all six fix agents simultaneously produces noise, not results. The question is: what order creates compounding momentum?

---

## Mia's Triage Reasoning

**Step 1: Eliminate false fires first.**

When everything scores critical with minimal platform connections, some of these low scores reflect missing data, not actual marketing failures. Without GA4, Scout can't measure real conversion rates. Without Klaviyo, email gets scored on structure alone. Without Shopify, product health is estimated. These scores are real warnings — but their severity is partially inflated by data gaps.

This changes my sequencing. I don't treat all six as equally urgent real-world failures. I split them:

- **Structurally fixable now** (Brand DNA + Meta Ads is enough to do real work): brand_coherence, ads, seo, product_health
- **Needs platform data to fix meaningfully**: conversion (needs GA4), email (needs Klaviyo)

**Step 2: Anchor everything in brand coherence first.**

Brand coherence scored 30. This is actually the most dangerous score in the set — not because it's lowest, but because a broken brand voice contaminates every other fix. If Aria fixes ad copy with a misaligned voice, those ads perform worse. If Hugo writes SEO content with the wrong tone, it doesn't convert. Brand DNA exists, which means Aria can run brand-voice-extractor right now and give every other agent a clean foundation.

This is a 30-minute fix that multiplies the quality of everything downstream.

**Step 3: SEO and product health are the same problem.**

SEO scored 20 (lowest overall) and product health scored 25. These are almost certainly linked — weak product page SEO is dragging both scores. Hugo can run seo-audit on product pages using Brand DNA without GA4. The audit will be structural (missing meta descriptions, weak H1s, thin content) rather than traffic-informed, but that's exactly the kind of foundational issue that lands a 20/100 score.

**Step 4: Ads — I have real data here.**

Meta Ads is connected. That means Max and Aria aren't working blind on ads. A score of 28 with actual campaign data means something is genuinely wrong — likely creative fatigue, poor audience segmentation, or budget misallocation. This gets dispatched in parallel with Hugo since Meta data is available.

**Step 5: Conversion and email — flag but don't fake it.**

Sage needs GA4 to do real CRO work. Without traffic data, a page-cro audit is a structural review, not a funnel analysis. Luna needs Klaviyo for a real email audit. I'll run what I can (structural CRO review, email template assessment) but I'll tell the user exactly what they're missing and make connecting these platforms the clear next action.

---

## Dispatch Plan

```json
{
  "decisions": [
    {
      "agent": "aria",
      "skill": "brand-voice-extractor",
      "priority": "1 — immediate",
      "reasoning": "Brand coherence at 30 is the root multiplier. A misaligned brand voice degrades ad copy, SEO content, and product descriptions simultaneously. Running brand-voice-extractor first gives every other agent a clean, validated brand foundation. Brand DNA exists — this runs now with no dependencies.",
      "data_available": "Brand DNA",
      "data_missing": "None required for this skill"
    },
    {
      "agent": "hugo",
      "skill": "seo-audit",
      "priority": "2 — immediate, parallel with ads triage",
      "reasoning": "SEO at 20 is the lowest score in the set. Product health at 25 is almost certainly linked — weak product page optimization drags both. Hugo can run a structural SEO audit from Brand DNA: missing meta tags, thin content, heading structure, internal linking. This is high-leverage foundational work that doesn't require GA4 to be valuable.",
      "data_available": "Brand DNA",
      "data_missing": "GA4 — connect in Settings > Platforms for traffic-specific recommendations (keyword rankings, CTR by page)"
    },
    {
      "agent": "max",
      "skill": "budget-allocation",
      "priority": "2 — immediate, parallel with Hugo",
      "reasoning": "Ads scored 28 and Meta Ads IS connected — this is a real data problem, not a missing-platform problem. Max can analyze actual ROAS, spend distribution, and campaign performance right now. A 28 with live data means money is likely being burned on underperforming segments.",
      "data_available": "Brand DNA + Meta Ads (connected)",
      "data_missing": "None blocking — Meta Ads gives Max everything needed"
    },
    {
      "agent": "aria",
      "skill": "creative-fatigue-detector",
      "priority": "3 — after brand voice extraction completes",
      "reasoning": "Once brand voice is clarified, Aria checks whether current ad creatives are fatigued or misaligned. Ads at 28 with Meta connected means we can see impression frequency and engagement decay. Running this after brand-voice-extractor ensures new creative recommendations align to the corrected voice.",
      "data_available": "Brand DNA + Meta Ads",
      "data_missing": "None"
    },
    {
      "agent": "sage",
      "skill": "page-cro",
      "priority": "4 — structural audit only, flag GA4 gap",
      "reasoning": "Conversion at 35 needs attention but without GA4 I can only do a structural CRO audit — above-fold layout, CTA placement, form friction, trust signals. This is real and useful but not a full funnel analysis. Dispatching Sage now with explicit scope limitation. Connecting GA4 will unlock the real fix.",
      "data_available": "Brand DNA + website scraping",
      "data_missing": "GA4 — STRONGLY recommend connecting. Without it, Sage can only audit page structure, not actual drop-off points or conversion funnels."
    },
    {
      "agent": "luna",
      "skill": "email-flow-audit",
      "priority": "4 — template review only, flag Klaviyo gap",
      "reasoning": "Email at 22 is critical but Luna is flying partially blind without Klaviyo. I can assess flow structure, sequence logic, and copy quality from Brand DNA and what's visible. But open rates, click rates, and list health require Klaviyo. Running a partial audit now so there's something actionable — but this score won't move meaningfully until Klaviyo is connected.",
      "data_available": "Brand DNA",
      "data_missing": "Klaviyo — connect in Settings > Platforms for actual flow performance, open rates, and list segmentation data"
    }
  ],
  "skipped": [
    {
      "agent": "navi",
      "reason": "Shopify not connected. Inventory and reorder alerts require order data. Compliance-checker can run from Brand DNA if needed — flag it separately."
    },
    {
      "agent": "penny",
      "reason": "Shopify not connected. Unit economics and cash flow require revenue data. Penny can work with manually entered financials — direct the user to Penny's agent page if they want to unblock this."
    },
    {
      "agent": "atlas",
      "reason": "Not a priority in a critical-score triage. Persona refinement is a Tier 2 weekly task. Queue for next weekly cycle once the foundation is stabilized."
    },
    {
      "agent": "nova",
      "reason": "AI visibility optimization is valuable but not an emergency fix during critical triage. Queue for next cycle."
    },
    {
      "agent": "echo",
      "reason": "Competitor scan is part of the daily cycle, not emergency triage. Will run in the next daily cycle once the acute fires are addressed."
    }
  ],
  "platform_gaps": {
    "ga4": {
      "impact": "Blocks real CRO work for Sage. Conversion score (35) will stay estimated without it.",
      "urgency": "High — connect this week"
    },
    "klaviyo": {
      "impact": "Blocks real email audit for Luna. Email score (22) won't move meaningfully without it.",
      "urgency": "High — connect this week"
    },
    "shopify": {
      "impact": "Blocks Navi and Penny entirely. Product health score partially estimated.",
      "urgency": "Medium — important for Tier 3 agents, but current triage can proceed without it"
    }
  },
  "message_to_user": "Everything is critical — I hear you. Here's the honest take: with only Meta Ads connected, some of these scores are inflated by missing data, but all of them represent real problems. I'm not going to throw all 12 agents at this at once. That produces reports, not results.\n\nMy sequence: Aria runs brand-voice-extractor first because a broken brand voice is the silent multiplier — it makes every other fix less effective. While that runs, Hugo audits your SEO structure and Max digs into your Meta Ads spend with real data. Once brand voice is clean, Aria checks creative fatigue. Then Sage and Luna do what they can without GA4 and Klaviyo — structural reviews that will give you real actions but won't reach their full potential until those platforms are connected.\n\nThe two things that will unlock the most improvement fastest: connect GA4 and Klaviyo. Without them, I'm fixing the walls when I can't see the foundation. Get those connected and I'll re-run the health-check — I expect conversion and email scores to recalibrate significantly.\n\nStarting now with Aria, Hugo, and Max in parallel."
}
```

---

## Summary: Why This Order

1. **Brand coherence first** — it's the foundation every other agent builds on. Fix it before creating more misaligned output.
2. **SEO + Ads in parallel** — both have enough data to act on right now. These are the highest-leverage structural fixes.
3. **Creative fatigue after brand voice** — sequence matters. Don't audit creative against a broken voice standard.
4. **Conversion + email with explicit scope limits** — do useful structural work, be honest about what's missing, make platform connections the clear call-to-action.
5. **Skip non-emergency agents** — Navi, Penny, Atlas, Nova, and Echo are important but not triage priorities. Queue them properly.

**The real priority is platform connections.** Six critical scores with one platform connected is a data problem as much as a marketing problem. The path to green is: fix the foundation with Brand DNA, connect GA4 + Klaviyo, re-run health-check.
