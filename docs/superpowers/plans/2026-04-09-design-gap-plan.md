# Growth OS v2 — Design Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild all UI to match `stitch_new_project/` designs, wire every interaction to real backend, add missing features (fal.ai, campaigns, pitch deck, production pages).

**Architecture:** Design-informed rebuild using existing Tailwind design system + shadcn components. Real agent images (CDN + fal.ai generated). Every button/link connects to existing API routes. New pages for skills browsing, campaign creation, pitch deck, and production essentials.

**Tech Stack:** Next.js 16, Tailwind v4, shadcn/ui, Supabase, fal.ai (flux/schnell), existing skills engine + model router

**Spec:** `docs/superpowers/specs/2026-04-09-design-gap-prd.md`

---

**IMPORTANT DEPENDENCY:** This plan MUST be executed AFTER Plan 1 (Creative Pipeline Foundation) from `docs/superpowers/plans/2026-04-09-master-execution-plan.md`. Plan 1 creates `src/lib/fal-client.ts` with full image/video generation support. Plan 2 Task 2 should NOT recreate this file — instead, it should only download CDN agent images and call the existing `generateAgentPortrait()` function for missing agents.

---

## File Structure

### New Files
```
src/lib/fal-client.ts                          — fal.ai image generation wrapper
scripts/download-agent-images.ts               — download CDN images + generate missing via fal.ai
public/agents/*.png                            — 12 agent portraits (6 CDN + 6 generated)
src/components/dashboard/morning-brief.tsx     — Mia narrative quote card
src/components/dashboard/metric-card.tsx       — Revenue/ROAS/LTV with sparkline
src/components/dashboard/agent-chains.tsx      — vertical agent pipeline visualization
src/components/dashboard/internal-log.tsx      — terminal-style log card
src/components/dashboard/recommendation-card.tsx — Mia action recommendation
src/components/dashboard/chat-fab.tsx          — floating chat button
src/components/chat/active-context.tsx         — right panel: engine focus, sub-agents, sources
src/components/chat/rich-agent-card.tsx        — embedded agent card in chat messages
src/components/chat/chat-sidebar.tsx           — left panel: Mia Engine nav
src/components/agents/agent-hero.tsx           — per-agent hero banner
src/components/agents/skill-card.tsx           — skill card with run button
src/components/agents/agent-output.tsx         — agent-specific output renderers
src/components/agents/mia-control.tsx          — Mia control panel for agent pages
src/app/dashboard/skills/page.tsx              — skills browsing page
src/app/dashboard/agents/deploy/page.tsx       — custom agent deployment
src/app/dashboard/campaigns/new/page.tsx       — campaign creation flow
src/app/dashboard/campaigns/page.tsx           — campaign list
src/app/dashboard/runs/[runId]/page.tsx        — skill run detail
src/app/dashboard/knowledge/page.tsx           — knowledge graph browser
src/app/dashboard/exports/page.tsx             — export/download page
src/app/(auth)/forgot-password/page.tsx        — password reset request
src/app/(auth)/reset-password/page.tsx         — password reset form
src/app/deck/layout.tsx                        — pitch deck layout
src/app/deck/[slideId]/page.tsx                — pitch deck slides (9 slides)
src/app/terms/page.tsx                         — terms of service
src/app/privacy/page.tsx                       — privacy policy
src/app/support/page.tsx                       — support/FAQ page
src/app/not-found.tsx                          — custom 404
```

### Modified Files
```
src/components/dashboard/sidebar.tsx           — full rebuild to match designs
src/components/dashboard/top-bar.tsx           — add MARKETING AI branding, wallet chip
src/components/agents/agent-avatar.tsx         — use real images, fallback to gradient
src/components/agents/agent-card.tsx           — add status indicators, real images
src/components/chat/chat-message.tsx           — add rich embedded cards, action chips
src/components/chat/chat-input.tsx             — add MCP tool + skill selector buttons
src/components/landing/landing-page.tsx        — use real Mia portrait, design match
src/app/dashboard/page.tsx                     — full rebuild: morning brief + metrics + chains
src/app/dashboard/chat/page.tsx                — 3-panel layout rebuild
src/app/dashboard/agents/page.tsx              — filter tabs, status indicators, Mia popup
src/app/dashboard/agents/[agentId]/page.tsx    — hero banners, agent-specific sections
src/app/dashboard/layout.tsx                   — pass wallet balance to sidebar
src/app/onboarding/connect-store/page.tsx      — match design visuals
src/app/onboarding/focus/page.tsx              — match design visuals
src/app/onboarding/platforms/page.tsx          — match design visuals
src/app/onboarding/diagnosis/page.tsx          — match design visuals
.env.local.example                             — add FAL_AI_KEY
```

---

## Task 1: Integration Audit — Fix All Broken Wiring

