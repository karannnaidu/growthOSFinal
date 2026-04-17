export type EngineId = 'chatgpt' | 'perplexity' | 'gemini';

export interface EngineProbeResult {
  engine: EngineId;
  /** Did the answer mention the brand by canonical name (case-insensitive contains)? */
  cited: boolean;
  /** 1 = first brand mention, 2 = second, etc. null = not cited. */
  citation_rank: number | null;
  /** Names of competitors that WERE cited (case-insensitive substring match). */
  competitors_cited: string[];
  /** First 500 chars of the engine's answer. */
  excerpt: string;
  /** Set if the engine returned an error or rate-limit. */
  error?: string;
  rate_limited?: boolean;
}

export interface ProbeInput {
  query: string;
  brandCanonicalName: string;
  competitorNames: string[];
}

export type EngineFn = (input: ProbeInput) => Promise<EngineProbeResult>;

export function analyzeAnswer(
  engine: EngineId,
  answer: string,
  brandCanonicalName: string,
  competitorNames: string[],
): EngineProbeResult {
  const a = answer.toLowerCase();
  const brandLower = brandCanonicalName.toLowerCase();
  const brandIdx = a.indexOf(brandLower);
  const cited = brandIdx !== -1;

  // Citation rank: count how many *brand-like* mentions appear before ours.
  // Simple heuristic: count distinct competitor mentions + brand mentions in
  // order. Good enough for v1.
  const mentions: Array<{ name: string; idx: number }> = [];
  if (cited) mentions.push({ name: brandCanonicalName, idx: brandIdx });
  for (const comp of competitorNames) {
    const ci = a.indexOf(comp.toLowerCase());
    if (ci !== -1) mentions.push({ name: comp, idx: ci });
  }
  mentions.sort((m1, m2) => m1.idx - m2.idx);
  const rank = cited ? mentions.findIndex(m => m.name === brandCanonicalName) + 1 : null;

  const competitors_cited = competitorNames.filter(c => a.includes(c.toLowerCase()));

  return {
    engine,
    cited,
    citation_rank: rank,
    competitors_cited,
    excerpt: answer.slice(0, 500),
  };
}

/**
 * Probe all 3 engines in parallel. Per-engine failures are captured in the
 * returned result (not thrown) so one failure doesn't block the others.
 */
export async function probeAll(
  input: ProbeInput,
  engines: Record<EngineId, EngineFn>,
): Promise<Record<EngineId, EngineProbeResult>> {
  const entries = (Object.keys(engines) as EngineId[]).map(async (id) => {
    try {
      const res = await engines[id](input);
      return [id, res] as const;
    } catch (err) {
      return [id, {
        engine: id,
        cited: false,
        citation_rank: null,
        competitors_cited: [],
        excerpt: '',
        error: err instanceof Error ? err.message : String(err),
      }] as const;
    }
  });
  const results = await Promise.all(entries);
  return Object.fromEntries(results) as Record<EngineId, EngineProbeResult>;
}
