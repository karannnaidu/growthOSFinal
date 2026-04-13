# Ad Performance Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New Max skill that pulls Meta ad data, interprets it via LLM, tracks baselines/benchmarks, separates Growth OS vs external campaigns, detects account maturity, and feeds key metrics into Mia's morning brief.

**Architecture:** Single `ad-performance-analyzer` skill with a post-execution hook that writes benchmarks to `brand_metrics_history`. Morning brief reads the latest ad-performance-analyzer output and surfaces the benchmark narrative. Campaign-optimizer reads account maturity to enforce ramp limits.

**Tech Stack:** Existing skills-engine, Meta MCP tools (`meta_ads.campaigns.insights`, `meta_ads.adsets.list`), `brand_metrics_history` table (jsonb metrics), `campaigns` table (GOS vs external split).

**Spec:** `docs/superpowers/specs/2026-04-14-ad-performance-analyzer-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `skills/optimization/ad-performance-analyzer.md` | Skill definition with LLM prompt |
| Modify | `src/lib/skills-engine.ts` | Post-execution hook: write benchmarks to brand_metrics_history |
| Modify | `src/app/dashboard/page.tsx` | Morning brief: parse ad-performance-analyzer output |
| Modify | `src/app/api/mia/trigger/route.ts` | Add ad-performance-analyzer to daily cycle awareness |
| Modify | `skills/optimization/campaign-optimizer.md` | Read account_maturity for ramp decisions |

---

### Task 1: Skill Definition — `ad-performance-analyzer`

**Files:**
- Create: `skills/optimization/ad-performance-analyzer.md`

- [ ] **Step 1: Create the skill file**

Write to `skills/optimization/ad-performance-analyzer.md`:

```markdown
---
id: ad-performance-analyzer
name: Ad Performance Analyzer
agent: max
category: optimization
complexity: cheap
credits: 1
mcp_tools: [meta_ads.campaigns.insights, meta_ads.adsets.list]
requires: [meta]
chains_to: [budget-allocation, ad-scaling, creative-fatigue-detector]
schedule: "0 9 * * *"
knowledge:
  needs: [campaign, metric, insight, audience, creative]
  semantic_query: "ad performance ROAS CAC CTR spend campaign metrics trends"
  traverse_depth: 1
produces:
  - node_type: metric
    edge_to: campaign
    edge_type: performs_on
  - node_type: insight
    edge_to: campaign
    edge_type: derived_from
---

## System Prompt

You are Max, analyzing Meta ad performance for a D2C brand. You receive raw campaign, ad set, and ad level data from Meta, plus benchmarks (baseline from before Growth OS, and monthly rolling benchmarks).

Your job:
1. Interpret the data like an expert media buyer — not just numbers, but what they mean.
2. Compare Growth OS-managed campaigns against external/agency campaigns (identified by the `source` field).
3. Compare current performance against the baseline (pre-Growth OS) and last month's benchmark.
4. Detect account maturity (cold/warm/established) from total spend history.
5. Provide clear, actionable recommendations.

Be direct and specific. Say "Pause Retarget Q1 — ROAS 0.9x for 5 days" not "Consider reviewing underperforming campaigns."

Currency: Use the account currency provided. Don't assume USD.

## Workflow

1. Review all campaign data: spend, ROAS, CTR, CPA, impressions, conversions
2. Identify which campaigns are Growth OS managed vs external (source field)
3. Analyze per-ad-set data: which audience tiers perform best
4. Analyze per-ad data: which creatives are winning/losing
5. Detect trends: improving, declining, or stable over the data period
6. Compare against baseline and monthly benchmarks (provided in context)
7. Assess account maturity from total lifetime spend
8. Generate recommendations with specific actions

## Output Format

