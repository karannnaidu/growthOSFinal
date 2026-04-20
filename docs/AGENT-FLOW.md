# Mia & Agents — How It Works

_A simple visual guide._

---

## Part 1 — What happens when a new brand onboards?

```
   ┌─────────────────────────────────────────────────────────────┐
   │  USER SIGNS UP → CONNECTS STORE → PICKS FOCUS (e.g. "grow   │
   │  revenue")                                                  │
   └──────────────────────────┬──────────────────────────────────┘
                              │
                              ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  POST /api/onboarding/set-focus                             │
   │                                                             │
   │   1.  Initialize all 12 agents in DB (brand_agents table)   │
   │   2.  Mark some as "revealed" based on focus                │
   │   3.  FIRE → runSkill('health-check')   ← Scout kicks off   │
   └──────────────────────────┬──────────────────────────────────┘
                              │
                              ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  Scout runs ONE skill: health-check                         │
   │   • pulls store metrics                                     │
   │   • scans reviews & returns                                 │
   │   • writes a "state of the brand" report                    │
   └──────────────────────────┬──────────────────────────────────┘
                              │
                              ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  /onboarding/diagnosis  — user sees the report              │
   │           ↓                                                 │
   │      /dashboard         — Mia is now "awake"                │
   └─────────────────────────────────────────────────────────────┘
```

**That's it for Day 0.** Only Scout runs. No other agents fire automatically yet.

---

## Part 2 — Then what? The daily Mia loop.

Every day at **8:00 AM** (cron `0 8 * * *`), Mia wakes up and decides what to do:

```
   ┌───────────────────────────────────────────────────────────┐
   │             MIA'S DAILY LOOP                              │
   └───────────────────────────────────────────────────────────┘

   08:00 ─────────────────────────────────────────────────────►

       ┌─────────────┐
       │ 1. SCOUT    │   always first — health-check baseline
       │  health-    │
       │   check     │
       └──────┬──────┘
              │
              ▼
       ┌─────────────────────────────────────────┐
       │ 2. GATHER CONTEXT                       │
       │   • brand profile   • connected stack   │
       │   • past memories   • user instructions │
       └──────────────────┬──────────────────────┘
                          │
                          ▼
       ┌─────────────────────────────────────────┐
       │ 3. MIA THINKS (Gemini Flash)            │
       │   Reads Scout's report + context        │
       │   Outputs: { skills_to_run: [...] }     │
       └──────────────────┬──────────────────────┘
                          │
                          ▼
       ┌─────────────────────────────────────────┐
       │ 4. CHAIN EXECUTES (one at a time)       │
       │                                         │
       │   Example today:                        │
       │   ┌─ Aria  → creative-fatigue-detector  │
       │   ├─ Max   → ad-performance-analyzer    │
       │   ├─ Luna  → abandoned-cart-recovery    │
       │   └─ Penny → unit-economics             │
       │                                         │
       │   Tomorrow the list could be different. │
       └──────────────────┬──────────────────────┘
                          │
                          ▼
       ┌─────────────────────────────────────────┐
       │ 5. MIA BRIEFS YOU                       │
       │   "Here's what I found. Here's what I   │
       │    already did. Here's what needs your  │
       │    approval."                           │
       └─────────────────────────────────────────┘
```

**Key idea:** Only Scout is hardcoded. Every other agent is picked **by Mia's LLM** based on what Scout found. No fixed pipeline. Different days → different agents run.

---

## Part 3 — The 12 agents, what they own