**Files:**
- Modify: all page and component files listed above (audit, don't rewrite yet)
- Create: `src/lib/brand-context.ts` — shared brand resolution helper

- [ ] **Step 1: Create shared brand resolution helper**

Every page currently duplicates brand fetching logic. Extract to a shared helper:

```typescript
// src/lib/brand-context.ts
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export interface BrandContext {
  brandId: string
  brandName: string
  domain: string | null
  plan: string
  focusAreas: string[]
  aiPreset: string
  walletBalance: number
  freeCredits: number
}

export async function getBrandContext(): Promise<BrandContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Try owner first
  let { data: brand } = await supabase
    .from('brands')
    .select('id, name, domain, plan, focus_areas, ai_preset')
    .eq('owner_id', user.id)
    .limit(1)
    .single()

  // Fallback to member
  if (!brand) {
    const { data: membership } = await supabase
      .from('brand_members')
      .select('brand_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()
    if (!membership) redirect('/onboarding/connect-store')
    const { data: memberBrand } = await supabase
      .from('brands')
      .select('id, name, domain, plan, focus_areas, ai_preset')
      .eq('id', membership.brand_id)
      .single()
    brand = memberBrand
  }

  if (!brand) redirect('/onboarding/connect-store')

  // Get wallet
  const { data: wallet } = await supabase
    .from('wallets')
    .select('balance, free_credits')
    .eq('brand_id', brand.id)
    .single()

  return {
    brandId: brand.id,
    brandName: brand.name,
    domain: brand.domain,
    plan: brand.plan,
    focusAreas: brand.focus_areas || [],
    aiPreset: brand.ai_preset,
    walletBalance: wallet?.balance ?? 0,
    freeCredits: wallet?.free_credits ?? 0,
  }
}
```

- [ ] **Step 2: Audit and fix dashboard layout to use brand context**

Update `src/app/dashboard/layout.tsx` to use `getBrandContext()` and pass `brandId`, `walletBalance` to sidebar and top bar:

```typescript
import { getBrandContext } from '@/lib/brand-context'

export default async function DashboardLayout({ children }) {
  const ctx = await getBrandContext()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        brandId={ctx.brandId}
        walletBalance={ctx.walletBalance + ctx.freeCredits}
      />
      <TopBar
        userEmail={user?.email}
        brandId={ctx.brandId}
        walletBalance={ctx.walletBalance + ctx.freeCredits}
      />
      <main className="md:ml-60 pt-14 pb-20 md:pb-6 min-h-screen p-4 md:p-6">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Fix agent role mismatches**

Ensure all UI components read agent roles from `skills/agents.json` (the source of truth), not hardcoded strings. The `loadAgentConfig()` function in `src/lib/agent-spawner.ts` already loads this. Export the agent data as a constant:

```typescript
// src/lib/agents-data.ts
import agentsJson from '../../skills/agents.json'

export interface AgentConfig {
  id: string
  name: string
  role: string
  color: string
  avatar: string
  skills: string[]
  description: string
  schedule: string | null
  is_manager: boolean
  can_spawn: boolean
}

export const AGENTS: AgentConfig[] = agentsJson as AgentConfig[]
export const AGENT_MAP: Record<string, AgentConfig> = Object.fromEntries(
  AGENTS.map(a => [a.id, a])
)
export const AGENT_COLORS: Record<string, string> = Object.fromEntries(
  AGENTS.map(a => [a.id, a.color])
)
```

- [ ] **Step 4: Verify all API routes return proper responses**

Run through each API route and confirm it handles auth, returns proper JSON, and doesn't crash on missing data. Key routes to verify:
- `POST /api/skills/run` — accepts `{ brandId, skillId }`, returns result
- `GET /api/mia/briefing?brandId=X` — returns briefing data
- `POST /api/mia/chat` — streams SSE response
- `GET /api/agents?brandId=X` — returns agent list
- `GET /api/billing/balance?brandId=X` — returns wallet data
- `GET /api/notifications?brandId=X` — returns notifications

- [ ] **Step 5: Build passes**

```bash
cd growth-os && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/brand-context.ts src/lib/agents-data.ts src/app/dashboard/layout.tsx
git commit -m "feat: add shared brand context helper and agent data, fix layout wiring"
```

---

## Task 2: fal.ai Client + Agent Images

**Files:**
- Create: `src/lib/fal-client.ts`
- Create: `scripts/download-agent-images.ts`
- Modify: `.env.local.example`
- Modify: `src/components/agents/agent-avatar.tsx`

- [ ] **Step 1: Create fal.ai client**

```typescript
// src/lib/fal-client.ts
export interface ImageGenerationOptions {
  prompt: string
  width?: number
  height?: number
  model?: string
  num_images?: number
  seed?: number
}

export interface ImageResult {
  url: string
  width: number
  height: number
  content_type: string
}

export async function generateImage(options: ImageGenerationOptions): Promise<ImageResult[]> {
  const key = process.env.FAL_AI_KEY
  if (!key) throw new Error('FAL_AI_KEY not configured')

  const model = options.model ?? 'fal-ai/flux/schnell'
  const response = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: options.prompt,
      image_size: {
        width: options.width ?? 512,
        height: options.height ?? 512,
      },
      num_images: options.num_images ?? 1,
      seed: options.seed,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`fal.ai error: ${response.status} ${err}`)
  }

  const data = await response.json()
  return (data.images || []).map((img: any) => ({
    url: img.url,
    width: img.width,
    height: img.height,
    content_type: img.content_type || 'image/png',
  }))
}

