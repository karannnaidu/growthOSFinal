# Growth OS v2 — Design Gap PRD

> **Purpose:** Rebuild all UI pages to match the designed visuals in `stitch_new_project/`, wire every UI element to real backend, add missing features and integrations.
> **Created:** 2026-04-09
> **Depends on:** All 10 phases of the original implementation (complete)
> **Design source:** `stitch_new_project/` — 23 directories with `code.html` + `screen.png` each

---

## Overview

The original 10-phase build created a functional backend (skills engine, AI router, Mia orchestrator, OAuth, billing, cron) and placeholder UI. This PRD covers rebuilding every user-facing page to match the designed visuals, connecting all interactions to real backend operations, and adding missing features.

### Layers

| Layer | Scope | Depends on |
|-------|-------|------------|
| 0 | Integration Audit & Wiring | Nothing — do first |
| 1 | Visual Foundation (images, sidebar, fal.ai) | Layer 0 |
| 2 | Dashboard + Chat Rebuild | Layer 1 |
| 3 | Agent & Skills Pages Rebuild | Layer 1 |
| 4 | New Features (Deploy Agent, Campaign, Pitch Deck) | Layers 2-3 |

---

## Layer 0: Integration Audit & Wiring

**Goal:** Every button, link, and interaction in the UI connects to a real backend action. Zero dead ends, zero placeholder data, zero broken routes.

### Audit Scope

#### Sidebar Navigation
- Every nav item links to a working page
- Active state correctly highlights current page
- Wallet balance displays real data from `wallets` table

#### Dashboard (`/dashboard`)
- Briefing data from real `skill_runs` and `notifications`
- "Execute Strategy" / recommendation CTAs trigger real skill runs via `POST /api/skills/run`
- Metric cards show real data from `brand_metrics_history`
- Agent chain visualization reflects real running skill_runs

#### Chat (`/dashboard/chat`)
- Messages stream via SSE from `POST /api/mia/chat`
- `[ACTION:skill-id]` buttons in Mia's responses trigger real skill runs
- Conversation history loads from `conversation_messages` table

#### Agent Directory + Detail
- Card clicks navigate to `/dashboard/agents/[agentId]`
- "Run" buttons call `POST /api/skills/run` with correct `skillId` and `brandId`
- Enable/Disable toggles call `PATCH /api/agents/[agentId]/config`
- Status indicators show real current activity from latest `skill_runs`

#### Billing (`/dashboard/billing`)
- Top-up buttons create real Stripe Checkout sessions
- Auto-recharge toggle persists to `wallets` table
- Transaction history from real `wallet_transactions`

#### Settings (`/dashboard/settings`)
- All tabs save to real API endpoints
- Platform connect buttons trigger real OAuth flows
- AI preset radio saves to `brands.ai_preset`
- Team invite creates real `brand_members` records

#### Onboarding (`/onboarding/*`)
- Step 1 creates brand + wallet with 100 free credits
- Step 2 saves focus_areas + initializes brand_agents
- Step 3 triggers real OAuth (Shopify/Meta/Google)
- Step 4 runs real `health-check` skill with live progress polling

#### Notifications
- Bell shows real unread count from `notifications` table
- Click notification marks as read + navigates to `action_url`
- Polling every 30s for new notifications

#### Command Palette (Cmd+K)
- "Run Skill" actions trigger real `/api/skills/run`
- Navigation items go to correct pages
- Agent search links to correct detail pages

#### Landing Page
- All CTAs link to `/signup`
- Pricing table links to `/signup` with plan preselected

### Deliverable
A systematic pass through every page. For each broken interaction: identify the issue, fix the wiring, verify it works end-to-end.

---

## Layer 1: Visual Foundation

**Goal:** Real agent images, rebuilt sidebar matching designs, fal.ai connected.

### 1.1 Agent Character Images

#### From CDN (download to `public/agents/`)

| Agent | File | Source |
|-------|------|--------|
| Mia | `mia.png` | `mia_s_orchestration_dashboard/code.html` — high-tech robot avatar, cyan accents |
| Mia (chat variant) | `mia-chat.png` | `chat_with_mia/code.html` — professional woman with glasses |
| Mia (directory variant) | `mia-directory.png` | `agent_directory/code.html` — holographic brain icon |
| Scout | `scout.png` | `agent_directory/code.html` — digital eye, orange/amber |
| Aria | `aria.png` | `agent_detail_aria_creative/code.html` — woman, purple lighting |
| Hugo | `hugo.png` | `agent_detail_hugo_seo/code.html` — technical robot, magnifying glass |
| Max | `max.png` | `agent_detail_max_budget/code.html` — warm amber AI persona |
| Penny | `penny.png` | `agent_detail_penny_finance/code.html` — sophisticated female agent |

