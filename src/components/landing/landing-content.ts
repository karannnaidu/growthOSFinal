// Single source of truth for landing-page copy and structured data.
// Edit here to change marketing copy; component files consume these.

export const HERO_CONTENT = {
  h1: 'Your AI marketing crew. One URL away.',
  subhead:
    'Paste your store URL. Mia briefs 11 specialist agents. They run your marketing on autopilot.',
  urlPlaceholders: ['yourstore.com', 'acme.co', 'brand.shop', 'hellobrand.com'],
  ctaLabel: 'Start free →',
  ctaMicrocopy: 'No credit card. 14-day free trial.',
  miaStatus: 'Running your store on autopilot. 11 agents working.',
} as const

export type HeroSurface = {
  id: 'aria' | 'max' | 'scout' | 'echo' | 'penny'
  agent: string
  caption: string
  body: string
  accentColor: string
}

export const HERO_SURFACES: HeroSurface[] = [
  {
    id: 'aria',
    agent: 'Aria',
    caption: 'Aria · drafting variant 2 of 4',
    body: 'Drafted 4 ad variants from 147 customer reviews. Testing variant 3.',
    accentColor: '#F97316',
  },
  {
    id: 'max',
    agent: 'Max',
    caption: 'Max · live on Meta',
    body: "Paused 'Summer v1' — CPA drifted +22%. Scaled 'UGC hook 3' to $120/day.",
    accentColor: '#3B82F6',
  },
  {
    id: 'scout',
    agent: 'Scout',
    caption: 'Scout · 2 min ago',
    body: 'Spotted: checkout abandons spiked Tuesday 2pm. Flagged to Sage.',
    accentColor: '#0D9488',
  },
  {
    id: 'echo',
    agent: 'Echo',
    caption: 'Echo · competitive watch',
    body: '3 competitors dropped new hero images this week. Cached to library.',
    accentColor: '#64748B',
  },
  {
    id: 'penny',
    agent: 'Penny',
    caption: 'Penny · weekly',
    body: 'CAC fell to $18.40 (−9% WoW). LTV:CAC now 4.2x.',
    accentColor: '#059669',
  },
]

export const INTEGRATIONS_CONTENT = {
  header: 'Works with your stack — not against it.',
  subtext: 'Deep on Shopify. Friendly with everyone else.',
  groups: [
    {
      label: 'Storefronts',
      items: [
        { name: 'Shopify', logo: '/logos/shopify.svg' },
        { name: 'WooCommerce', logo: '/logos/woocommerce.svg' },
        { name: 'Wix', logo: '/logos/wix.svg' },
        { name: 'Squarespace', logo: '/logos/squarespace.svg' },
        { name: 'Webflow', logo: '/logos/webflow.svg' },
      ],
    },
    {
      label: 'Ad platforms',
      items: [
        { name: 'Meta', logo: '/logos/meta.svg' },
        { name: 'Google', logo: '/logos/google.svg' },
        { name: 'TikTok', logo: '/logos/tiktok.svg' },
        { name: 'Pinterest', logo: '/logos/pinterest.svg' },
      ],
    },
    {
      label: 'Email/SMS',
      items: [
        { name: 'Klaviyo', logo: '/logos/klaviyo.svg' },
        { name: 'Mailchimp', logo: '/logos/mailchimp.svg' },
        { name: 'Postscript', logo: '/logos/postscript.svg' },
      ],
    },
    {
      label: 'Analytics',
      items: [
        { name: 'GA4', logo: '/logos/ga4.svg' },
        { name: 'Triple Whale', logo: '/logos/triple-whale.svg' },
      ],
    },
  ],
} as const

export const ONE_CREW_CONTENT = {
  header: 'One crew. Every part of your marketing.',
  sub: 'Research, create, optimize — running in parallel, reporting up to Mia.',
  research: {
    avatars: ['Scout', 'Echo', 'Atlas'],
    stats: [
      { number: 147, label: 'customer reviews analyzed', agent: 'Scout' },
      { number: 3, label: 'competitor creative drops spotted this week', agent: 'Echo' },
      { number: 2, label: 'untapped audience segments surfaced', agent: 'Atlas' },
    ],
    accentColor: '#0D9488',
  },
  create: {
    tabs: [
      {
        id: 'ad',
        label: 'Ad copy',
        content: 'POV: You stop scrolling on reviews. Then scroll to checkout.',
        caption: 'Aria · Draft 3 of 4',
      },
      {
        id: 'email',
        label: 'Email',
        content: 'Subject: Did we forget something? 👀',
        caption: 'Luna · Cart recovery · Day 1',
      },
      {
        id: 'landing',
        label: 'Landing page',
        content: 'The only moisturizer tested on 200 real noses.',
        caption: 'Hugo · H1 rewrite',
      },
      {
        id: 'seo',
        label: 'SEO brief',
        content: "Target: 'best retinol for sensitive skin' — 8.2k/mo",
        caption: 'Hugo · keyword strategy',
      },
    ],
    accentColor: '#F97316',
  },
  optimize: {
    metrics: [
      { text: '+23% ROAS · UGC hooks', tone: 'up' as const },
      { text: '−14% CPA · Price anchoring test', tone: 'up' as const },
      { text: '$18.40 CAC · Down 9% WoW', tone: 'up' as const },
      { text: 'Paused 2 ads draining budget', tone: 'flat' as const },
    ],
    toast: "Skill saved ✨ 'UGC hook formula' added to your playbook",
    accentColor: '#3B82F6',
  },
} as const

