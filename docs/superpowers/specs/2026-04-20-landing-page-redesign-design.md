# Landing Page Redesign — Design Spec

**Date:** 2026-04-20
**Owner:** karan
**Status:** Draft — pending user review

---

## Goal

Redesign the public landing page (`src/components/landing/landing-page.tsx`) to:
1. Communicate autopilot positioning (crew of 12 agents working autonomously).
2. Read as platform-agnostic (not Shopify-only).
3. Improve conversion with URL-as-CTA pattern (store URL → prefilled signup).
4. Add trust-building sections that reduce objections.
5. Preserve existing visual equity (color palette, Mia portrait, aesthetic).

## Non-goals

- Not a full brand redesign. Colors, fonts, general aesthetic stay.
- Not an onboarding redesign. URL input on landing just prefills `/signup?store=<url>`; the onboarding flow itself is out of scope.
- No new backend endpoints. Signup page already accepts a `store` query param (verify in implementation).
- No live pseudo-audit on the landing page itself (deferred; redirect-to-signup is the chosen flow).

## Architecture

Single-file component refactor in `src/components/landing/landing-page.tsx`, broken into sub-components co-located in `src/components/landing/` so each section is independently editable and animations don't bleed across boundaries.

### File structure

```
src/components/landing/
├── landing-page.tsx                  # page composition only, minimal logic
├── hero-split-canvas.tsx             # Section 1 — hero with URL input + Mia anchor + rotating canvas
├── hero-canvas-surfaces.tsx          # the 6 rotating surfaces (Mia status, Aria ad, Max paid, Scout alert, Echo competitor, Penny finance)
├── integrations-marquee.tsx          # Section 2
├── one-crew-cards.tsx                # Section 3 — 3-card block with micro-interactions
│   ├── research-card.tsx
│   ├── create-card.tsx
│   └── optimize-card.tsx
├── results-strip.tsx                 # Section 4a
├── founder-note.tsx                  # Section 4b
├── trust-badges.tsx                  # Section 4c
├── faq-accordion.tsx                 # Section 4d
├── url-input-cta.tsx                 # reusable URL-input form (used 3x)
├── sticky-mobile-cta.tsx             # mobile-only sticky bar
└── landing-content.ts                # copy, FAQ, results data as typed constants
```

**Rationale:** each section is ~100–250 lines max. Copy lives in `landing-content.ts` so marketing edits don't require touching animation code. Animations are scoped per-component to avoid CSS leakage.

### State and interactions

- All animations are CSS + a minimal React state machine per card (interval timer for rotation).
- `prefers-reduced-motion` globally disables loops; static first-frame is shown.
- Low-battery detection via `navigator.getBattery()` pauses hero canvas rotation and 3-card animations (progressive enhancement; no polyfill).
- Hover pauses rotation on desktop; tap pauses on mobile.
- URL-input component: validates with URL parser, normalizes (prepends `https://` if missing), submits to `/signup?store=<encoded>`.

---

## Section 1 — Hero with Mia anchor + rotating canvas

**Layout:**
- Desktop: 40% left column (H1 + subhead + URL input + CTA) / 60% right canvas.
- Tablet: stacked, Mia canvas below copy, canvas at 100% width.
- Mobile: Mia portrait ~180px at top, headline, URL input, sticky CTA.

**Copy:**
- H1: *"Your AI marketing crew. One URL away."*
- Subhead: *"Paste your store URL. Mia briefs 11 specialist agents. They run your marketing on autopilot."*
- URL placeholder: *"yourstore.com"*
- CTA button: *"Start free →"*
- Microcopy under CTA: *"No credit card. 14-day free trial."*

**Right canvas — Mia as constant anchor:**
- Existing Mia portrait (same asset, same treatment) positioned center-right.
- Subtle breathing glow (~2s loop, `box-shadow` on a wrapper, opacity 0.3 → 0.5 → 0.3).
- Always-visible status line below Mia: *"Running your store on autopilot. 11 agents working."*
- Around Mia, a **floating canvas** cycles through 5 surfaces every 4s with 400ms spring fade-in / 200ms fade-out.

**Hero canvas elements: 1 always-visible anchor + 5 rotating surfaces.**