All CDN URLs are `lh3.googleusercontent.com/aida-public/...` — download at build time and serve statically.

#### Generate via fal.ai (save to `public/agents/`)

| Agent | Prompt Style | Accent Color |
|-------|-------------|--------------|
| Luna | Gentle AI persona, email/retention theme, soft green glow, dark background | #10B981 |
| Sage | Analytical AI agent, conversion funnel motif, purple glow | #8B5CF6 |
| Atlas | Intelligence AI agent, audience network visualization, rose glow | #E11D48 |
| Echo | Stealth AI agent, competitive intelligence theme, slate tones | #64748B |
| Nova | AI discovery agent, violet search/visibility nodes | #7C3AED |
| Navi | Operations guardian AI, sky blue system monitoring theme | #0EA5E9 |

Style consistency: all generated images should match the aesthetic of the CDN images — futuristic AI agent portraits, dark backgrounds, accent color glow, ~512x512px.

### 1.2 fal.ai Integration

**New file: `src/lib/fal-client.ts`**

```typescript
interface ImageGenerationOptions {
  prompt: string;
  width?: number;      // default 512
  height?: number;     // default 512
  model?: string;      // default 'fal-ai/flux/schnell'
  num_images?: number; // default 1
}

interface ImageResult {
  url: string;
  width: number;
  height: number;
  content_type: string;
}

export async function generateImage(options: ImageGenerationOptions): Promise<ImageResult>
export async function generateAgentPortrait(agentId: string, style: string): Promise<ImageResult>
```

- REST API: `POST https://queue.fal.run/{model}` with `Authorization: Key {FAL_AI_KEY}`
- Used by: agent image generation script, `image-brief` skill execution, campaign flow
- Env var: `FAL_AI_KEY` added to `.env.local.example`

**One-time script: `scripts/generate-agent-images.ts`**
- Generates the 6 missing agent portraits via fal.ai
- Saves to `public/agents/`
- Run manually: `npx tsx scripts/generate-agent-images.ts`

### 1.3 AgentAvatar Component Upgrade

Update `src/components/agents/agent-avatar.tsx`:
- Use real images from `public/agents/{agentId}.png`
- Fallback chain: real image → gradient circle with initial
- Support multiple image variants per agent (Mia has 3)
- Keep existing size/state props

### 1.4 Sidebar Rebuild

Replace current sidebar with design-matching version:

```
┌─────────────────────┐
│ [Mia avatar]        │
│ Mia                 │
│ Manager Agent       │
├─────────────────────┤
│ ◆ Mia Orchestrator  │  → /dashboard
│   Marketing Agents  │  → /dashboard/agents
│   Agent Skills      │  → /dashboard/skills (NEW)
│   Billing & Usage   │  → /dashboard/billing
├─────────────────────┤
│ [+ New Campaign]    │  → /dashboard/campaigns/new (NEW)
├─────────────────────┤
│   Settings          │  → /dashboard/settings
│   Support           │  → external link or /support
├─────────────────────┤
│ Penny's Wallet:     │
│ 2,450 credits       │  ← live from wallets table
└─────────────────────┘
```

- Mia avatar at top (real image, not icon)
- Nav labels match designs exactly
- "New Campaign" CTA button with accent styling
- Live wallet balance fetched from Supabase
- Mobile: bottom nav with same items (icon-only)
- Active state: indigo left border + text highlight

### 1.5 Top Bar Updates

- "MARKETING AI" branding text (left, uppercase)
- Search bar: "Search agents..." placeholder
- Wallet chip: "Penny's Wallet: {balance}" with credit icon
- Notifications bell (already built)
- User avatar (already built)

---

## Layer 2: Dashboard + Chat Rebuild

**Goal:** Match `mia_s_orchestration_dashboard` and `chat_with_mia` designs exactly.

### 2.1 Mia Orchestration Dashboard (`/dashboard`)

**Layout:** CSS Grid — `grid-cols-12`, main content `col-span-8`, sidebar `col-span-4`.

#### Main Content (col-span-8)