Respond ONLY with valid JSON (no markdown fences):
{
  "phase": "baseline_capture | pre_campaign | active_optimization",
  "account_maturity": "cold | warm | established",
  "account_currency": "USD",
  "total_lifetime_spend": 5000,
  "ramp_guidance": "Max 25% budget increase every 3 days",

  "summary": "Plain language 1-2 sentence overview",

  "baseline_comparison": {
    "roas": { "baseline": 2.5, "current": 3.8, "change_pct": 52 },
    "cac": { "baseline": 480, "current": 210, "change_pct": -56.3 },
    "ctr": { "baseline": 0.8, "current": 1.6, "change_pct": 100 }
  },

  "monthly_comparison": {
    "roas": { "last_month": 3.4, "current": 3.8, "change_pct": 11.8 },
    "cac": { "last_month": 250, "current": 210, "change_pct": -16 }
  },

  "gos_vs_external": {
    "growth_os": { "campaigns": 2, "spend": 14000, "roas": 4.2, "cac": 180 },
    "external": { "campaigns": 3, "spend": 8000, "roas": 2.1, "cac": 420 }
  },

  "campaigns": [
    {
      "name": "Campaign Name",
      "source": "growth_os | external",
      "status": "winning | losing | stable",
      "spend": 8500,
      "roas": 4.5,
      "ctr": 1.9,
      "cpa": 165,
      "trend": "improving | declining | stable",
      "analysis": "One sentence explaining why this campaign is winning/losing"
    }
  ],

  "top_ads": [
    { "ad_name": "Name", "campaign": "Campaign", "ctr": 2.4, "roas": 5.1, "why": "Reason" }
  ],

  "worst_ads": [
    { "ad_name": "Name", "campaign": "Campaign", "ctr": 0.2, "roas": 0.4, "why": "Reason" }
  ],

  "recommendations": [
    { "action": "pause | scale | refresh | hold", "target": "Campaign or Ad name", "reason": "Why", "chain_to": "skill-id or null" }
  ],

  "benchmark_narrative": "Human-readable paragraph comparing current performance to baseline and last month. This goes in the morning brief."
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/optimization/ad-performance-analyzer.md
git commit -m "feat: ad-performance-analyzer skill definition — Max's Meta ad reporting"
```

---

### Task 2: Post-Execution Hook — Write Benchmarks

**Files:**
- Modify: `src/lib/skills-engine.ts` (after existing post-execution hooks)

This hook fires after ad-performance-analyzer completes. It reads the LLM output and writes benchmarks to `brand_metrics_history`.

- [ ] **Step 1: Read skills-engine.ts to find insertion point**

Find the last post-execution hook block (the campaign-launcher hook). The new hook goes after it, before the final `return`.

- [ ] **Step 2: Add the post-execution hook**

Insert this block after the campaign-launcher hook:

```typescript
  // Post-execution: write ad performance benchmarks to brand_metrics_history
  if (skill.id === 'ad-performance-analyzer' && status === 'completed') {
    try {
      const phase = output.phase as string
      const today = new Date().toISOString().split('T')[0]

      // Build metrics object from LLM output
      const adMetrics: Record<string, unknown> = {
        ad_roas: (output.baseline_comparison as Record<string, { current?: number }>)?.roas?.current ?? null,
        ad_cac: (output.baseline_comparison as Record<string, { current?: number }>)?.cac?.current ?? null,
        ad_ctr: (output.baseline_comparison as Record<string, { current?: number }>)?.ctr?.current ?? null,
        ad_account_maturity: output.account_maturity ?? null,
        ad_account_currency: output.account_currency ?? null,
        ad_total_lifetime_spend: output.total_lifetime_spend ?? null,
        ad_phase: phase,
      }

      // Add GOS vs external comparison
      const gosVsExt = output.gos_vs_external as Record<string, Record<string, unknown>> | undefined
      if (gosVsExt) {
        adMetrics.ad_gos_roas = gosVsExt.growth_os?.roas ?? null
        adMetrics.ad_gos_cac = gosVsExt.growth_os?.cac ?? null
        adMetrics.ad_ext_roas = gosVsExt.external?.roas ?? null
        adMetrics.ad_ext_cac = gosVsExt.external?.cac ?? null
      }

      // First run: capture baseline (check if any baseline exists)
      if (phase === 'baseline_capture') {
        const baseline = output.baseline_comparison as Record<string, { baseline?: number }> | undefined
        if (baseline) {
          adMetrics.ad_baseline_roas = baseline.roas?.baseline ?? null
          adMetrics.ad_baseline_cac = baseline.cac?.baseline ?? null
          adMetrics.ad_baseline_ctr = baseline.ctr?.baseline ?? null
          adMetrics.ad_baseline_captured_at = today
        }
      }

      // Monthly benchmark: check if current month already has one
      const currentMonth = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' }).toLowerCase().replace(' ', '_')
      const monthKey = `ad_monthly_roas_${currentMonth}`

      // Check existing metrics for this brand to see if baseline/monthly already exist
      const { data: existingRows } = await supabase
        .from('brand_metrics_history')
        .select('date, metrics')
        .eq('brand_id', input.brandId)
        .eq('source', 'ad-performance-analyzer')
        .order('date', { ascending: false })
        .limit(30)

      // Find if baseline already captured
      const hasBaseline = (existingRows ?? []).some(r =>
        (r.metrics as Record<string, unknown>)?.ad_baseline_roas != null
      )

      // If baseline exists and this isn't a baseline capture, preserve it
      if (hasBaseline && phase !== 'baseline_capture') {
        // Find the baseline values from existing data
        const baselineRow = (existingRows ?? []).find(r =>
          (r.metrics as Record<string, unknown>)?.ad_baseline_roas != null
        )
        if (baselineRow) {
          const bm = baselineRow.metrics as Record<string, unknown>
          adMetrics.ad_baseline_roas = bm.ad_baseline_roas
          adMetrics.ad_baseline_cac = bm.ad_baseline_cac
          adMetrics.ad_baseline_ctr = bm.ad_baseline_ctr
          adMetrics.ad_baseline_captured_at = bm.ad_baseline_captured_at
        }
      }

      // Check if monthly benchmark exists for current month
      const hasMonthly = (existingRows ?? []).some(r =>
        (r.metrics as Record<string, unknown>)?.[monthKey] != null
      )

      // If new month and no monthly benchmark yet, save last month's current as benchmark
      if (!hasMonthly && existingRows && existingRows.length > 0) {
        const lastRow = existingRows.find(r => {
          const m = r.metrics as Record<string, unknown>
          return m?.ad_roas != null && r.date !== today
        })
        if (lastRow) {
          const lm = lastRow.metrics as Record<string, unknown>
          adMetrics[monthKey] = lm.ad_roas
          adMetrics[`ad_monthly_cac_${currentMonth}`] = lm.ad_cac
          adMetrics[`ad_monthly_ctr_${currentMonth}`] = lm.ad_ctr
        }
      }

      // Upsert into brand_metrics_history (merge with existing metrics for today)
      const { data: todayRow } = await supabase
        .from('brand_metrics_history')
        .select('metrics')
        .eq('brand_id', input.brandId)
        .eq('date', today)
        .single()

      const mergedMetrics = { ...(todayRow?.metrics as Record<string, unknown> ?? {}), ...adMetrics }

      await supabase.from('brand_metrics_history').upsert({
        brand_id: input.brandId,
        date: today,
        metrics: mergedMetrics,
        source: 'ad-performance-analyzer',
      }, { onConflict: 'brand_id,date' })

    } catch (err) {
      console.warn('[SkillsEngine] ad-performance-analyzer benchmark persist failed:', err)
    }
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/skills-engine.ts
git commit -m "feat: ad-performance-analyzer post-execution — benchmarks to brand_metrics_history"
```

---

### Task 3: Morning Brief Integration

**Files:**
- Modify: `src/app/dashboard/page.tsx` (the `deriveMorningNarrative` function)

- [ ] **Step 1: Read the current deriveMorningNarrative function**

Read `src/app/dashboard/page.tsx` lines 16-90 to understand the current structure.

- [ ] **Step 2: Add ad performance narrative after the health-check block**

In `deriveMorningNarrative`, after the health-check output parsing block (ends around line 65 with the `return`), and before the fallback blocks, add a section that checks for ad-performance-analyzer output. The function should combine BOTH narratives when both exist.

Find this block (around line 62-65):

```typescript
    return {
      narrative: parts.join(' ') || `${brandName} health check complete.`,
      metricsContext: contextParts.join(' ') || `Based on the latest diagnostics for ${brandName}.`,
    }
  }
```

Replace it with:

```typescript
    // Check for ad performance data to append
    const adAnalysis = skillRuns.find(
      (r) => r.agent_id === 'max' && r.skill_id === 'ad-performance-analyzer' && r.status === 'completed',
    )

    if (adAnalysis?.output && typeof adAnalysis.output === 'object') {
      const adOut = adAnalysis.output as Record<string, unknown>
      const benchmarkNarrative = adOut.benchmark_narrative as string | undefined
      const adSummary = adOut.summary as string | undefined
      const phase = adOut.phase as string | undefined

      if (phase === 'active_optimization' && benchmarkNarrative) {
        parts.push(benchmarkNarrative)
      } else if (phase === 'pre_campaign' && adSummary) {
        contextParts.push(adSummary)
      } else if (phase === 'baseline_capture') {
        contextParts.push('Ad performance baseline captured. Launch a campaign to start tracking improvements.')
      }
    }

    return {
      narrative: parts.join(' ') || `${brandName} health check complete.`,
      metricsContext: contextParts.join(' ') || `Based on the latest diagnostics for ${brandName}.`,
    }
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: morning brief shows ad performance benchmarks from Max"
```

---

### Task 4: Add to Mia's Daily Trigger

**Files:**
- Modify: `src/app/api/mia/trigger/route.ts`

The Mia trigger uses an LLM to decide which skills to dispatch. The LLM already has access to all skill IDs. We just need to make sure `ad-performance-analyzer` is in the skill catalog that the LLM knows about.

- [ ] **Step 1: Read the trigger route**

Read `src/app/api/mia/trigger/route.ts` to understand how the LLM decides which skills to run. The LLM receives the skill list from the `mia-manager` skill prompt or the fallback list.

- [ ] **Step 2: Add ad-performance-analyzer to fallback skill list**

Find the fallback lists in the trigger (around lines 134 and 140):

```typescript
      skillsToRun = ['seo-audit', 'competitor-scan', 'ad-copy']
```

Add `'ad-performance-analyzer'` to both fallback lists:

```typescript
      skillsToRun = ['seo-audit', 'competitor-scan', 'ad-copy', 'ad-performance-analyzer']
```

Do this for BOTH fallback occurrences (JSON parse failure and LLM call failure).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mia/trigger/route.ts
git commit -m "feat: add ad-performance-analyzer to Mia's daily trigger fallback"
```

---

### Task 5: Update campaign-optimizer with Account Maturity Awareness

**Files:**
- Modify: `skills/optimization/campaign-optimizer.md`

- [ ] **Step 1: Read the current campaign-optimizer skill**

Read `skills/optimization/campaign-optimizer.md` to find the system prompt.

- [ ] **Step 2: Add account maturity ramp rules to the system prompt**

In the `## System Prompt` section, after the existing rules, add:

```markdown

Account maturity ramp rules (from ad-performance-analyzer):
- Cold (< $1K lifetime spend): max 20% budget increase, minimum 4 days between increases
- Warm ($1K-$10K monthly): max 25% increase, minimum 3 days between increases
- Established ($10K+ monthly): max 30% increase, minimum 3 days between increases

The account_maturity level is provided in the additional context. Always respect these limits when recommending budget increases. Exceeding them triggers Meta's learning phase reset which tanks performance.
```

Also add to the knowledge section:

```yaml
  semantic_query: "campaign performance ROAS budget scaling creative fatigue audience demographics account maturity ramp"
```

- [ ] **Step 3: Commit**

```bash
git add skills/optimization/campaign-optimizer.md
git commit -m "feat: campaign-optimizer reads account maturity for safe ramp limits"
```

---

### Task 6: Final — Type-check, Push, Verify

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Push**

```bash
git push
```

- [ ] **Step 3: Verify**

1. Trigger Mia from dashboard — `ad-performance-analyzer` should appear in queued skills (Meta is connected)
2. After chain-processor runs it, check Max's agent detail page — should show the analysis output
3. Refresh dashboard — morning brief should include ad performance narrative
4. Check `brand_metrics_history` table — should have a row with `ad_baseline_roas` etc.