**Always-visible (not in rotation):**
- Mia portrait + breathing glow + status line (*"Running your store on autopilot. 11 agents working."*).

**The 5 rotating surfaces (cycle every 4s):**

1. **Aria · Creative** (ad reveal tile)
   - Caption: *"Aria · drafting variant 2 of 4"*
   - Two ad-tile placeholders slide in; second pulses "new" for 400ms.
   - Copy snippet: *"Drafted 4 ad variants from 147 customer reviews. Testing variant 3."*

2. **Max · Paid** (dashboard tile)
   - Caption: *"Max · live on Meta"*
   - 3-row mini table, last row animates in.
   - Copy: *"Paused 'Summer v1' — CPA drifted +22%. Scaled 'UGC hook 3' to $120/day."*

3. **Scout · Diagnostics** (alert card)
   - Caption: *"Scout · 2 min ago"*
   - Copy: *"Spotted: checkout abandons spiked Tuesday 2pm. Flagged to Sage."*

4. **Echo · Competitor** (screenshot tile)
   - Caption: *"Echo · competitive watch"*
   - Copy: *"3 competitors dropped new hero images this week. Cached to library."*

5. **Penny · Finance** (metric card)
   - Caption: *"Penny · weekly"*
   - Copy: *"CAC fell to $18.40 (−9% WoW). LTV:CAC now 4.2x."*
   - Tiny sparkline trending up.

**Tone rule (applies everywhere in hero):** past-tense action verbs, no permission asks, no "Would you like me to..." framing.

---

## Section 2 — Platform-agnostic integrations marquee

**Copy:**
- Header: *"Works with your stack — not against it."*
- Subtext: *"Deep on Shopify. Friendly with everyone else."*

**Behavior:**
- Horizontal marquee, left-scrolling, ~40s loop.
- Pauses on hover (desktop) or tap (mobile).
- Faster scroll on mobile (~25s), no hover pause.

**Logo groups (in this order, with subtle vertical dividers):**
- **Storefronts:** Shopify, WooCommerce, Wix, Squarespace, Webflow / custom
- **Ad platforms:** Meta, Google, TikTok, Pinterest
- **Email/SMS:** Klaviyo, Mailchimp, Postscript
- **Analytics:** GA4, Triple Whale

**Micro-interaction:** each logo has a 1s hover tilt (±3°) + color flash (grayscale → full color).

**Asset requirement:** need SVG logos for all 14 platforms. Shopify, Meta, Google, Klaviyo likely already in repo; the rest need to be added to `public/logos/`.

---

## Section 3 — "One Crew" 3-card block

**Copy:**
- Header: *"One crew. Every part of your marketing."*
- Sub: *"Research, create, optimize — running in parallel, reporting up to Mia."*

**Grid:** 3-col desktop, 2-col tablet (third card wraps), stacked mobile.
**Card height:** equal, min 480px desktop.

### Card 1 — RESEARCH

- Top row: 3 tiny avatars (Scout, Echo, Atlas) with a pulsing green dot on Scout.
- 3 counter-up numbers (animate once, on scroll into view, `IntersectionObserver`):
  - *"147 customer reviews analyzed"* (Scout)
  - *"3 competitor creative drops spotted this week"* (Echo)
  - *"2 untapped audience segments surfaced"* (Atlas)
