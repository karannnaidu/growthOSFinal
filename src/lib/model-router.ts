// ---------------------------------------------------------------------------
// Model Router — Task 1.5
// Selects the best available model for a given tier and preset,
// respecting in-memory rate limits.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Provider catalogue
// ---------------------------------------------------------------------------

const PROVIDERS = {
  'gemini-flash-lite': { model: 'gemini-2.5-flash-lite', provider: 'google', inputCost: 0, outputCost: 0, maxRPM: 30, maxRPD: 1500 },
  'gemini-flash': { model: 'gemini-2.5-flash', provider: 'google', inputCost: 0, outputCost: 0, maxRPM: 15, maxRPD: 1500 },
  'groq-llama-8b': { model: 'llama-3.3-8b-specdec', provider: 'groq', inputCost: 0, outputCost: 0, maxRPM: 30, maxRPD: 14400 },
  'groq-llama-70b': { model: 'llama-3.3-70b-versatile', provider: 'groq', inputCost: 0, outputCost: 0, maxRPM: 30, maxRPD: 6000 },
  'deepseek-v3': { model: 'deepseek-chat', provider: 'deepseek', inputCost: 0.27, outputCost: 1.10, maxRPM: 60 },
  'deepseek-r1': { model: 'deepseek-reasoner', provider: 'deepseek', inputCost: 0.55, outputCost: 2.19, maxRPM: 60 },
  'gemini-25-pro': { model: 'gemini-2.5-pro', provider: 'google', inputCost: 0, outputCost: 0, maxRPM: 5, maxRPD: 25 },
  'claude-sonnet': { model: 'claude-sonnet-4-6', provider: 'anthropic', inputCost: 3.00, outputCost: 15.00, maxRPM: 50 },
} as const;

// ---------------------------------------------------------------------------
// Tier / Preset routing tables
// ---------------------------------------------------------------------------

const TIER_ROUTES = {
  free: ['gemini-flash-lite', 'groq-llama-8b', 'gemini-flash'],
  cheap: ['gemini-flash', 'groq-llama-70b', 'deepseek-v3'],
  mid: ['deepseek-r1', 'gemini-25-pro', 'claude-sonnet'],
  premium: ['claude-sonnet', 'gemini-25-pro', 'deepseek-r1'],
} as const satisfies Record<string, ReadonlyArray<keyof typeof PROVIDERS>>;

const PRESETS = {
  autopilot: TIER_ROUTES,
  budget: {
    free: ['gemini-flash-lite', 'groq-llama-8b'],
    cheap: ['gemini-flash-lite', 'groq-llama-8b', 'gemini-flash'],
    mid: ['gemini-flash', 'groq-llama-70b', 'deepseek-v3'],
    premium: ['deepseek-r1', 'gemini-25-pro'],
  },
  quality: {
    free: ['gemini-flash', 'groq-llama-70b'],
    cheap: ['deepseek-v3', 'groq-llama-70b'],
    mid: ['claude-sonnet', 'deepseek-r1'],
    premium: ['claude-sonnet'],
  },
  byok: TIER_ROUTES,
} as const satisfies Record<string, Record<string, ReadonlyArray<keyof typeof PROVIDERS>>>;

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type Tier = 'free' | 'cheap' | 'mid' | 'premium';
export type Preset = 'autopilot' | 'budget' | 'quality' | 'byok';
export type ProviderKey = keyof typeof PROVIDERS;

export interface ModelRoute {
  providerKey: ProviderKey;
  model: string;
  provider: string;
  inputCost: number;
  outputCost: number;
}

// ---------------------------------------------------------------------------
// In-memory rate-limit store
// Tracks requests per minute (RPM) and per day (RPD) per provider key.
// ---------------------------------------------------------------------------

interface RateLimitBucket {
  minuteCount: number;
  minuteWindowStart: number; // epoch ms
  dayCount: number;
  dayWindowStart: number;   // epoch ms
}

const rateLimitStore = new Map<ProviderKey, RateLimitBucket>();

function getBucket(providerKey: ProviderKey): RateLimitBucket {
  let bucket = rateLimitStore.get(providerKey);
  if (!bucket) {
    bucket = { minuteCount: 0, minuteWindowStart: Date.now(), dayCount: 0, dayWindowStart: Date.now() };
    rateLimitStore.set(providerKey, bucket);
  }

  const now = Date.now();

  // Roll minute window
  if (now - bucket.minuteWindowStart >= 60_000) {
    bucket.minuteCount = 0;
    bucket.minuteWindowStart = now;
  }

  // Roll day window
  if (now - bucket.dayWindowStart >= 86_400_000) {
    bucket.dayCount = 0;
    bucket.dayWindowStart = now;
  }

  return bucket;
}

/** Returns true when the provider still has capacity, false when rate-limited. */
export function checkRateLimit(providerKey: ProviderKey): boolean {
  const cfg = PROVIDERS[providerKey];
  const bucket = getBucket(providerKey);

  if (bucket.minuteCount >= cfg.maxRPM) return false;
  if ('maxRPD' in cfg && bucket.dayCount >= cfg.maxRPD) return false;

  return true;
}

/** Record one request against the provider's rate-limit counters. */
export function recordRequest(providerKey: ProviderKey): void {
  const bucket = getBucket(providerKey);
  bucket.minuteCount += 1;
  bucket.dayCount += 1;
}

// ---------------------------------------------------------------------------
// Key availability — skip providers whose API key is missing
// ---------------------------------------------------------------------------

const PROVIDER_KEY_ENV: Record<string, string> = {
  google: 'GOOGLE_AI_KEY',
  groq: 'GROQ_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

function hasApiKey(providerKey: ProviderKey): boolean {
  const cfg = PROVIDERS[providerKey];
  const envVar = PROVIDER_KEY_ENV[cfg.provider];
  if (!envVar) return false;
  return !!process.env[envVar];
}

// ---------------------------------------------------------------------------
// Routing logic
// ---------------------------------------------------------------------------

function toRoute(key: ProviderKey): ModelRoute {
  const cfg = PROVIDERS[key];
  return {
    providerKey: key,
    model: cfg.model,
    provider: cfg.provider,
    inputCost: cfg.inputCost,
    outputCost: cfg.outputCost,
  };
}

/**
 * Returns the best available ModelRoute for the given tier and preset.
 * Skips providers that are rate-limited OR whose API key is not set.
 * Falls back across ALL providers if tier candidates are exhausted.
 */
export function routeModel(tier: Tier, preset: Preset = 'autopilot'): ModelRoute {
  const routes = PRESETS[preset] as Record<Tier, ReadonlyArray<ProviderKey>>;
  const candidates = routes[tier] ?? TIER_ROUTES[tier];

  // 1. Try tier candidates (key available + rate limit OK)
  for (const key of candidates) {
    if (hasApiKey(key) && checkRateLimit(key)) {
      return toRoute(key);
    }
  }

  // 2. Fallback: try ANY provider with an available key
  const allKeys = Object.keys(PROVIDERS) as ProviderKey[];
  for (const key of allKeys) {
    if (hasApiKey(key) && checkRateLimit(key)) {
      return toRoute(key);
    }
  }

  // 3. Last resort: return first tier candidate anyway (will fail with a clear error)
  return toRoute(candidates[0]!);
}

/** Returns the next tier up. Premium stays at premium. */
export function upgradeTier(tier: Tier): Tier {
  const ladder: Tier[] = ['free', 'cheap', 'mid', 'premium'];
  const idx = ladder.indexOf(tier);
  return idx < ladder.length - 1 ? ladder[idx + 1]! : 'premium';
}