**Morning Brief Card:**
- "MIA'S MORNING BRIEF" uppercase badge (indigo) + day/date
- Large narrative quote in Manrope font (~24px, italic or weighted):
  > "Growth is steady, but Aria detected ad fatigue in the 'Summer Launch' set. I've tasked Hugo with a technical SEO sweep while we wait for your call."
- Body paragraph with real metrics: revenue change %, ROAS peak, CTR dip, retargeting performance
- Source: generated by calling Mia (Claude) with latest skill_runs data, or composed from last 24h skill outputs
- Two CTAs: "Execute Strategy" (primary, triggers recommended skill) + "View Full Audit" (outline, navigates to latest health-check run)

**Key Metrics Row (3 cards):**

| Card | Data Source | Display |
|------|-----------|---------|
| Revenue | `brand_metrics_history` latest or Shopify orders | $ amount + % change + "Optimal"/"Declining" badge + 5-bar sparkline |
| ROAS | `brand_metrics_history` or Meta Ads insights | Value (e.g., 4.2x) + status badge + sparkline |
| LTV | Computed from orders data | $ amount + "Stable"/"Growing" badge + sparkline |

Sparklines: simple CSS bars (5 bars, varying heights), no chart library needed.

**Mia's Recommendations (2 cards):**
- Left card: green check icon + finding title + description + CTA button (colored by responsible agent). Example: "Aria detected ad fatigue." → "Refresh Creative Now"
- Right card: agent-colored icon + finding + CTA. Example: "Hugo suggests SEO Sweep." → "Run SEO Audit"
- CTAs call `POST /api/skills/run` with the corresponding skill
- Source: filtered from recent `notifications` where `type='insight'` or `type='needs_review'`

#### Right Sidebar (col-span-4)

**Active Agent Chains:**
- Vertical pipeline with connecting line (CSS border-left or SVG)
- Each node: agent avatar (small) + agent name + role + status
- Status types: "Supervising" (Mia), progress bar with % (Hugo), "ACTION REQUIRED" amber badge (Aria), "Standby" grayed (Max)
- Data: query `skill_runs WHERE status='running' AND triggered_by IN ('mia','schedule')` grouped by agent
- Click agent node → navigate to agent detail page

**Internal Log:**
- Dark `bg-[#111c2d]` terminal card with monospace font
- Scrollable, max-height ~200px
- Shows real entries from recent skill_runs and notifications:
  - `> [Mia] Routing 20% traffic to Variant B`
  - `> [Hugo] Found 3 unindexed paths`
  - `> [Aria] Warning: Creative fatigue high...`
- Auto-updates via polling (30s) or Supabase Realtime

**Floating Chat FAB:**
- Fixed position, bottom-right
- Circular dark button with `chat_bubble` icon
- Click → navigates to `/dashboard/chat` or opens chat overlay

### 2.2 Chat with Mia (`/dashboard/chat`)

**Layout:** 3-panel flex — left sidebar (w-64) + center chat (flex-1) + right context panel (w-80).