- Subtle scanning-line sweep (CSS gradient, 6s loop, bottom-to-top).
- Hover: border glows teal (`#0D9488`, Scout's color).

### Card 2 — CREATE

- Tab strip at top cycling every 3s: *Ad copy → Email flow → Landing page copy → SEO brief*.
- Under each tab, skeleton shimmer (2 lines, 2s) resolves to:
  - **Ad:** *"POV: You stop scrolling on reviews. Then scroll to checkout."* — caption *"Aria · Draft 3 of 4"*
  - **Email:** *"Subject: Did we forget something? 👀"* — caption *"Luna · Cart recovery · Day 1"*
  - **Landing:** *"The only moisturizer tested on 200 real noses."* — caption *"Hugo · H1 rewrite"*
  - **SEO:** *"Target: 'best retinol for sensitive skin' — 8.2k/mo"* — caption *"Hugo · keyword strategy"*
- Bottom-right badge: green check + *"Delivered to your dashboard"*.
- Hover: border glows orange (`#F97316`, Aria's color).

### Card 3 — OPTIMIZE

- Vertical ticker cycling 4 metrics (3s each, cross-fade):
  - *"+23% ROAS · UGC hooks"* — green up-arrow
  - *"−14% CPA · Price anchoring test"* — green
  - *"$18.40 CAC · Down 9% WoW"* — green
  - *"Paused 2 ads draining budget"* — amber (Max)
- Toast slides up from bottom every 4th cycle (once every ~12s):
  *"Skill saved ✨ 'UGC hook formula' added to your playbook"*
  Toast auto-dismisses after 2s.
- Hover: border glows blue (`#3B82F6`, Max's color).

### Interaction rules (all 3 cards)

- `prefers-reduced-motion` → all loops disabled, static snapshot shown.
- Low battery → loops paused.
- Hover pauses the card's loop.
- Animations start on scroll-into-view (`IntersectionObserver` with 0.3 threshold).
- On mobile, cards stack and animations run sequentially (not all at once) to reduce paint churn.

---

## Section 4 — Trust-building cluster

### 4a — Real results strip

**Copy:**
- Header: *"Real brands. Real numbers. 90 days or less."*

**Layout:** 4 case tiles, 4-col desktop, 2-col tablet, stacked mobile.

**Each tile contains:**
- Brand logo (grayscale, small)
- Headline number, huge: e.g. *+34% ROAS*
- Context line: *"D2C skincare · 21 days · Aria + Max"*
- Platform badge bottom-right: *Shopify · WooCommerce · Custom*

**Micro-interaction:** hover (desktop) or tap (mobile) → tile flips (CSS 3D transform) to show a one-sentence founder quote + name.

**Platform mix rule:** at least one tile must be non-Shopify (reinforces platform-agnostic positioning).

**Data source:** `landing-content.ts` — array of `{ brand, logoPath, metric, context, platform, quote, founderName }`.

**NEEDS FROM USER:** 3–4 real case studies with permission to use. If not available at implementation time, use placeholder copy marked clearly with `// TODO: replace with real case` comments.

### 4b — Founder note

**Layout:** narrow column (max 640px), left-aligned, no hero image.

**Structure (3 short paragraphs, ~120 words total):**
1. *Why I built this* — agency fatigue, D2C founders paying $10k/mo for mediocre output.
2. *What's different* — not another ChatGPT wrapper. An autopilot crew, not a copilot.
3. *What I promise* — your data never trains shared models. Your creatives are yours. Cancel any time.

**Signature block:**
- Handwritten-style SVG signature (not a font)
- Name + role line
- Small circular photo (48px)

**NEEDS FROM USER:** actual paragraph copy, signature SVG, photo. Spec includes placeholder copy for implementation; real copy slotted in before launch.

### 4c — Security & data trust badges

**Layout:** 4-column row desktop, 2x2 tablet, stacked mobile.

**Items (each with icon + one-line caption):**
1. 🔒 *"SOC 2 Type II — in progress"* — only if true at implementation time; otherwise drop this tile.
2. 🛡️ *"Your data never trains shared models"*
3. 🇪🇺 *"GDPR + CCPA compliant"*
4. 🔄 *"Export everything. Cancel anytime."*

**Footer link:** *"Read our data policy →"* → `/legal/data`.

### 4d — Objection-led FAQ

**Behavior:** accordion, one item open at a time. Soft chevron rotate on open (200ms). Each answer ≤ 50 words.

**Order (biggest objections first):**

1. **"I'm not on Shopify. Does this work for me?"**
   *Yes. We connect to WooCommerce, Wix, Squarespace, Webflow, and custom sites. Shopify is our deepest integration; the others are solid and improving weekly.*

2. **"I already have an agency. Why would I switch?"**
   *Agencies bill $8–15k/month and take weeks to ship. Growth OS runs 24/7, ships in hours, and costs less than a junior strategist. Keep the agency for what humans do best — we handle the grind.*

3. **"Is this just ChatGPT with a UI?"**
   *No. 12 specialist agents, each with their own skills, memory, and schedules. Mia orchestrates them based on what your store needs — not what you type into a box.*

4. **"What if Mia makes a bad call?"**
   *She asks for approval on budget changes, brand-sensitive decisions, and anything below her confidence threshold. Everything else she executes and reports back.*

5. **"Does this work under $10k MRR?"**
   *Yes. The agents scale down. For small brands, the biggest wins are usually Luna (email flows) and Hugo (SEO) — both compound without ad spend.*

6. **"Who owns the creatives Mia generates?"**
   *You do. Always. Export anytime, use anywhere, no watermarks, no restrictions.*

7. **"How fast will I see results?"**
   *14–30 days for first wins (abandoned-cart recovery, creative refresh). 60–90 days for compounding results (SEO, LTV lift, new audience segments).*

8. **"What does it cost?"**
   *Starts at $X/mo with no ad-spend percentage. See full pricing →* (link to `/pricing`)

---

## Section 5 — Repeat CTA strategy

**Three URL-input instances** down the page, all using the same `<UrlInputCta />` component:

1. **Hero** — primary, full-size, label on button: *"Start free →"*
2. **After Section 3 (3-card block)** — mid-page, label: *"See what Mia finds on your store →"*
3. **After Section 4d (FAQ), before footer** — final, label: *"Start free → Mia begins in 60 seconds"*

**All three submit to:** `/signup?store=<url-encoded-input>`.

**Sticky mobile CTA bar:**
- Appears on scroll past hero (200px threshold).
- Thin bar (~56px) at bottom, says *"Start free"*.
- Tap opens a bottom-sheet drawer with URL input + CTA.
- Dismissible (X button), respawns after 30s or on next page visit.

---

## Section 6 — Mobile treatment (across all sections)

**Hero:**
- Mia portrait shrinks to ~180px, moves above headline.
- Canvas rotation collapses to a single tile cycling through all 5 surfaces (same 4s interval).
- URL input full-width, CTA full-width below.

**Integrations marquee:**
- Single row, faster scroll (~25s loop).
- No hover pause; tap to pause.

**3-card block:**
- Cards stack vertically.
- Micro-interactions preserved but run sequentially on scroll-into-view.

**Results strip:**
- 2-up grid instead of 4-up.
- Tile flip disabled; tap expands quote inline below tile.

**FAQ:**
- Full-width accordion, no columns.

**Animations (global mobile rules):**
- Respect `prefers-reduced-motion`.
- Pause when battery < 20% (via `navigator.getBattery()` if available).
- No animation starts until scroll-into-view.

---

## Section 7 — Copy rewrite scope

### Rewriting from scratch

- Hero H1, subhead, CTA, microcopy
- All 6 canvas surface captions and copy lines
- Integration strip header + subtext
- 3-card block header + sub + all in-card copy
- Results strip tile copy (needs 3–4 real wins)
- Founder note (needs actual draft)
- Security trust line items
- All 8 FAQ Q&As
- 3 CTA button labels

### Keeping as-is

- Color palette: `#f8f9ff` bg, `#0b1c30` text, `#6b38d4` purple accent, `#eff4ff` / `#dce9ff` / `#e9ddff` light variants.
- Typography stack (current).
- Mia portrait asset (same image, same treatment).
- Footer (unchanged).

### Dropping entirely

- Old Social Proof strip → replaced by new Results strip.
- Old Integrations Bento → replaced by marquee.
- Multi-Model Routing section → too technical for landing; move to a deeper page later.
- Comparison Table → replaced by Founder Note + FAQ.
- Agency Problem section → folded into Founder Note.
- Multi-Agent Workforce Bento → replaced by 3-card block.
- How It Works dark section → cut entirely, redundant with 3-card block.

### Final page order

1. Hero (Section 1)
2. Integrations marquee (Section 2)
3. 3-card "One Crew" block (Section 3)
4. Results strip (Section 4a)
5. Founder note (Section 4b)
6. Security/trust badges (Section 4c)
7. FAQ (Section 4d)
8. Final CTA (URL input #3)
9. Footer (unchanged)

---

## Data and assets needed from user before launch

| Asset | Section | Blocker? |
|---|---|---|
| 3–4 real case studies (brand, metric, context, quote, founder name, platform) | 4a Results strip | No — stub with placeholders, replace before launch |
| Founder note copy (3 paragraphs) | 4b | No — stub with placeholder, replace before launch |
| Founder signature SVG | 4b | No — fallback to italicized name |
| Founder photo (circular, ≥128px) | 4b | No — fallback to avatar with initials |
| SOC 2 status confirmation | 4c | No — drop tile if not applicable |
| Pricing page URL + starting price | 4d FAQ #8 | No — link to `/pricing`, price inserted when pricing finalized |
| Platform logos: WooCommerce, Wix, Squarespace, Webflow, TikTok, Pinterest, Mailchimp, Postscript, GA4, Triple Whale | Section 2 | Yes — implementation needs SVGs in `public/logos/` |

---

## Micro-interaction inventory (complete list)

Every animation/interaction on the page, grouped by section. All respect `prefers-reduced-motion` (snap to final state, no loops).

### Global

1. **Section header entrance** — each section's header fades + slides up 12px when 20% in view (300ms, once).
2. **Navbar scroll behavior** — navbar shrinks from 72px → 56px and background goes from transparent → frosted white when scrolled past 80px (200ms ease).
3. **Page load** — hero content stagger-fades in (subtle, 150ms between H1 / subhead / CTA / canvas).

### Hero (Section 1)

4. **Mia breathing glow** — `box-shadow` pulse behind portrait, 2s loop, opacity 0.3 → 0.5 → 0.3.
5. **URL input placeholder cycle** — placeholder text cycles through example URLs every 2.5s when empty: `yourstore.com` → `acme.co` → `brand.shop` → `hellobrand.com`. Types character-by-character (120ms per char), pauses 800ms, deletes, next.
6. **URL input focus ring** — focus triggers a purple ring + the CTA button softly pulses (scale 1 → 1.02 → 1, 1s loop) to draw the eye.
7. **CTA button idle shimmer** — subtle diagonal shine sweeps across the button every 6s (`linear-gradient` translate, 800ms).
8. **CTA hover state** — button lifts 2px + shadow deepens (150ms).
9. **Canvas surface transitions** — 400ms spring fade-in (scale 0.95 → 1) + 200ms fade-out between the 6 rotating surfaces.
10. **Canvas pause-on-hover** — rotation pauses, captions of the current surface highlight slightly.
11. **Aria surface** — second ad tile pulses "new" badge for 400ms when it slides in.
12. **Max surface** — last table row slides in with a 200ms fade; numbers in that row count up (300ms).
13. **Scout surface** — small red "live" dot pulses (1s loop, opacity 0.4 → 1).
14. **Penny surface** — sparkline draws itself left-to-right on enter (600ms stroke-dashoffset animation).
15. **Mia anchor status line** — the number "11 agents working" subtly tick-counts +1 every ~8s (11 → 12 → 11 loop, suggests activity without being a real counter).

### Integrations marquee (Section 2)

16. **Auto-scroll** — continuous left-scroll, 40s loop desktop / 25s mobile. Pauses on hover (desktop) or tap (mobile).
17. **Logo hover tilt** — ±3° rotation + grayscale → full color (250ms).
18. **Logo enter-viewport pop** — each logo scales 0.95 → 1 + fades in when first entering viewport (once).

### 3-card "One Crew" block (Section 3)

19. **Cards stagger-in** — on scroll-into-view, 3 cards fade + slide up 16px with 120ms stagger between them.
20. **Card hover border glow** — `box-shadow` in agent color expands (250ms).
21. **Research card · counter-up** — 3 numbers (147 / 3 / 2) count from 0 to target in 1200ms with ease-out (once per view).
22. **Research card · pulsing dot** — Scout avatar's green "live" dot pulses 1s loop.
23. **Research card · scanning line** — CSS gradient sweep bottom-to-top, 6s loop, low opacity.
24. **Create card · tab rotation** — tabs auto-cycle every 3s, underline slides between active tabs (300ms).
25. **Create card · skeleton shimmer** — tab content transitions from shimmer gradient (1s loop during "loading") to resolved content (200ms fade).
26. **Create card · delivered badge** — green check icon scales in (200ms spring) when content resolves.
27. **Optimize card · metric ticker** — 4 metrics cross-fade every 3s (200ms fade).
28. **Optimize card · arrow direction** — green up-arrow / amber flat-arrow rotates 90° when metric changes direction (300ms).
29. **Optimize card · skill-saved toast** — toast slides up from bottom (250ms spring), dwells 2s, slides down (200ms). Fires every ~12s (every 4th metric cycle).

### Results strip (Section 4a)

30. **Tile enter-viewport** — each tile fades + slides up 12px with 100ms stagger (once).
31. **Metric number count-up** — big number counts from 0 to target (1000ms ease-out) when tile enters viewport.
32. **Tile flip on hover/tap** — 3D flip (600ms, `transform-style: preserve-3d`) reveals founder quote on back.
33. **Platform badge subtle bounce** — badge scales 0.95 → 1 with 80ms stagger after tile flip completes.

### Founder note (Section 4b)

34. **Signature draw-in** — SVG signature animates its stroke path (1200ms, `stroke-dasharray`/`stroke-dashoffset`) when section enters viewport.
35. **Photo ring pulse** — subtle ring around circular photo pulses once on enter (600ms).

### Trust badges (Section 4c)

36. **Badge icons pulse** — each icon scales 1 → 1.1 → 1 with 150ms stagger across the 4 badges when section enters viewport (once).
37. **"Read our data policy" link** — underline draws left-to-right on hover (250ms).

### FAQ accordion (Section 4d)

38. **Chevron rotate** — 180° rotation on open/close (200ms).
39. **Answer slide-down** — height 0 → auto with opacity fade (250ms ease-out).
40. **Hover state on question** — subtle background tint (100ms).

### Sticky mobile CTA (Section 5)

41. **Appear on scroll** — slides up from below viewport when user scrolls past 200px (300ms spring).
42. **Dismiss animation** — slides back down on X-tap (200ms).
43. **Drawer expand** — bottom-sheet drawer slides up from button tap (350ms spring).

### Count summary

**43 distinct micro-interactions total.** Plenty — this is in the upper range of what a single landing page can carry without feeling busy. If any feel excessive during implementation, the top candidates to cut are #7 (CTA shimmer), #15 (fake tick count), or #33 (badge bounce cascade).

---

## Testing approach

- **Visual regression:** Playwright screenshot tests for each section at 3 breakpoints (390px, 768px, 1440px).
- **Interaction tests:** Playwright tests for URL input submission (validates redirect URL with prefilled `store` param), FAQ accordion open/close, card rotation pause-on-hover.
- **Accessibility:**
  - Axe-core scan on all sections.
  - Keyboard navigation: all CTAs, FAQ accordion, URL inputs reachable with Tab and operable with Enter.
  - Screen reader labels on all animated surfaces; live regions silent (marketing content, not status).
  - `prefers-reduced-motion` test: verify all loops disabled.
- **Performance:**
  - Lighthouse target: Performance ≥ 90 mobile, ≥ 95 desktop.
  - LCP ≤ 2.5s; hero image preloaded.
  - CLS ≤ 0.1; canvas tiles reserve space to prevent shift.

---

## Success metrics (post-launch)

- **Primary:** landing → signup conversion rate. Baseline (current page) vs. new. Target: +40% lift within 30 days.
- **Secondary:** URL-input submission rate (how many paste a URL vs. click signup blank).
- **Tertiary:** scroll depth to Section 4 (FAQ) — proxy for engagement with trust content.

Instrument with existing analytics (PostHog or equivalent, verify in implementation).

---

## Open questions for user review

1. **Case study data** — do you have 3–4 real wins ready, or should implementation ship with placeholders and you slot real data in later?
2. **Founder photo/signature** — share now or fallback to initials + italic name for v1?
3. **Pricing** — should FAQ #8 link to current `/pricing` or wait until new pricing is finalized?
4. **Trust badges** — is SOC 2 Type II actually in progress? If not, drop that tile and maybe add a different trust signal.
5. **Sticky mobile CTA** — is the dismissible bar OK, or too aggressive? Alternative: show only after 50% scroll depth.
6. **Analytics** — confirm PostHog (or whichever tool) is the source of truth for conversion tracking.
