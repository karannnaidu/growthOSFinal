// Run: npx tsx scripts/migrate-skill-frontmatter.ts
// Phase 2 migration: adds safety metadata + Mia-facing descriptions to every
// picker-eligible skill frontmatter. Idempotent — running twice is a no-op.
//
// Fields added:
//  - side_effect: 'none' | 'external_write' | 'spend' | 'send'
//  - reversible: boolean
//  - requires_human_approval: boolean
//  - description_for_mia:   contract-shaped (input/output/use-when)
//  - description_for_user:  friendly one-liner shown in UI
//
// Skips foundation files and mia-manager workspace fixtures (non-picker).

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import matter from 'gray-matter'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_ROOT = resolve(__dirname, '..', 'skills')

type SideEffect = 'none' | 'external_write' | 'spend' | 'send'

type SkillMeta = {
  side_effect: SideEffect
  reversible: boolean
  requires_human_approval: boolean
  description_for_mia: string
  description_for_user: string
}

// ---------------------------------------------------------------------------
// Override map — one entry per picker-eligible skill. Keyed by frontmatter id.
// ---------------------------------------------------------------------------
const OVERRIDES: Record<string, SkillMeta> = {
  // ---------------- acquisition ----------------
  'audience-targeting': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: brand + product context, existing customer signals. Output: targeting spec (interests, lookalikes, exclusions) persisted as audience node. Use when: launching new campaigns, expanding audiences, or after persona changes.',
    description_for_user:
      'Builds a targeting blueprint (interests, lookalikes, exclusions) for your ad campaigns.',
  },
  'campaign-launcher': {
    side_effect: 'spend',
    reversible: true,
    requires_human_approval: true,
    description_for_mia:
      'Input: audience + creative + budget. Output: live Meta/Google campaign. Use when: user has approved a plan and is ready to spend. Blocked if Meta not connected.',
    description_for_user:
      'Launches a campaign on Meta/Google with the creative and audience you approved.',
  },
  'influencer-finder': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: brand niche + target persona. Output: ranked list of candidate creators with fit scores. Use when: exploring creator partnerships or UGC sourcing.',
    description_for_user:
      'Finds creators who match your brand and audience.',
  },
  'influencer-tracker': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: active creator campaigns. Output: performance report per creator (reach, CPA, attributed revenue). Use when: checking ROI of ongoing creator relationships.',
    description_for_user:
      'Tracks how your creator partnerships are performing.',
  },
  'retargeting-strategy': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: site traffic + abandoned cart data. Output: retargeting funnel spec (segments, creatives, frequency caps). Use when: ROAS drops or new abandoned-cart volume appears.',
    description_for_user:
      'Designs a retargeting funnel to win back visitors who did not convert.',
  },

  // ---------------- creative ----------------
  'ad-copy': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: product + persona + angle. Output: ad headlines and body variants (draft creatives). Use when: new campaigns, creative fatigue detected, or angle refresh needed.',
    description_for_user:
      'Writes ad copy variants for your campaigns.',
  },
  'brand-voice-extractor': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: existing copy samples. Output: brand voice profile (tone, vocab, do/dont examples). Use when: onboarding a new brand or voice drifts across channels.',
    description_for_user:
      'Captures your brand voice so every piece of copy sounds like you.',
  },
  'creative-fatigue-detector': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: ad performance time series. Output: flags per creative (fresh/fading/fatigued) + suggested refresh cadence. Use when: CTR drops or CPA rises on running campaigns.',
    description_for_user:
      'Spots which ads are burning out so you know what to refresh.',
  },
  'email-copy': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: campaign purpose + audience segment. Output: subject lines + email body variants (drafts, not sent). Use when: new flow, seasonal push, or low open rate rescue.',
    description_for_user:
      'Drafts email copy for flows and campaigns.',
  },
  'image-brief': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: ad angle + brand kit. Output: image generation brief (composition, style, props) ready for Creative Studio. Use when: new visual creatives needed.',
    description_for_user:
      'Writes the brief that drives image generation for your ads.',
  },
  'social-content-calendar': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: brand + seasonal context + persona. Output: 2-4 week post calendar (drafts, unpublished). Use when: organic cadence is stale or planning a launch.',
    description_for_user:
      'Plans your upcoming social posts as a calendar.',
  },
  'ugc-scout': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: brand + product tags. Output: list of existing UGC mentions with usage-rights signal. Use when: looking for authentic creative to license.',
    description_for_user:
      'Finds real UGC of your product already on the internet.',
  },
  'ugc-script': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: product + angle + persona. Output: short UGC-style scripts with hook/problem/reveal beats. Use when: sourcing creator briefs or generating persona-feedback videos.',
    description_for_user:
      'Writes short creator-style scripts for UGC ads.',
  },

  // ---------------- customer-intel ----------------
  'customer-signal-analyzer': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: reviews, support tickets, returns notes. Output: themed signals (objections, delights, gaps). Use when: pre-persona, pre-creative-angle, or after returns spike.',
    description_for_user:
      'Reads what your customers are saying and surfaces the themes.',
  },
  'persona-ab-predictor': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: creative variants + persona set. Output: predicted CTR/CVR per persona-variant pair. Use when: deciding which creative to launch without a live test.',
    description_for_user:
      'Predicts which creative will win with which audience before you spend.',
  },
  'persona-builder': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: customer signals + product context. Output: 3-5 named personas with JTBD, objections, triggers (persisted). Use when: onboarding, re-segmentation, or after signal analysis.',
    description_for_user:
      'Builds named buyer personas you can target and message directly.',
  },
  'persona-creative-review': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: creative + persona. Output: roleplay critique (what resonates / what falls flat) per persona. Use when: QA before launch or diagnosing weak CTR.',
    description_for_user:
      'Runs your ad past each persona for a reality check.',
  },
  'persona-feedback-video': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: persona + creative. Output: short generated feedback video (avatar + voice) for qualitative review. Use when: user wants visceral read on a creative.',
    description_for_user:
      'Generates a short video of a persona reacting to your creative.',
  },
  'returns-analyzer': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: returns + reviews. Output: return-reason clustering with revenue-at-risk. Use when: return rate ticks up or unit economics degrade.',
    description_for_user:
      'Explains why people return products and what it is costing you.',
  },

  // ---------------- diagnosis ----------------
  'anomaly-detection': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: metric time series (revenue, CPA, traffic). Output: flagged anomalies with severity. Use when: heartbeat wake, after platform sync, or before daily digest.',
    description_for_user:
      'Flags sudden changes in your numbers before they become problems.',
  },
  'competitor-creative-library': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: competitor set. Output: scraped ad library snapshots (active creatives, offers, angles). Use when: creative brainstorm or monitoring a rival launch.',
    description_for_user:
      'Pulls the ads your competitors are currently running.',
  },
  'competitor-scan': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: competitor URLs. Output: snapshot of positioning, pricing, on-site offers. Use when: weekly sweep or before strategy changes.',
    description_for_user:
      'Checks what your competitors are doing and how they position.',
  },
  'competitor-status-monitor': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: tracked competitor set. Output: diff since last scan (new products, price moves, copy changes). Use when: any meaningful change triggers alerting.',
    description_for_user:
      'Watches your competitors and tells you when they change something important.',
  },
  'competitor-traffic-report': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: competitor domains. Output: estimated traffic, channel mix, trend. Use when: benchmarking share of voice or budget justifications.',
    description_for_user:
      'Estimates how much traffic competitors get and where from.',
  },
  'health-check': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: brand orders/products/campaigns. Output: health insights + flagged anomalies + suggested next skills. Use when: first wake of the day or after major data sync.',
    description_for_user:
      'Reads your whole business and tells you what is working and what needs attention.',
  },

  // ---------------- finance ----------------
  'cash-flow-forecast': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: revenue run-rate + spend + inventory commitments. Output: 8-12 week cash forecast with risk bands. Use when: budget decisions, reorder planning, or user asks for runway.',
    description_for_user:
      'Projects your cash position over the next couple of months.',
  },
  'unit-economics': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: orders + ad spend + COGS. Output: CAC, AOV, contribution margin, LTV. Use when: onboarding, quarterly check, or before scale decisions.',
    description_for_user:
      'Calculates the real unit economics of your business.',
  },

  // ---------------- growth ----------------
  'ai-visibility-optimize': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: current AI-visibility probe. Output: on-site recommendations (schema, content, citations) to raise LLM-answer presence. Use when: probe score is low or new LLM surfaces appear.',
    description_for_user:
      'Makes your brand show up more often in AI answers (ChatGPT, Perplexity, etc).',
  },
  'ai-visibility-probe': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: brand + category queries. Output: frequency/position your brand appears in LLM answers. Use when: baselining AI visibility or measuring optimizer impact.',
    description_for_user:
      'Tests how often your brand shows up in AI search answers.',
  },
  'brand-dna-extractor': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: website + product pages + existing copy. Output: brand DNA (values, promise, positioning, pillars) persisted. Use when: onboarding or a rebrand.',
    description_for_user:
      'Captures what makes your brand distinctive, from your own content.',
  },
  'geographic-markets': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: order history + traffic sources. Output: ranked geo opportunities with sizing. Use when: expansion planning or regional ad allocation.',
    description_for_user:
      'Tells you which regions or countries to grow into next.',
  },
  'keyword-strategy': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: product pages + competitor SERPs. Output: keyword map grouped by intent + priority. Use when: SEO kickoff, new product line, or content planning.',
    description_for_user:
      'Builds a keyword map for your SEO and content.',
  },
  'programmatic-seo': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: true,
    description_for_mia:
      'Input: keyword map + product catalog. Output: drafted programmatic pages (not published). Use when: scaling organic reach and user explicitly opts in.',
    description_for_user:
      'Drafts a large set of SEO landing pages you can review before publishing.',
  },
  'seo-audit': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: site URL. Output: crawl + audit report with prioritized issues. Use when: SEO baseline, after site changes, or monthly review.',
    description_for_user:
      'Audits your site for SEO issues and prioritizes fixes.',
  },

  // ---------------- ops ----------------
  'billing-check': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: subscription + usage. Output: billing summary, upcoming charges, cost anomalies. Use when: user asks about billing or monthly rollup.',
    description_for_user:
      'Summarises your subscription and upcoming charges.',
  },
  'compliance-checker': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: ad creative + landing page. Output: policy-risk flags (Meta, Google, legal categories). Use when: pre-launch QA on new creatives.',
    description_for_user:
      'Checks your ads and landing pages for policy issues before launch.',
  },
  'inventory-alert': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: SKU stock + sell-through. Output: stockout risk list with days-of-cover. Use when: daily sweep or before ad scale-up.',
    description_for_user:
      'Warns you when a SKU is about to run out.',
  },
  'product-launch-playbook': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: new product context. Output: end-to-end launch playbook (creative, channels, timing, metrics). Use when: user announces a launch.',
    description_for_user:
      'Writes a full launch plan for a new product.',
  },
  'reorder-calculator': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: sell-through + lead time + cash. Output: reorder quantity recommendation per SKU (persisted). Use when: stock dips or quarterly planning.',
    description_for_user:
      'Tells you how much to reorder for each SKU and when.',
  },
  'seasonal-planner': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: category + geo + historical seasonality. Output: 90-day seasonal calendar (campaigns, stock, creative). Use when: quarterly planning or ahead of holidays.',
    description_for_user:
      'Plans your next 90 days around seasonal peaks.',
  },
  'weekly-report': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: last 7 days of metrics + skill runs. Output: weekly narrative report with wins/losses/next. Use when: Monday morning or explicit request.',
    description_for_user:
      'Writes your weekly performance report.',
  },
  'whatsapp-briefing': {
    side_effect: 'send',
    reversible: false,
    requires_human_approval: true,
    description_for_mia:
      'Input: brand + digest content + recipient. Output: WhatsApp message sent to user. Use when: user has opted in to WhatsApp briefings and it is the scheduled time.',
    description_for_user:
      'Sends you a WhatsApp briefing with the day\'s highlights.',
  },

  // ---------------- optimization ----------------
  'ab-test-design': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: hypothesis + traffic + conversion baseline. Output: A/B test plan (variants, sample size, duration). Use when: user wants to validate before rolling out.',
    description_for_user:
      'Designs an A/B test with the right sample size and duration.',
  },
  'ad-performance-analyzer': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: campaign metrics time series. Output: winners/losers, cohort breakdowns, diagnosis. Use when: weekly review or after budget changes.',
    description_for_user:
      'Analyses your ad performance and explains what is driving results.',
  },
  'ad-scaling': {
    side_effect: 'spend',
    reversible: true,
    requires_human_approval: true,
    description_for_mia:
      'Input: winning campaign + headroom + budget cap. Output: scaled budget applied on Meta/Google. Use when: winner identified and user has pre-approved scaling.',
    description_for_user:
      'Scales up budget on winning campaigns, within the limits you set.',
  },
  'budget-allocation': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: channel performance + total budget. Output: reallocation scenarios (A/B/C) with projected impact. Use when: monthly plan or ROAS drift.',
    description_for_user:
      'Shows you how to reshuffle your budget across channels for better returns.',
  },
  'campaign-optimizer': {
    side_effect: 'spend',
    reversible: true,
    requires_human_approval: true,
    description_for_mia:
      'Input: running campaign diagnostics. Output: applied optimizations (pause, bid, audience, creative swap). Use when: clear signal exists and user pre-approved ops.',
    description_for_user:
      'Tunes your live campaigns to improve ROAS.',
  },
  'channel-expansion-advisor': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: current channel mix + unit economics. Output: ranked next-channel recommendations with entry cost. Use when: growth stalls on current channels.',
    description_for_user:
      'Tells you which new marketing channel to try next.',
  },
  'page-cro': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: page URL + traffic data. Output: prioritized CRO recommendations (copy, layout, UX). Use when: weak CVR on key pages.',
    description_for_user:
      'Finds ways to make your landing pages convert more visitors.',
  },
  'pricing-optimizer': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: price + margin + conversion curve + competitors. Output: recommended price points per SKU. Use when: margin pressure or quarterly pricing review.',
    description_for_user:
      'Recommends price changes that can lift margin without killing demand.',
  },
  'signup-flow-cro': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: signup funnel analytics. Output: step-level fixes to raise completion. Use when: signup drop-off is high.',
    description_for_user:
      'Fixes the drop-offs in your signup flow.',
  },

  // ---------------- retention ----------------
  'abandoned-cart-recovery': {
    side_effect: 'send',
    reversible: false,
    requires_human_approval: true,
    description_for_mia:
      'Input: abandoned-cart list + copy. Output: recovery emails/SMS sent. Use when: flow is connected and user opted in to automatic recovery.',
    description_for_user:
      'Sends recovery messages to shoppers who abandoned their cart.',
  },
  'churn-prevention': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: subscriber cohort behaviour. Output: at-risk customers + suggested intervention. Use when: churn trends upward or before quarterly reviews.',
    description_for_user:
      'Spots customers likely to churn and suggests how to save them.',
  },
  'email-flow-audit': {
    side_effect: 'none',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: ESP flow configs + performance. Output: gap list and fix priorities. Use when: onboarding ESP or quarterly retention review.',
    description_for_user:
      'Audits your email automations and flags what is missing.',
  },
  'loyalty-program-designer': {
    side_effect: 'external_write',
    reversible: true,
    requires_human_approval: false,
    description_for_mia:
      'Input: AOV, repeat rate, margin. Output: loyalty program spec (tiers, rewards, economics). Use when: repeat rate plateaus or user asks for loyalty plan.',
    description_for_user:
      'Designs a loyalty program tailored to your margins and customers.',
  },
  'review-collector': {
    side_effect: 'send',
    reversible: false,
    requires_human_approval: true,
    description_for_mia:
      'Input: recent orders past delivery window. Output: review-request emails/SMS sent. Use when: user has opted in and volume threshold met.',
    description_for_user:
      'Asks recent buyers for reviews at the right moment.',
  },
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------
function walkMarkdown(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) {
      // Skip mia-manager workspace fixtures — they are eval outputs, not skills.
      if (p.includes('mia-manager-workspace')) continue
      walkMarkdown(p, acc)
    } else if (name.endsWith('.md')) {
      acc.push(p)
    }
  }
  return acc
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const files = walkMarkdown(SKILLS_ROOT)
  let patched = 0
  let skipped = 0
  let missing: string[] = []

  for (const file of files) {
    const raw = readFileSync(file, 'utf-8')
    const parsed = matter(raw)
    const id = parsed.data?.id as string | undefined

    // Foundation helpers and the mia-manager meta skill: skip.
    if (!id || file.includes('/_foundation/') || file.includes('\\_foundation\\')) {
      skipped++
      continue
    }
    if (id === 'mia-manager') {
      skipped++
      continue
    }

    const override = OVERRIDES[id]
    if (!override) {
      missing.push(`${id}  (${file})`)
      continue
    }

    // Idempotent: only rewrite when something actually changes.
    const fm = { ...parsed.data }
    let changed = false
    for (const key of Object.keys(override) as (keyof SkillMeta)[]) {
      if (fm[key] !== override[key]) {
        fm[key] = override[key]
        changed = true
      }
    }

    if (!changed) {
      skipped++
      continue
    }

    const next = matter.stringify(parsed.content, fm)
    writeFileSync(file, next, 'utf-8')
    patched++
  }

  // eslint-disable-next-line no-console
  console.log(`Patched: ${patched}`)
  // eslint-disable-next-line no-console
  console.log(`Skipped: ${skipped}`)
  if (missing.length) {
    console.error(`\nMissing override map entries for ${missing.length} skill(s):`)
    for (const m of missing) console.error(`  - ${m}`)
    process.exit(1)
  }
}

main()