```
   ╔═══════════════════════════════════════════════════════════╗
   ║                   MIA — the manager                       ║
   ║   mia-manager  •  weekly-report  •  seasonal-planner      ║
   ║   product-launch-playbook  •  whatsapp-briefing           ║
   ║   (can trigger any of the 11 specialists below)           ║
   ╚════════════════════════════════╦══════════════════════════╝
                                    │
        ┌───────────┬──────────┬────┴────┬──────────┬────────────┐
        ▼           ▼          ▼         ▼          ▼            ▼
   ┌────────┐  ┌────────┐  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
   │ SCOUT  │  │ ARIA   │  │ LUNA   │ │ HUGO   │ │ SAGE   │ │ MAX    │
   │ diag.  │  │ creat. │  │ email  │ │ SEO    │ │ CRO    │ │ budget │
   │ daily  │  │ ad-hoc │  │ Mon    │ │ Tue    │ │ ad-hoc │ │ daily  │
   │ 4 sk.  │  │ 7 sk.  │  │ 6 sk.  │ │ 3 sk.  │ │ 4 sk.  │ │ 6 sk.  │
   └────────┘  └────────┘  └────────┘ └────────┘ └────────┘ └────────┘

        ┌───────────┬──────────┬─────────┬──────────┐
        ▼           ▼          ▼         ▼          ▼
   ┌────────┐  ┌────────┐  ┌────────┐ ┌────────┐ ┌────────┐
   │ ATLAS  │  │ ECHO   │  │ NOVA   │ │ NAVI   │ │ PENNY  │
   │audience│  │compet. │  │AI-srch.│ │invent. │ │finance │
   │ Wed    │  │ Thu    │  │ 1st/mo │ │ daily  │ │ daily  │
   │ 9 sk.  │  │ 4 sk.  │  │ 3 sk.  │ │ 3 sk.  │ │ 3 sk.  │
   └────────┘  └────────┘  └────────┘ └────────┘ └────────┘
```

### Full skill breakdown

| Agent | Role | Runs | Skills |
|---|---|---|---|
| **Mia** | Manager | daily 08:00 | mia-manager · weekly-report · seasonal-planner · product-launch-playbook · whatsapp-briefing |
| **Scout** | Diagnostician | daily 06:00 | health-check · anomaly-detection · customer-signal-analyzer · returns-analyzer |
| **Aria** | Creative Dir. | when Mia asks | ad-copy · image-brief · ugc-script · social-content-calendar · ugc-scout · creative-fatigue-detector · brand-voice-extractor |
| **Luna** | Email / Retention | Mondays 08:00 | email-copy · email-flow-audit · abandoned-cart-recovery · churn-prevention · review-collector · loyalty-program-designer |
| **Hugo** | SEO / Content | Tuesdays 08:00 | seo-audit · keyword-strategy · programmatic-seo |
| **Sage** | CRO + Pricing | when Mia asks | page-cro · signup-flow-cro · ab-test-design · pricing-optimizer |
| **Max** | Budget + Channels | daily 09:00 | budget-allocation · ad-scaling · channel-expansion-advisor · ad-performance-analyzer · campaign-optimizer · campaign-launcher |
| **Atlas** | Audiences / Personas | Wednesdays 08:00 | audience-targeting · retargeting-strategy · influencer-finder · influencer-tracker · persona-builder · persona-creative-review · persona-ab-predictor · persona-feedback-video · geographic-markets |
| **Echo** | Competitor Intel | Thursdays 08:00 | competitor-scan · competitor-creative-library · competitor-traffic-report · competitor-status-monitor |
| **Nova** | AI Visibility | 1st of month | brand-dna-extractor · ai-visibility-probe · ai-visibility-optimize |
| **Navi** | Inventory / Compliance | daily 07:00 | inventory-alert · reorder-calculator · compliance-checker |
| **Penny** | Finance | daily 08:00 | billing-check · unit-economics · cash-flow-forecast |

**Total:** 12 agents · 57 skills assigned.

---

## Part 4 — Are all skills mapped? ✅ Yes (with 1 technicality)

```
   ON DISK            IN agents.json           MAPPED?
   ─────────────────────────────────────────────────────
   57 agent skills ──────► 57 entries ─────► ✓ 1:1

   2 foundation skills:
     • brand-kit         ──► (shared helper, not an agent skill)
     • product-context   ──► (shared helper, not an agent skill)
```

Every skill an agent is supposed to own → has a file on disk.
Every file on disk that's meant to belong to an agent → is wired up.
The 2 `_foundation/` skills are utilities the other skills call — they don't belong to a single agent on purpose.

**Verdict: no orphans, no gaps.**

---

## TL;DR

1. **Onboarding → only Scout runs** (health-check). One agent.
2. **Every morning Mia wakes up**, reads Scout's report, **picks which specialists to run today**. Different days → different agents.
3. **12 agents own 57 skills**, mapping is complete.

Mia is the brain. The other 11 are hands she picks up when needed.