#### Left Sidebar
- Header: Mia avatar + "Mia Engine" title + "Active Orchestration" subtitle
- "New Initiative" dark CTA button
- Nav items with icons:
  - Intelligence Hub (active, indigo highlight)
  - Aria Creative (Aria's color dot)
  - Scout Diagnosis (Scout's color dot)
  - Max Budget (Max's color dot)
  - Conversation History
- Each agent item filters chat context / shows agent-specific skill history
- Bottom: System Status link, Settings link

#### Center Chat Area
- **Header bar:** "Mia Orchestrator" title + tabs (Insights / Workflows / Agents) + "Deploy Agent" button
- **Message area (scrollable):**
  - User messages: right-aligned, light bg (`bg-white/[0.06]`), rounded corners
  - Mia messages: left-aligned, dark gradient card, with Mia avatar
  - **Rich embedded cards** in Mia's messages: when Mia references agent work, render an inline card:
    ```
    ┌──────────────────────────────┐
    │ 🟠 Hugo | SEO & Diagnostics │
    │                              │
    │ "I've briefed Hugo to run    │
    │  an SEO audit..."            │
    │                              │
    │ Keyword Gap: +24.2%          │
    │ Market Sentiment: High       │
    │ Buy-Intent                   │
    └──────────────────────────────┘
    ```
  - Detection: parse Mia's response for agent references and skill run data, render as cards
  - **Action chips** below messages: "Run Unit Economics", "Explore Creative Themes" — styled as bordered pill buttons, each triggers a skill run
- **Input bar:**
  - Glass-panel rounded bar at bottom
  - Left: MCP tool access button (grid icon) — opens skill selector dropdown
  - Left: Skill selector button (sparkles icon)
  - Center: text input "Command Mia..."
  - Right: attachment button + send button (dark gradient circle)

#### Right Context Panel — Active Context
- **Engine Focus** section:
  - Strategy: shows current campaign/focus (from brand context)
  - Brand Voice: from `brand_guidelines.voice_tone.style`
  - Target ROI: from brand config or last budget-allocation output
- **Delegated Sub-Agents** section:
  - List of agents currently working (from running skill_runs)
  - Each: agent avatar (small) + name + role + status dot (green=active, gray=idle, amber=needs attention)
  - Example: "Aria — Ideation Layer" (green pulse), "Hugo — SEO Diagnostics" (green), "Max — Budget Guardrail" (gray)
- **Ingested Sources** section:
  - Files/data used in current context
  - Sourced from `knowledge_nodes` relevant to current conversation
  - Example: "sales_history_2023.csv", "competitor_site_audit.xml"
- **Mia Status** footer:
  - "Online" status with green dot
  - Activity description: "Currently processing your request using X toolchains and Y sub-agent nodes"

---

## Layer 3: Agent & Skills Pages Rebuild

### 3.1 Agent Directory (`/dashboard/agents`)

**Header:** "Agent Directory" h1 + "Deploy and manage your specialized AI workforce. Each agent is pre-trained for specific growth milestones." subtitle

**Filter tabs** (horizontal, below header):
- All Agents (default) | Creative | Growth | Finance | Diagnosis | Retention | Ops
- Tab categorization mapping:
  - Creative: Aria
  - Growth: Hugo, Nova
  - Finance: Max, Penny
  - Diagnosis: Scout, Echo
  - Retention: Luna
  - Ops: Navi, Sage, Atlas

**Agent card grid** (3 columns desktop, 2 tablet, 1 mobile):

Each card:
```
┌─────────────────────┐
│  [Agent Avatar]      │  ← real image from public/agents/
│   "MANAGER" badge    │  ← only for Mia
│                      │
│  Agent Name          │  ← Manrope heading
│  ROLE TITLE          │  ← agent accent color, uppercase
│                      │
│  Description text    │  ← 2-line truncated
│  that explains...    │
│                      │
│  ┌────────────────┐  │
│  │ Status chip    │  │  ← live: "Routing Aria's workflow"
│  │ ● Running      │  │     "Analyzing GA4 data"
│  └────────────────┘  │     "Idle - Waiting for audit"
└─────────────────────┘     "Replying to 12 comments"
```

- Glass-panel card with hover: elevate + show agent accent glow
- Click card → navigate to `/dashboard/agents/[agentId]`
- Status chip: green dot for running, gray for idle, amber for needs action
- Status text sourced from latest `skill_runs` for that agent + brand

**"Mia Active" popup:**
- When hovering/clicking near Mia's card area, show a floating popover
- Content: Mia's current activity quote (from latest notification or skill run)
- "Command Mia..." input field + send button
- Sends to `POST /api/mia/chat` for quick interaction

### 3.2 Agent Detail Pages (`/dashboard/agents/[agentId]`)

**Layout:** Full-width with sections stacked vertically.

#### Hero Banner
- Full-width dark card (`bg-[#111c2d]`) with unique background per agent
- Background: abstract image (from fal.ai or CSS gradient) at 40% opacity, positioned right
- Left content:
  - Breadcrumb: "Marketing Agents > {Agent Name}"
  - Agent avatar (w-32 h-32) with "ACTIVE" pulse badge
  - Agent name (large Manrope heading)
  - Full role title + description
  - Current task status chip (pulsing): "Designing Summer Ad Variants"
- Right: "Adjust Logic" or "Configure" button

#### Active Skills Grid
- 4-column grid (2 on mobile)
- Each skill card:
  ```
  ┌──────────────────┐
  │ [skill icon]     │ PREMIUM (tier badge, colored)
  │                  │
  │ Skill Name       │
  │ Description      │
  │                  │
  │ ● 12 Credits     │ Run 2m ago
  └──────────────────┘
  ```
- Tier badge colors: Free=green, Cheap=blue, Mid=purple, Premium=indigo
- "Run" button appears on hover
- Click "Run" → calls `POST /api/skills/run`
- Shows "Running..." state with spinner while executing

#### Recent Output
- Latest skill run output rendered as a rich card
- Agent-specific rendering:
  - **Aria:** image preview (if image-brief), ad copy text variants
  - **Hugo:** SEO score ring chart, keyword gains table
  - **Max:** budget allocation bar chart (CSS), ROAS metrics
  - **Penny:** cash flow projection, margin alerts
  - **Scout:** health score number, findings list
  - **Others:** formatted JSON output in a readable card layout

#### Mia Control Panel (right side or below)
- Glass-panel card showing Mia's latest orchestration message about this agent
- "Instruct Mia..." text input → sends to chat API with agent context
- Shows which other agents Mia has linked to this one

#### Agent-Specific Extras

**Hugo detail page:**
- SEO Score: SVG ring chart showing score/100 with monthly change
- Top Keyword Gains: 3-row table (keyword, position, change)
- Budget Burn: monthly cost card

**Max detail page:**
- Financial Performance bento: ROAS actual vs target, CSS bar chart (Meta/Google/YouTube/TikTok/Others spend), Total Spend/Daily Burn/Efficiency Index
- Execution History log: table of recent automated actions

**Penny detail page:**
- 90-Day Cash Projection: CSS bar chart (7 bars, monthly)
- Contribution Margin: amount + % change + leakage alert card
- "View Leakage Report" CTA

**Aria detail page:**
- Recent creative output with image preview (from storage/fal.ai)
- Image Brief snippet with quoted direction text
- "Export to Assets" button

### 3.3 Agent Skills Page (`/dashboard/skills`) — NEW PAGE

**Header:** "Agent Skills" h1 + "Browse and run specialized capabilities across all agents" + "50 skills across 12 agents" count badge

**Filter bar:**
- Category dropdown: All / Diagnosis / Creative / Growth / Retention / Optimization / Finance / Ops / Customer Intel / Acquisition / Planning
- Tier filter: All / Free / Cheap / Mid / Premium
- Search input: "Search skills..."

**Skills grid** (4 columns desktop, 2 tablet, 1 mobile):

Each skill card:
```
┌─────────────────────────┐
│ ━━━━━━━━━━━━━━━━━━━━━━ │  ← agent accent color bar
│ [skill category icon]   │  PREMIUM (tier badge)
│                         │
│ Skill Name              │
│ Brief description of    │
│ what this skill does    │
│                         │
│ 🤖 Agent Name           │  ← agent badge
│ ● 3 Credits  │  [Run]  │
└─────────────────────────┘
```

- All 50 skills from `skills/` directory
- Skill metadata from YAML frontmatter (parsed via skill-loader)
- "Run" button → calls `POST /api/skills/run`
- Shows last run time if available (from `skill_runs` query)
- Click card → expands to show full skill description, inputs, workflow summary

---

## Layer 4: New Features

### 4.1 Deploy Custom Agent (`/dashboard/agents/deploy`) — NEW PAGE

**Access:** Growth and Agency plan brands only. Free/Starter see an upgrade prompt.

**Page layout:**
- Header: "Deploy New Agent" + "Create a custom AI agent with specialized skills"
- Form in a glass-panel card:
  - **Agent Name** — text input
  - **Role Description** — textarea
  - **Base Skills** — multi-select from existing 50 skills (searchable dropdown)
  - **Custom Skill** — toggle to create a new skill:
    - Skill name, ID (auto-generated from name)
    - Complexity dropdown (free/cheap/mid/premium)
    - Credits input
    - Markdown editor textarea with frontmatter template pre-filled
    - Max 10KB validation
  - **Schedule** — optional cron expression or preset (Daily/Weekly/Monthly/Manual)
  - **Auto-approve** — toggle
  - **Submit** → creates `brand_agents` record + optionally `custom_skills` record
- Validation: skill_id unique per brand, markdown < 10KB

### 4.2 New Campaign Flow (`/dashboard/campaigns/new`) — NEW PAGE

Aria-powered multi-step campaign creation:

**Step 1: Define Campaign**
- Campaign name
- Goal: Awareness / Conversion / Retention (radio cards)
- Target audience description (textarea, or select from Atlas personas)
- Budget range
- Duration / timeline
- Platform: Meta / Google / Both

**Step 2: Aria Generates Ad Copy**
- Auto-triggers `ad-copy` skill with campaign context
- Shows progress: "Aria is writing your ad copy..."
- Displays 5 text variants in cards when complete
- Each variant: headline + body + CTA text
- User can edit or regenerate individual variants

**Step 3: Persona Review**
- Auto-triggers `persona-creative-review` skill
- Atlas's personas (3-5) score each variant
- Shows feedback per persona per variant: attention/relevance/purchase-intent scores
- Highlights winning variant

**Step 4: User Approval Gate**
- Summary of persona feedback
- User picks winning variant(s)
- "Approve & Continue" or "Revise" buttons

**Step 5: Image Brief Generation**
- Auto-triggers `image-brief` skill with winning copy
- Shows the generated visual direction (text brief)

**Step 6: fal.ai Image Generation**
- Calls fal.ai API with the image brief as prompt
- Shows loading state: "Generating visuals..."
- Displays 2-4 generated images
- User picks preferred image(s)
- Images stored in Supabase Storage `generated-assets` bucket
- Creates `knowledge_node` of type `ad_creative`

**Step 7: Final Review**
- Complete creative: copy + image side by side
- "Export to Assets" → saves to brand-assets
- "Create Another" → restarts flow
- "Go to Dashboard" → redirects

### 4.3 fal.ai Integration

**New file: `src/lib/fal-client.ts`**

```typescript
export interface ImageGenerationOptions {
  prompt: string;
  width?: number;       // default 1024
  height?: number;      // default 1024
  model?: string;       // default 'fal-ai/flux/schnell'
  num_images?: number;  // default 1
  seed?: number;        // for reproducibility
}

export interface ImageResult {
  url: string;
  width: number;
  height: number;
  content_type: string;
}

// Generate image via fal.ai
export async function generateImage(options: ImageGenerationOptions): Promise<ImageResult[]>

// Generate agent portrait with consistent style
export async function generateAgentPortrait(agentId: string, description: string): Promise<ImageResult>

// Download image from URL and upload to Supabase Storage
export async function saveToStorage(imageUrl: string, brandId: string, path: string): Promise<string>
```

- API: `POST https://queue.fal.run/fal-ai/flux/schnell` with header `Authorization: Key {FAL_AI_KEY}`
- Poll for result: `GET https://queue.fal.run/fal-ai/flux/schnell/requests/{request_id}`
- Wire into skills engine: when `image-brief` skill completes, auto-call fal.ai with the brief output
- Env var: `FAL_AI_KEY`

**One-time script: `scripts/generate-agent-images.ts`**
- Generates portraits for Luna, Sage, Atlas, Echo, Nova, Navi
- Downloads CDN images for Mia, Aria, Hugo, Scout, Max, Penny
- Saves all to `public/agents/`

### 4.4 Pitch Deck Pages — NEW

Convert the pitch deck slides from `stitch_new_project/` into actual pages at `/pitch` or `/deck`:

| Slide | Source Directory | Page |
|-------|-----------------|------|
| Problem/Proof | `pitch_deck_problem_proof_integrated` | `/deck/problem` |
| Aria (Creative) | `pitch_deck_slide_11_aria` | `/deck/aria` |
| Luna (Retention) | `pitch_deck_slide_12_luna` | `/deck/luna` |
| Penny (Finance) | `pitch_deck_slide_13_penny` | `/deck/penny` |
| Hugo & Nova (SEO + AI Search) | `pitch_deck_slide_14_seo_ai_search` | `/deck/seo` |
| Pricing Overview | `pitch_deck_slide_20_pricing_overview_no_notes` | `/deck/pricing` |
| Credit Math | `pitch_deck_slide_21_credit_math` | `/deck/credits` |
| Security & Data | `pitch_deck_slide_a2_security_data` | `/deck/security` |
| Agency Tier | `pitch_deck_slide_a3_agency_tier` | `/deck/agency` |

Each page:
- Convert `code.html` to React/Tailwind using design-informed approach
- Use real agent images from `public/agents/`
- Use CDN images for backgrounds and illustrations
- Responsive (works on projector, desktop, tablet)
- Navigation between slides (prev/next arrows)
- Public pages (no auth required) — for investor/client presentations
- Create `src/app/deck/layout.tsx` with minimal nav (logo + slide indicator)

---

## Environment Variables

Add to `.env.local.example`:
```
FAL_AI_KEY=
```

(All other env vars already configured in previous phases)

---

## Agent Role Corrections

The current sidebar and some components have incorrect agent roles. Fix to match PRD:

| Agent | Current Role (wrong) | Correct Role (PRD) |
|-------|---------------------|-------------------|
| Hugo | varies | SEO Strategist |
| Luna | varies | Email/SMS + Retention |
| Nova | varies | AI Visibility Expert |
| Sage | varies | Conversion Optimizer |
| Atlas | varies | Audience & Persona Intelligence |
| Echo | varies | Competitor Spy |
| Navi | varies | Operations Guardian |

Source of truth: `skills/agents.json` — ensure all UI components reference this file for agent roles.

---

## Image Assets Summary

### From CDN (download to `public/agents/`)
- Mia: 3 variants (robot, portrait, holographic)
- Scout: digital eye icon
- Aria: creative woman portrait
- Hugo: technical robot
- Max: amber AI persona
- Penny: sophisticated female agent
- Shopify logo
- Background images (abstract networks, data streams, neural nets)

### From fal.ai (generate to `public/agents/`)
- Luna, Sage, Atlas, Echo, Nova, Navi portraits
- Per-agent hero backgrounds (12 unique abstracts)

### Agent Hero Backgrounds (for detail pages)
| Agent | Theme | Style |
|-------|-------|-------|
| Mia | Indigo neural orchestration network | Commander |
| Scout | Teal diagnostic scanning grid | Detective |
| Aria | Purple/blue 3D abstract ribbon | Cyberpunk creative |
| Luna | Soft green email flow patterns | Warm retention |
| Hugo | Data-stream network visualization | Technical |
| Sage | Purple conversion funnel abstract | Optimizer |
| Max | Warm amber financial glow | Professional |
| Atlas | Rose audience network graph | Intelligence |
| Echo | Slate competitive landscape | Stealth |
| Nova | Violet AI search discovery nodes | Futuristic |
| Navi | Sky blue operations dashboard | Guardian |
| Penny | Sophisticated dark corporate gradient | Precision |

---

## Layer 5: Missing Production Pages

Pages not in `stitch_new_project/` but required for a production-ready product:

### 5.1 Auth Pages
- **`/forgot-password`** — email input, sends password reset link via Supabase
- **`/reset-password`** — new password form, called from email link
- **`/verify-email`** — confirmation landing after signup ("Check your email")
- Style: same glassmorphic auth layout as login/signup

### 5.2 Skill Run Detail (`/dashboard/runs/[runId]`)
- Shows full output of a single skill run
- Metadata: skill name, agent, model used, tier, credits, duration, triggered by, timestamp
- Output: rendered as formatted JSON or agent-specific rich view
- Actions: "Re-run this skill", "Share output", "Export"
- Linked from: dashboard activity feed, agent detail recent runs, notifications

### 5.3 Campaign List (`/dashboard/campaigns`)
- List of past campaigns created via New Campaign flow
- Each row: campaign name, status (draft/active/completed), agent (Aria), date, assets count
- Click → view campaign detail with all generated assets

### 5.4 Knowledge Graph Browser (`/dashboard/knowledge`)
- Browse brand's knowledge nodes: products, audiences, insights, metrics, creatives
- Filter by node type, search by name
- Click node → see properties, connected edges, snapshots over time
- Visual: list/grid view (not a graph visualization — keep simple)

### 5.5 Legal & Support Pages
- **`/terms`** — Terms of service (static content, editable later)
- **`/privacy`** — Privacy policy (static content)
- **`/support`** — FAQ + contact form or link to help docs
- Style: clean public pages with minimal nav

### 5.6 Error & Status Pages
- **Custom 404** — branded "Page not found" with navigation suggestions
- **Custom 500** — branded error page with "Try again" + support link
- Create `src/app/not-found.tsx` and `src/app/error.tsx`

### 5.7 Export/Download (`/dashboard/exports`)
- Generate downloadable reports from skill runs
- Export formats: PDF summary, CSV data, JSON raw
- History of past exports
- Triggered from: skill run detail pages, agent detail pages

---

## Success Criteria

1. Every page visually matches its `stitch_new_project/` design reference
2. Every button, link, and interaction triggers a real backend operation
3. All 12 agents have real character images (6 CDN + 6 fal.ai generated)
4. All 50 skills are browsable, searchable, and runnable from the UI
5. Campaign creation flow works end-to-end with real skill execution + fal.ai image generation
6. Pitch deck slides render as presentable web pages
7. Mobile responsive across all pages
8. No placeholder text, no broken routes, no fake data