export type ResultCase = {
  brand: string
  logo: string
  metric: string
  context: string
  platform: 'Shopify' | 'WooCommerce' | 'Custom'
  quote: string
  founderName: string
}

// Placeholder case studies. Replace with real data before launch.
export const RESULT_CASES: ResultCase[] = [
  {
    brand: 'Sample Brand A',
    logo: '/logos/placeholder-brand-a.svg',
    metric: '+34% ROAS',
    context: 'D2C skincare · 21 days · Aria + Max',
    platform: 'Shopify',
    quote: 'The creative refresh cycle paid for itself in a week.',
    founderName: 'Founder, Sample Brand A',
  },
  {
    brand: 'Sample Brand B',
    logo: '/logos/placeholder-brand-b.svg',
    metric: '−28% CAC',
    context: 'DTC apparel · 45 days · Luna + Atlas',
    platform: 'WooCommerce',
    quote: 'Email flows we never had time to build now run themselves.',
    founderName: 'Founder, Sample Brand B',
  },
  {
    brand: 'Sample Brand C',
    logo: '/logos/placeholder-brand-c.svg',
    metric: '+52% AOV',
    context: 'Wellness · 30 days · Sage + Atlas',
    platform: 'Custom',
    quote: 'Sage found a pricing change we would have missed.',
    founderName: 'Founder, Sample Brand C',
  },
  {
    brand: 'Sample Brand D',
    logo: '/logos/placeholder-brand-d.svg',
    metric: '+41% LTV',
    context: 'Food & bev · 60 days · Luna + Penny',
    platform: 'Shopify',
    quote: 'Penny caught a margin leak in week two. Game changer.',
    founderName: 'Founder, Sample Brand D',
  },
]

export const FOUNDER_NOTE = {
  paragraphs: [
    'I built Growth OS after watching dozens of D2C founders pay agencies $8–15k/month for work that arrived late, went stale fast, and still needed chasing.',
    'This isn\'t another ChatGPT wrapper. It\'s an autopilot crew — 12 specialists with their own skills, memory, and schedules — not one generalist in a chatbox. Mia orchestrates them based on what your store actually needs.',
    'Your data never trains shared models. Your creatives are yours. You can export everything and cancel anytime. That\'s the deal.',
  ],
  signatureName: 'Karan',
  signatureRole: 'Founder, Growth OS',
  signatureImage: '/founder-photo.jpg',
} as const

export const TRUST_BADGES = [
  { icon: '🛡️', label: 'Your data never trains shared models' },
  { icon: '🇪🇺', label: 'GDPR + CCPA compliant' },
  { icon: '🔄', label: 'Export everything. Cancel anytime.' },
  { icon: '🔒', label: 'SOC 2 Type II — in progress' },
] as const

export type FaqItem = { q: string; a: string }

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: "I'm not on Shopify. Does this work for me?",
    a: 'Yes. We connect to WooCommerce, Wix, Squarespace, Webflow, and custom sites. Shopify is our deepest integration; the others are solid and improving weekly.',
  },
  {
    q: 'I already have an agency. Why would I switch?',
    a: 'Agencies bill $8–15k/month and take weeks to ship. Growth OS runs 24/7, ships in hours, and costs less than a junior strategist. Keep the agency for what humans do best — we handle the grind.',
  },
  {
    q: 'Is this just ChatGPT with a UI?',
    a: 'No. 12 specialist agents, each with their own skills, memory, and schedules. Mia orchestrates them based on what your store needs — not what you type into a box.',
  },
  {
    q: 'What if Mia makes a bad call?',
    a: 'She asks for approval on budget changes, brand-sensitive decisions, and anything below her confidence threshold. Everything else she executes and reports back.',
  },
  {
    q: 'Does this work under $10k MRR?',
    a: 'Yes. The agents scale down. For small brands, the biggest wins are usually Luna (email flows) and Hugo (SEO) — both compound without ad spend.',
  },
  {
    q: 'Who owns the creatives Mia generates?',
    a: 'You do. Always. Export anytime, use anywhere, no watermarks, no restrictions.',
  },
  {
    q: 'How fast will I see results?',
    a: '14–30 days for first wins (abandoned-cart recovery, creative refresh). 60–90 days for compounding results (SEO, LTV lift, new audience segments).',
  },
  {
    q: 'What does it cost?',
    a: 'Starts affordable with no ad-spend percentage. See full pricing for current tiers.',
  },
]

export const CTA_LABELS = {
  hero: 'Start free →',
  midPage: 'See what Mia finds on your store →',
  final: 'Start free → Mia begins in 60 seconds',
} as const