export async function generateAgentPortrait(
  agentId: string,
  description: string,
  accentColor: string
): Promise<ImageResult> {
  const prompt = `Futuristic AI agent portrait, ${description}, accent glow color ${accentColor}, dark background, high-tech, professional, cinematic lighting, digital art, 4k quality`
  const results = await generateImage({ prompt, width: 512, height: 512 })
  if (!results.length) throw new Error('No image generated')
  return results[0]
}
```

- [ ] **Step 2: Create agent image download/generation script**

```typescript
// scripts/download-agent-images.ts
import * as fs from 'fs'
import * as path from 'path'

// CDN URLs extracted from code.html files
const CDN_IMAGES: Record<string, string> = {
  mia: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB0DXbTpMV6mgfo1w0blOv-6Xo1ZrPF1SqSrzCxJLc9GqE247xzr7-vm60C_mgCvYMbbVFrPCE2Uas5iqX83-tHvMlmURs3pBrp8Ir90XDi787shv7n5YT4vC5gFL-dCy5bgdUBrmPcT0_gjEiehDOESMWw3SCmqV7WzjbpyRdBvHiNhPi-pOjKrnvBvX4JmRarjzZu1OQwuT64zh9hf3DG-AypaklOXyRDaTphXMx8SMNwR4NhjxUd7Fp2SamMkhVPfQkC7IXxsbvs',
  scout: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCbtdPgvqfi8DwaCU1x0H79hYaWn1GPPAYE2XyB-JHYUrhtAKo2sgS5OETBjCDpO-SpeJ-wYWiRFRU9MoQEVJRgBnhZNHX14TQulXQ7X1Ckt2FAIAg-wp_CbuwfgftuQ9RcMd2Ufyib6b31bPO0jyDSidjcBWTYQq4A4viVfrn0h_oyw1SrYOxF6-4EslW98OUFOpBXYJBy2QIOBVgX_EQ73Y44D4HJk9bKKb2edbP2YUs628qTlj8Nxz7VlktJhPPLM47oKxj7M8u_',
  aria: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBQY8FdNhz691dK3UE_KX6NNP3N2PFV6sXdCFNcHwJ250WALwo2w_Zec_H2dbY3Jwr93WVLYuOeSF514zXjzdDxJCJrym3Geg2et_pT0WLFbATKm1fX7DCujXDySy-E0AADRuDJb4CToo7eLRC_Z4z7TBZD7pwEuGBZ58OG6VWGP8KXGO1egvCj3DUh3uMDEVn-gh7-iM9gpTvqp5B0_xe0q51RPkAfWsGO0Vsa7XO_4Co0oj9_4MpYXKYL6LyAoT1AcoEelavgi6tI',
  hugo: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCsBlCgQoeMi6D8dLCSiKYHhjRCTXNa2yh7D_ihGq__X0VUzmg_ExCu-w6I9fX8kHaB5881kbjTTA0a0oBzfydq09L7sVBDN7Z4NYNXAvih15-_fC0lYMbYF0GZ8csvRZiel5f7WkrIZizQYOj3ajEBK53EElsAJKddKPH_wlAEWpKJNKlX9jw1q7zEX2w6EyNw6eSKB41OBgdR4Z9V_z-970kHuMLBLeOnFdP6aTPwfnhzyGL1wmnPWeaN3k6oeABK_Gy2jLwJEY54',
  max: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDq9JVxHlKJvJ_h0Rk3MjxJdXaFkVPYBkT6N_Yd0FSEI2WcPRqXGQtIFEK2a2kXHqZpPvW-I58B7JmE9OPz9j9n3tgdQIecZN7UbGK1E-z5PSiL2eJC0Db6GcAZxFuSMfE84F-wZ0NdJWI6VsIGmQD5lw5cBfmhfW5J3cTCblYjFH7Bg_o5p7dTk-ZQp-t6M3KQGNdJuEk1w5sRb7e0xjS1O0XbLINL3XVB6OuKzQiL3uSEY_nOT0aRMxOJMgYVLkJx-VJlNxP3FI',
  penny: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCJE72dYEE-E6hZ1UxNfXMlajBxF3sNHxhN8kW1E2Uf3ULb-4ZKIxJL0TQRF5LCYvBf7g0Vy8b3S_k9OE5FE_B2W1r9y4F4z0PYT2mJI9nEGtJGXhYZX8Qfb9gBmOOdXb3wO4aJ4a_1j_YPSbG06ZCpG0hQHQoF2B6pvjHe8ycPhWKVG7d_1p4F4F7g1z3u3nNnRgwPtMCJdBn2JqZMvr5lw8Yr0_Y2jn7D0R1Bt2IhIwGnTpTVyN5sPwGfWMuP0y5O8MvX1Ug6Bs',
}

