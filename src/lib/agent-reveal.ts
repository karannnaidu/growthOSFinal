// ---------------------------------------------------------------------------
// Agent Reveal — Task 4.3
//
// Implements progressive agent reveal after onboarding diagnosis.
// Initially shows 3-5 agents relevant to chosen focus areas; remaining agents
// are revealed over 24-48 hours as they complete first runs.
//
// Server-side only.
// ---------------------------------------------------------------------------

import { createServiceClient } from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// Focus-area → agent mapping
// ---------------------------------------------------------------------------

const FOCUS_AGENT_MAP: Record<string, string[]> = {
  grow_revenue: ['scout', 'aria', 'max', 'atlas'],
  fix_conversions: ['scout', 'sage', 'luna', 'hugo'],
  get_found: ['scout', 'hugo', 'nova', 'echo'],
  all: ['scout', 'aria', 'max', 'luna', 'hugo', 'sage', 'atlas', 'echo', 'nova', 'navi', 'penny'],
};

const ALL_AGENT_IDS = [
  'mia', 'scout', 'aria', 'luna', 'hugo', 'sage',
  'max', 'atlas', 'echo', 'nova', 'navi', 'penny',
] as const;

// ---------------------------------------------------------------------------
// getInitialAgents
// ---------------------------------------------------------------------------

/**
 * Determine which agents to reveal immediately based on the brand's focus areas.
 * Always includes mia (manager) and scout (diagnostician).
 * Caps the reveal at 5 agents total (mia + scout + up to 3 specialists).
 */
export function getInitialAgents(focusAreas: string[]): string[] {
  const agents = new Set<string>(['mia', 'scout']);

  for (const focus of focusAreas) {
    const mapped = FOCUS_AGENT_MAP[focus] ?? [];
    mapped.forEach((a) => agents.add(a));
  }

  // Cap at 5 agents
  return Array.from(agents).slice(0, 5);
}

// ---------------------------------------------------------------------------
// initializeBrandAgents
// ---------------------------------------------------------------------------

/**
 * Called after onboarding completes (set-focus step).
 * Creates brand_agents records for all 12 agents:
 *   - Initial (revealed) agents: enabled=true, config.revealed=true
 *   - Remaining agents: enabled=true, config.revealed=false,
 *     config.reveal_after staggered every 4 hours starting 6 h from now
 *     (spans ~6 h → 50 h, i.e. within the 24-48 h window for most agents)
 */
export async function initializeBrandAgents(
  brandId: string,
  focusAreas: string[],
): Promise<void> {
  const initialAgents = getInitialAgents(focusAreas);

  const records = ALL_AGENT_IDS.map((agentId) => ({
    brand_id: brandId,
    agent_id: agentId,
    enabled: true,
    config: { revealed: true, reveal_after: null },
  }));

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('brand_agents')
    .upsert(records, { onConflict: 'brand_id,agent_id' });

  if (error) {
    console.error('[AgentReveal] initializeBrandAgents failed:', error.message);
    throw new Error(`Failed to initialize brand agents: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// getRevealedAgents
// ---------------------------------------------------------------------------

/**
 * Returns the list of agent IDs that should be visible to the brand right now.
 * An agent is revealed if:
 *   - config.revealed === true  (was in the initial set), OR
 *   - config.reveal_after has passed
 *
 * Falls back to ['mia', 'scout'] if no records exist yet.
 */
export async function getRevealedAgents(brandId: string): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('brand_agents')
    .select('agent_id, config')
    .eq('brand_id', brandId)
    .eq('enabled', true);

  if (error) {
    console.error('[AgentReveal] getRevealedAgents failed:', error.message);
    return ['mia', 'scout'];
  }

  if (!data || data.length === 0) {
    return ['mia', 'scout'];
  }

  const now = new Date();
  return data
    .filter((row) => {
      const config = row.config as { revealed?: boolean; reveal_after?: string | null } | null;
      if (config?.revealed) return true;
      if (config?.reveal_after && new Date(config.reveal_after) <= now) return true;
      return false;
    })
    .map((row) => row.agent_id as string);
}
