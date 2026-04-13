# Mia's Response — Competitive Response to Boheco Launch

**User message:** "My competitor Boheco just launched a new product line, I need to respond fast. They're running aggressive UGC ads."

**Connected platforms:** Meta Ads  
**Brand DNA:** Available (Calmosis — Ayurvedic cannabis wellness)

---

## Mia's Orchestration Decision

```json
{
  "decisions": [
    {
      "agent": "echo",
      "skill": "competitor-scan",
      "priority": "urgent",
      "reasoning": "Boheco just launched a new product line and is running aggressive UGC ads. Echo uses the Meta Ad Library (ScrapeCreators API) and Firecrawl to pull their active ads, new product pages, pricing, and messaging. We need to know exactly what they're saying before we counter it — their UGC angles, claims, product positioning, and spend signals.",
      "data_available": "ScrapeCreators API (Meta Ad Library) + Firecrawl website scraping + Brand DNA (Calmosis competitors list)",
      "data_missing": "None — Echo works independently, no platform connection required"
    },
    {
      "agent": "echo",
      "skill": "competitor-creative-library",
      "priority": "urgent",
      "reasoning": "Pulling Boheco's full creative library from Meta Ad Library to see their UGC ad formats, hooks, talent types, and messaging frameworks. Understanding their creative playbook lets Aria counter with differentiated angles rather than reactive mimicry.",
      "data_available": "ScrapeCreators API + Meta Ad Library",
      "data_missing": "None"
    },
    {
      "agent": "aria",
      "skill": "ugc-script",
      "priority": "high",
      "reasoning": "Once Echo delivers Boheco's creative angles, Aria will produce 3–5 counter-UGC scripts for Calmosis. The strategy: lean into Calmosis's Ayurvedic positioning and ritual-based calm — angles Boheco is unlikely to own. Aria will write hooks that intercept the same audience intent (cannabis wellness) but deliver a distinct brand story. Brand DNA is sufficient for strong output; Meta Ads data will make it performance-informed.",
      "data_available": "Brand DNA (Calmosis voice, positioning, audience) + Echo's competitor creative intel + Meta Ads (for top-performing ad formats on the account)",
      "data_missing": "None that blocks execution"
    },
    {
      "agent": "aria",
      "skill": "ad-copy",
      "priority": "high",
      "reasoning": "Alongside UGC scripts, Aria will generate direct-response ad copy variants — headlines, primary text, CTAs — that position Calmosis against Boheco's new line without naming them. Focus angles: heritage formulation, trust, purity, ritual over recreation. These can be live on Meta within hours.",
      "data_available": "Brand DNA + Meta Ads performance data (for copy length and format signals)",
      "data_missing": "None"
    },
    {
      "agent": "atlas",
      "skill": "audience-targeting",
      "priority": "high",
      "reasoning": "With Meta Ads connected, Atlas can identify the audience segments most at risk of being captured by Boheco's campaign — existing interest segments, lookalikes, and retargeting pools. Atlas will recommend a defensive targeting layer: retargeting warm audiences first, then lookalike expansion to intercept net-new Boheco prospects.",
      "data_available": "Meta Ads (audience segments, pixel data, campaign history) + Brand DNA",
      "data_missing": "None — Meta Ads is connected"
    },
    {
      "agent": "max",
      "skill": "ad-scaling",
      "priority": "high",
      "reasoning": "Competitive moments require budget reallocation. Max will analyze current Meta campaign ROAS and recommend fast budget redeployment — pulling from underperformers and increasing spend on the highest-converting creative and audiences to compete with Boheco's spend surge. With Meta Ads connected, this is real data, not benchmarks.",
      "data_available": "Meta Ads (campaign ROAS, spend, conversion data) + Brand DNA",
      "data_missing": "None — Meta Ads is connected"
    },
    {
      "agent": "scout",
      "skill": "health-check",
      "priority": "medium",
      "reasoning": "Running a health-check in parallel to confirm there are no underlying issues — creative fatigue, audience overlap, frequency spikes — that would hurt Calmosis's ability to compete right now. Better to know before increasing spend.",
      "data_available": "Brand DNA + Meta Ads",
      "data_missing": "GA4 for web-side signals, Klaviyo for retention context — not blocking for ad response"
    }
  ],
  "skipped": [
    {
      "agent": "hugo",
      "reason": "SEO response to a competitor launch is a week-scale move, not an hour-scale one. Not dispatching now — will queue for the weekly deep-dive to check if Boheco's new product pages are targeting any keywords Calmosis should be ranking for."
    },
    {
      "agent": "luna",
      "reason": "Klaviyo not connected. A competitive launch is a good trigger for an email/SMS campaign to existing customers — I'd recommend Boheco can steal awareness but not your existing buyers. Connect Klaviyo in Settings > Platforms and I'll have Luna draft a retention email sequence ('You found us first') within the hour."
    },
    {
      "agent": "nova",
      "reason": "AI visibility optimization is a 2–4 week horizon play. Skipping for this sprint. Will queue for next weekly cycle."
    },
    {
      "agent": "navi",
      "reason": "Shopify not connected. Cannot check inventory before scaling spend — recommend connecting Shopify so Navi can confirm stock levels before we push hard on Meta. If you stock out mid-campaign, spend is wasted."
    },
    {
      "agent": "penny",
      "reason": "Shopify not connected. Penny can't calculate the unit economics of a competitive response campaign without order/revenue data. Connect Shopify or provide data manually on Penny's agent page."
    },
    {
      "agent": "sage",
      "reason": "GA4 not connected. CRO improvements (landing page, signup flow) are high-value during a competitive spike but require traffic data to identify drop-off. Skipping for now — connect GA4 in Settings > Platforms to unlock Sage."
    }
  ],
  "message_to_user": "Got it — Boheco is moving fast, so we are too. Here's my game plan:\n\nFirst, I'm sending Echo in right now to pull everything Boheco is running — their new product pages, active UGC ads, messaging angles, and what hooks they're using. I need to see their playbook before we write a single word.\n\nWhile Echo is scanning, I'm queuing Aria to build counter-UGC scripts and ad copy the moment that intel lands. The angle: Boheco plays in the cannabis wellness space, but Calmosis owns Ayurvedic ritual and trust. We're not going to out-shout them — we're going to out-position them. Calm is a practice, not a product.\n\nWith Meta Ads connected, Atlas will identify which of your audiences are most exposed to Boheco's campaign and set up defensive targeting layers — protecting your warm audiences first, then intercepting the same cold audience pool. Max will look at your current campaign ROAS and tell us exactly where to move budget fast.\n\nTwo gaps worth flagging:\n1. Klaviyo isn't connected — a competitor launch is the exact moment to email your existing customers. Connect Klaviyo and Luna can have a retention sequence drafted in under an hour.\n2. Shopify isn't connected — before I have Max increase spend significantly, I'd want Navi to confirm you have inventory to fulfill the demand spike. Can you connect Shopify or check stock manually?\n\nTimeline: Echo reports back in ~15 minutes. Aria's UGC scripts and ad copy will be ready within the hour. Atlas and Max recommendations follow immediately after.\n\nWe're responding."
}
```

---

## Strategy Note

Boheco running aggressive UGC ads is a signal, not a threat — it means they're in a customer acquisition sprint and likely spending heavily on top-of-funnel awareness. Calmosis's defensive move is two-pronged:

1. **Protect the base** — retarget warm audiences with owned Ayurvedic positioning before Boheco's ads reach them
2. **Counter in the feed** — UGC scripts that speak to the same intent (cannabis wellness) but through a distinctly different lens (ritual, trust, ancient science) — angles that are harder for a mainstream brand like Boheco to authentically own

The goal is not to mimic their UGC energy — it's to make Calmosis look more credible, more specific, and more trustworthy in the same scroll session where a user sees Boheco's ad.