// Agents that need fal.ai generation
const GENERATE_AGENTS = [
  { id: 'luna', description: 'Gentle AI persona, email and retention specialist, soft curves, caring expression', color: '#10B981' },
  { id: 'sage', description: 'Analytical AI agent, conversion optimizer, sharp features, confident gaze', color: '#8B5CF6' },
  { id: 'atlas', description: 'Intelligence AI agent, audience analyst, observant eyes, data visualization motifs', color: '#E11D48' },
  { id: 'echo', description: 'Stealth AI agent, competitive intelligence spy, mysterious, subtle expression', color: '#64748B' },
  { id: 'nova', description: 'AI discovery agent, search visibility expert, glowing eyes, futuristic visor', color: '#7C3AED' },
  { id: 'navi', description: 'Operations guardian AI agent, protective stance, system monitoring displays', color: '#0EA5E9' },
]

const outDir = path.join(process.cwd(), 'public', 'agents')

async function downloadImage(url: string, filename: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(path.join(outDir, filename), buffer)
  console.log(`Downloaded: ${filename}`)
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })

  // Download CDN images
  for (const [agentId, url] of Object.entries(CDN_IMAGES)) {
    await downloadImage(url, `${agentId}.png`)
  }

  // Generate missing agent images via fal.ai (if FAL_AI_KEY is set)
  if (process.env.FAL_AI_KEY) {
    const { generateAgentPortrait } = await import('../src/lib/fal-client')
    for (const agent of GENERATE_AGENTS) {
      try {
        const result = await generateAgentPortrait(agent.id, agent.description, agent.color)
        await downloadImage(result.url, `${agent.id}.png`)
        console.log(`Generated: ${agent.id}.png`)
      } catch (err) {
        console.error(`Failed to generate ${agent.id}:`, err)
      }
    }
  } else {
    console.log('FAL_AI_KEY not set — skipping image generation for Luna, Sage, Atlas, Echo, Nova, Navi')
  }
}

main().catch(console.error)
```

- [ ] **Step 3: Update AgentAvatar to use real images**

```typescript
// src/components/agents/agent-avatar.tsx — full rewrite
'use client'

import Image from 'next/image'
import { AGENT_COLORS } from '@/lib/agents-data'

interface AgentAvatarProps {
  agentId: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  state?: 'default' | 'working' | 'thinking' | 'celebrating' | 'concerned'
  className?: string
  variant?: string // e.g., 'chat', 'directory' for Mia variants
}

const SIZES = { sm: 32, md: 48, lg: 64, xl: 120 }

export function AgentAvatar({ agentId, size = 'md', state = 'default', className = '', variant }: AgentAvatarProps) {
  const px = SIZES[size]
  const color = AGENT_COLORS[agentId] || '#6366F1'
  const imagePath = variant ? `/agents/${agentId}-${variant}.png` : `/agents/${agentId}.png`

  const stateClass = {
    default: '',
    working: 'animate-pulse-glow',
    thinking: 'animate-pulse-slow',
    celebrating: 'animate-bounce-once',
    concerned: 'opacity-80',
  }[state]

  return (
    <div
      className={`relative rounded-full overflow-hidden shrink-0 ${stateClass} ${className}`}
      style={{ width: px, height: px }}
    >
      <Image
        src={imagePath}
        alt={`${agentId} avatar`}
        width={px}
        height={px}
        className="object-cover w-full h-full"
        onError={(e) => {
          // Fallback to gradient circle with initial
          const target = e.currentTarget
          target.style.display = 'none'
          const parent = target.parentElement
          if (parent) {
            parent.style.background = `linear-gradient(135deg, ${color}, ${color}88)`
            parent.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:white;font-weight:700;font-size:${px * 0.4}px">${agentId[0].toUpperCase()}</span>`
          }
        }}
      />
      {state === 'concerned' && (
        <div className="absolute inset-0 bg-red-500/20 rounded-full" />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add FAL_AI_KEY to env example**

Add to `.env.local.example`:
```
FAL_AI_KEY=
```

- [ ] **Step 5: Run image download script**

```bash
npx tsx scripts/download-agent-images.ts
```

Verify images exist in `public/agents/`.

- [ ] **Step 6: Build passes**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/fal-client.ts scripts/download-agent-images.ts src/components/agents/agent-avatar.tsx public/agents/ .env.local.example
git commit -m "feat: add fal.ai client, download agent images, upgrade AgentAvatar to use real images"
```

---

## Task 3: Sidebar Rebuild

**Files:**
- Modify: `src/components/dashboard/sidebar.tsx`

- [ ] **Step 1: Rebuild sidebar matching design**

Replace the entire sidebar component. The new sidebar has:
- Mia avatar + "Manager Agent" header
- Nav items: Mia Orchestrator, Marketing Agents, Agent Skills, Billing & Usage
- "New Campaign" CTA button
- Settings + Support links
- Live wallet balance display
- Mobile bottom nav

```typescript
// src/components/dashboard/sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sparkles, Users, Zap, CreditCard, Settings, HelpCircle, Plus } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/agent-avatar'

interface SidebarProps {
  brandId?: string | null
  walletBalance?: number
}

const NAV_ITEMS = [
  { label: 'Mia Orchestrator', href: '/dashboard', icon: Sparkles, exact: true },
  { label: 'Marketing Agents', href: '/dashboard/agents', icon: Users },
  { label: 'Agent Skills', href: '/dashboard/skills', icon: Zap },
  { label: 'Billing & Usage', href: '/dashboard/billing', icon: CreditCard },
]

const BOTTOM_NAV = [
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
  { label: 'Support', href: '/support', icon: HelpCircle },
]

export function Sidebar({ brandId, walletBalance = 0 }: SidebarProps) {
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-60 flex-col bg-[#0a1628] z-30 border-r border-white/[0.06]">
        {/* Mia header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
          <AgentAvatar agentId="mia" size="sm" />
          <div>
            <p className="text-sm font-semibold text-foreground">Mia</p>
            <p className="text-[11px] text-muted-foreground">Manager Agent</p>
          </div>
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(item => {
            const active = isActive(item.href, item.exact)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-[#6366f1]/10 text-[#6366f1] border-l-2 border-[#6366f1]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            )
          })}

          {/* New Campaign CTA */}
          <Link
            href="/dashboard/campaigns/new"
            className="flex items-center gap-2 mt-4 px-3 py-2.5 rounded-lg bg-[#6366f1] hover:bg-[#4f52d4] text-white text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Campaign
          </Link>
        </nav>

        {/* Bottom section */}
        <div className="px-3 py-3 border-t border-white/[0.06] space-y-1">
          {BOTTOM_NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </div>

        {/* Wallet display */}
        <div className="px-4 py-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5 text-[#059669]" />
            <span>Penny&apos;s Wallet:</span>
            <span className="text-foreground font-semibold">{walletBalance.toLocaleString()}</span>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-16 bg-[#0a1628] border-t border-white/[0.06] flex items-center justify-around px-2">
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] ${
                active ? 'text-[#6366f1]' : 'text-muted-foreground'
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label.split(' ')[0]}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
```

- [ ] **Step 2: Build passes**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/sidebar.tsx
git commit -m "feat: rebuild sidebar to match designs — agent skills nav, campaign CTA, wallet display"
```

---

## Task 4: Top Bar Updates

**Files:**
- Modify: `src/components/dashboard/top-bar.tsx`

- [ ] **Step 1: Update top bar with MARKETING AI branding and wallet chip**

Add "MARKETING AI" branding text, wallet chip showing "Penny's Wallet: {balance}", keep existing Cmd+K, notifications, user avatar.

Update the `TopBarProps` interface to accept `walletBalance`:

```typescript
interface TopBarProps {
  userEmail?: string | null
  brandId?: string | null
  walletBalance?: number
}
```

Add before the search button in the header:
```tsx
{/* MARKETING AI branding */}
<span className="hidden lg:block text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
  Marketing AI
</span>
```

Add wallet chip next to notifications:
```tsx
{/* Wallet chip */}
{typeof walletBalance === 'number' && (
  <Link
    href="/dashboard/billing"
    className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#059669]/10 text-[#059669] text-xs font-medium hover:bg-[#059669]/20 transition-colors"
  >
    <CreditCard className="h-3 w-3" />
    <span>Penny&apos;s Wallet: {walletBalance.toLocaleString()}</span>
  </Link>
)}
```

- [ ] **Step 2: Build passes and commit**

```bash
npm run build
git add src/components/dashboard/top-bar.tsx
git commit -m "feat: add MARKETING AI branding and wallet chip to top bar"
```

---

## Task 5: Dashboard Rebuild — Morning Brief + Metrics + Agent Chains

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Create: `src/components/dashboard/morning-brief.tsx`
- Create: `src/components/dashboard/metric-card.tsx`
- Create: `src/components/dashboard/agent-chains.tsx`
- Create: `src/components/dashboard/internal-log.tsx`
- Create: `src/components/dashboard/recommendation-card.tsx`
- Create: `src/components/dashboard/chat-fab.tsx`

- [ ] **Step 1: Create Morning Brief component**

```typescript
// src/components/dashboard/morning-brief.tsx
'use client'

interface MorningBriefProps {
  narrative: string         // Mia's narrative text
  metricsContext: string    // Supporting metrics paragraph
  onExecuteStrategy: () => void
  latestRunId?: string      // for "View Full Audit" link
}

// Glass-panel card with "MIA'S MORNING BRIEF" badge, large Manrope quote,
// body text, two CTA buttons
```

The component renders:
- "MIA'S MORNING BRIEF" uppercase badge in indigo + current date
- Large narrative quote (font-heading, text-xl/2xl)
- Supporting paragraph with real metrics
- "Execute Strategy" primary button (calls `POST /api/skills/run`)
- "View Full Audit" outline button (navigates to `/dashboard/runs/{latestRunId}`)

- [ ] **Step 2: Create MetricCard component**

```typescript
// src/components/dashboard/metric-card.tsx
interface MetricCardProps {
  label: string          // "Revenue", "ROAS", "LTV"
  value: string          // "$42,850", "4.2x", "$284"
  change?: string        // "+12.4%"
  status: 'optimal' | 'stable' | 'declining'
  sparklineData?: number[]  // 5 values for bar heights
}

// Glass-panel card with value, change badge, status badge, 5-bar CSS sparkline
```

Sparkline implementation: 5 divs with `height` set proportionally, flex-end alignment.

- [ ] **Step 3: Create Agent Chains component**

```typescript
// src/components/dashboard/agent-chains.tsx
'use client'

import { AgentAvatar } from '@/components/agents/agent-avatar'

interface ChainNode {
  agentId: string
  agentName: string
  role: string
  status: 'supervising' | 'running' | 'action_required' | 'standby'
  progress?: number  // 0-100 for progress bar
}

interface AgentChainsProps {
  nodes: ChainNode[]
}

// Vertical pipeline with connecting border-left line
// Each node: avatar + name + role + status indicator
// Click node → navigate to agent detail
```

- [ ] **Step 4: Create Internal Log component**

```typescript
// src/components/dashboard/internal-log.tsx
'use client'

interface LogEntry {
  agent: string
  message: string
  timestamp: string
}

interface InternalLogProps {
  entries: LogEntry[]
}

// Dark terminal card (bg-[#111c2d]) with monospace text
// Each entry: "> [{agent}] {message}"
// Scrollable, auto-scroll to bottom
```

- [ ] **Step 5: Create Recommendation Card component**

```typescript
// src/components/dashboard/recommendation-card.tsx
'use client'

interface RecommendationCardProps {
  agentId: string
  title: string
  description: string
  ctaLabel: string
  skillId: string
  brandId: string
}

// Card with agent color accent, finding text, CTA button
// CTA calls POST /api/skills/run with skillId
```

- [ ] **Step 6: Create Chat FAB component**

```typescript
// src/components/dashboard/chat-fab.tsx
'use client'

import Link from 'next/link'
import { MessageCircle } from 'lucide-react'

export function ChatFAB() {
  return (
    <Link
      href="/dashboard/chat"
      className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-40 w-14 h-14 rounded-full bg-[#111c2d] border border-white/[0.1] flex items-center justify-center shadow-lg hover:bg-[#1a2a40] transition-colors"
      aria-label="Chat with Mia"
    >
      <MessageCircle className="h-6 w-6 text-[#6366f1]" />
    </Link>
  )
}
```

- [ ] **Step 7: Rebuild dashboard page.tsx**

Full rewrite of `src/app/dashboard/page.tsx` using the new components. Server component that:
1. Calls `getBrandContext()`
2. Fetches skill_runs (last 24h), notifications, wallet, brand_metrics_history
3. Derives: morning brief narrative (from latest scout health-check output or fallback text), metrics (revenue/ROAS/LTV from brand_metrics_history), active chains (from running skill_runs), internal log (from recent skill_runs), recommendations (from needs_review notifications)
4. Renders: 12-col grid with main (col-span-8) + sidebar (col-span-4)

- [ ] **Step 8: Build passes and commit**

```bash
npm run build
git add src/app/dashboard/page.tsx src/components/dashboard/
git commit -m "feat: rebuild dashboard with morning brief, metrics, agent chains, internal log"
```

---

## Task 6: Chat Rebuild — 3-Panel Layout

**Files:**
- Modify: `src/app/dashboard/chat/page.tsx`
- Create: `src/components/chat/chat-sidebar.tsx`
- Create: `src/components/chat/active-context.tsx`
- Create: `src/components/chat/rich-agent-card.tsx`
- Modify: `src/components/chat/chat-message.tsx`
- Modify: `src/components/chat/chat-input.tsx`

- [ ] **Step 1: Create chat sidebar component**

Left panel with Mia Engine header, New Initiative button, agent shortcuts (Intelligence Hub, Aria Creative, Scout Diagnosis, Max Budget, Conversation History).

- [ ] **Step 2: Create Active Context panel**

Right panel with Engine Focus (Strategy, Brand Voice, Target ROI), Delegated Sub-Agents (from running skill_runs), Ingested Sources (from knowledge_nodes), Mia Status footer.

- [ ] **Step 3: Create Rich Agent Card for chat messages**

Inline card that renders when Mia references an agent's work. Shows agent color bar, agent name + role, key metrics, findings.

- [ ] **Step 4: Update chat-message.tsx**

Add rich agent card detection: parse Mia's response for patterns like `[AGENT:hugo|...]` or detect agent names + metrics in the text. Render as inline cards.

- [ ] **Step 5: Update chat-input.tsx**

Add MCP tool access button (grid icon) and skill selector button (sparkles icon) to the left of the text input. Both open dropdown menus for skill/tool selection.

- [ ] **Step 6: Rebuild chat page.tsx**

3-panel flex layout: ChatSidebar (w-64) + center chat (flex-1) + ActiveContext (w-80, hidden on mobile). Load brand data, conversations, wire all interactions.

- [ ] **Step 7: Build passes and commit**

```bash
npm run build
git add src/app/dashboard/chat/ src/components/chat/
git commit -m "feat: rebuild chat with 3-panel layout, rich agent cards, active context"
```

---

## Task 7: Agent Directory Rebuild

**Files:**
- Modify: `src/app/dashboard/agents/page.tsx`
- Modify: `src/components/agents/agent-card.tsx`

- [ ] **Step 1: Rebuild agent-card.tsx**

New card with: real agent image, name, role (colored), description, live status chip. Status sourced from latest skill_runs for that agent.

- [ ] **Step 2: Rebuild agent directory page**

Add filter tabs (All/Creative/Growth/Finance/Diagnosis/Retention/Ops), improved search, Mia Active popup on Mia's card, status indicators on all cards.

- [ ] **Step 3: Build passes and commit**

```bash
npm run build
git add src/app/dashboard/agents/page.tsx src/components/agents/agent-card.tsx
git commit -m "feat: rebuild agent directory with filter tabs, real images, live status"
```

---

## Task 8: Agent Detail Pages Rebuild

**Files:**
- Modify: `src/app/dashboard/agents/[agentId]/page.tsx`
- Create: `src/components/agents/agent-hero.tsx`
- Create: `src/components/agents/skill-card.tsx`
- Create: `src/components/agents/agent-output.tsx`
- Create: `src/components/agents/mia-control.tsx`

- [ ] **Step 1: Create agent hero banner component**

Per-agent hero with unique background (CSS gradient per agent color), large avatar, name, role, status chip, configure button.

- [ ] **Step 2: Create skill card component**

Card with icon, skill name, tier badge (colored), credit cost, last run time, Run button that calls the API.

- [ ] **Step 3: Create agent-specific output renderers**

Switch on agentId to render different output formats: Hugo → SEO scores, Aria → creative preview, Max → budget charts, Penny → financial projection, Scout → health score, others → formatted JSON.

- [ ] **Step 4: Create Mia control panel**

Glass-panel card showing Mia's latest message about this agent, "Instruct Mia..." input, connected agents display.

- [ ] **Step 5: Rebuild agent detail page**

Hero banner + skills grid + recent output + Mia control panel. Load agent from agents.json, skill_runs, brand_agents config.

- [ ] **Step 6: Build passes and commit**

```bash
npm run build
git add src/app/dashboard/agents/\[agentId\]/ src/components/agents/
git commit -m "feat: rebuild agent detail with hero banners, skill cards, agent-specific outputs"
```

---

## Task 9: Agent Skills Page (NEW)

**Files:**
- Create: `src/app/dashboard/skills/page.tsx`

- [ ] **Step 1: Create skills browsing page**

Client component that:
1. Loads all skills via `GET /api/skills` (or imports skill-loader data)
2. Renders filter bar: category dropdown, tier filter, search input
3. Renders 4-column grid of skill cards (agent color bar, skill name, tier badge, credits, agent badge, Run button)
4. Run button calls `POST /api/skills/run`
5. Click card expands to show full description/workflow

- [ ] **Step 2: Create skills list API if needed**

If `GET /api/skills` doesn't exist, create `src/app/api/skills/route.ts` that returns all parsed skills:
```typescript
import { loadAllSkills } from '@/lib/skill-loader'
// GET: return all skills as array
```

- [ ] **Step 3: Build passes and commit**

```bash
npm run build
git add src/app/dashboard/skills/ src/app/api/skills/route.ts
git commit -m "feat: add Agent Skills browsing page with filters and run buttons"
```

---

## Task 10: Deploy Custom Agent Page (NEW)

**Files:**
- Create: `src/app/dashboard/agents/deploy/page.tsx`

- [ ] **Step 1: Create deploy agent page**

Client component with form: agent name, role, base skills multi-select, custom skill markdown editor, complexity, credits, schedule, auto-approve toggle. Plan gate: only Growth/Agency can access.

Submit creates `brand_agents` + optionally `custom_skills` records via existing APIs.

- [ ] **Step 2: Build passes and commit**

```bash
npm run build
git add src/app/dashboard/agents/deploy/
git commit -m "feat: add Deploy Custom Agent page for Growth/Agency plans"
```

---

## Task 11: Campaign Creation Flow (NEW)

**Files:**
- Create: `src/app/dashboard/campaigns/new/page.tsx`
- Create: `src/app/dashboard/campaigns/page.tsx`

- [ ] **Step 1: Create campaign list page**

Simple list of past campaigns (stored as a series of skill_runs with metadata). Shows campaign name, status, date, assets count.

- [ ] **Step 2: Create multi-step campaign creation page**

7-step flow as a single client component with step state:
1. Define Campaign (form)
2. Aria Generates (triggers ad-copy skill, shows progress)
3. Persona Review (triggers persona-creative-review, shows scores)
4. User Approval (pick winners)
5. Image Brief (triggers image-brief skill)
6. fal.ai Generation (calls fal.ai, shows images)
7. Final Review (copy + image, export)

Each step calls real APIs and shows real results.

- [ ] **Step 3: Build passes and commit**

```bash
npm run build
git add src/app/dashboard/campaigns/
git commit -m "feat: add campaign creation flow with Aria ad-copy + fal.ai image generation"
```

---

## Task 12: Pitch Deck Pages (NEW)

**Files:**
- Create: `src/app/deck/layout.tsx`
- Create: `src/app/deck/[slideId]/page.tsx`

- [ ] **Step 1: Create deck layout**

Minimal layout with Growth OS logo, slide indicator (X of 9), prev/next arrows. No auth required (public pages).

- [ ] **Step 2: Create slide content**

9 slides converted from code.html to React/Tailwind. Each slide is a component rendered by `[slideId]`. Use real agent images from `public/agents/`, CDN URLs for backgrounds/logos.

Slides: problem, aria, luna, penny, seo, pricing, credits, security, agency.

- [ ] **Step 3: Build passes and commit**

```bash
npm run build
git add src/app/deck/
git commit -m "feat: add pitch deck pages (9 slides) for investor/client presentations"
```

---

## Task 13: Production Pages — Auth, Skill Run Detail, Knowledge Browser

**Files:**
- Create: `src/app/(auth)/forgot-password/page.tsx`
- Create: `src/app/(auth)/reset-password/page.tsx`
- Create: `src/app/dashboard/runs/[runId]/page.tsx`
- Create: `src/app/dashboard/knowledge/page.tsx`
- Create: `src/app/dashboard/exports/page.tsx`

- [ ] **Step 1: Create forgot/reset password pages and verify-email page**

Forgot: email input → calls `supabase.auth.resetPasswordForEmail()`. Reset: new password form, processes token from URL. Verify-email (`src/app/(auth)/verify-email/page.tsx`): confirmation screen shown after signup, prompts user to check their email, includes resend button.

- [ ] **Step 2: Create skill run detail page**

Shows full output of a single skill run. Metadata table (skill, agent, model, tier, credits, duration, triggered_by, timestamp). Output rendered as formatted view. Re-run and Export buttons.

- [ ] **Step 3: Create knowledge graph browser**

List/grid of knowledge_nodes for the brand. Filter by node_type, search by name. Click to expand and see properties, edges, snapshots.

- [ ] **Step 4: Create exports page**

List of downloadable reports. "Generate Report" button creates CSV/JSON from skill_runs. Download links.

- [ ] **Step 5: Build passes and commit**

```bash
npm run build
git add src/app/(auth)/forgot-password/ src/app/(auth)/reset-password/ src/app/dashboard/runs/ src/app/dashboard/knowledge/ src/app/dashboard/exports/
git commit -m "feat: add production pages — password reset, skill run detail, knowledge browser, exports"
```

---

## Task 14: Legal, Support, Error Pages

**Files:**
- Create: `src/app/terms/page.tsx`
- Create: `src/app/privacy/page.tsx`
- Create: `src/app/support/page.tsx`
- Create: `src/app/not-found.tsx`

- [ ] **Step 1: Create legal pages**

Simple static pages with Growth OS nav, placeholder legal text, clean layout.

- [ ] **Step 2: Create support page**

FAQ section + "Contact us" link. Simple glass-panel cards.

- [ ] **Step 3: Create custom 404 and global error boundary**

Branded "Page not found" (`src/app/not-found.tsx`) with Mia avatar, suggestions to navigate, links to dashboard/home. Global error boundary (`src/app/error.tsx`): catches unexpected runtime errors, shows friendly error card with "Try again" reset button and link back to dashboard.

- [ ] **Step 4: Build passes and commit**

```bash
npm run build
git add src/app/terms/ src/app/privacy/ src/app/support/ src/app/not-found.tsx
git commit -m "feat: add legal pages, support page, custom 404"
```

---

## Task 15: Landing Page + Onboarding Design Match

**Files:**
- Modify: `src/components/landing/landing-page.tsx`
- Modify: `src/app/onboarding/connect-store/page.tsx`
- Modify: `src/app/onboarding/focus/page.tsx`
- Modify: `src/app/onboarding/platforms/page.tsx`
- Modify: `src/app/onboarding/diagnosis/page.tsx`

- [ ] **Step 1: Update landing page**

Replace AgentAvatar cluster in hero with large circular Mia portrait (real image from `public/agents/mia.png`). Match the `growth_os_v2_landing_page_mia_hero` design more closely: Mia centered with aura glow, "for Shopify" tagline, testimonial section with founder photos.

- [ ] **Step 2: Update onboarding pages**

Match each step to its design screenshot more closely. Update text, icons, layout, and styling to match the code.html references.

- [ ] **Step 3: Build passes and commit**

```bash
npm run build
git add src/components/landing/ src/app/onboarding/
git commit -m "feat: update landing page and onboarding to match design visuals"
```

---

## Task 16: Final Integration Test + Push

- [ ] **Step 1: Full build verification**

```bash
npm run build
```

Verify all routes compile, no TypeScript errors.

- [ ] **Step 2: Route audit**

Check the build output for all expected routes. Verify count matches expectations (~70+ routes).

- [ ] **Step 3: Push to GitHub**

```bash
git push
```

- [ ] **Step 4: Verify Vercel deployment**

Check that `https://growth-os-final.vercel.app` deploys successfully.

---

## Subsequent Plans (if needed)

After this plan is executed, the following may need separate plans:
- **End-to-end testing** — verify every user flow works with real data
- **Performance optimization** — lazy loading, image optimization, caching
- **Supabase Realtime** — replace polling with real-time subscriptions
- **Advanced fal.ai** — batch generation, style consistency, quality tuning
