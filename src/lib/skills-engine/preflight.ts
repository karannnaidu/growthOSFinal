// src/lib/skills-engine/preflight.ts
//
// Tool-level resolution: for each declared mcp_tool, invoke its handler and
// classify the result into a ToolResolution. Used by runSkill to hard-block
// skills that have no source for a declared tool, and to inject data caveats
// when sources are lower-confidence.

import type { ResolverResult } from '@/lib/resolvers/brand-products';

export interface ToolResolution {
  tool: string;
  source: string | null;
  confidence: 'high' | 'medium' | 'low';
  isComplete: boolean;
  hasData: boolean;
}

function isResolverResult(v: unknown): v is ResolverResult<unknown> {
  return (
    !!v &&
    typeof v === 'object' &&
    'source' in (v as object) &&
    'confidence' in (v as object)
  );
}

function arrayHasData(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (!v) return false;
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    // Unwrap common wrapper shapes before length-checking so e.g. Meta's
    // `{data: []}` (empty ad account) correctly counts as no data.
    for (const key of ['data', 'rows', 'campaigns', 'adsets', 'customers', 'orders', 'products']) {
      if (key in obj) return arrayHasData(obj[key]);
    }
    return Object.keys(obj).length > 0;
  }
  return !!v;
}

/**
 * Given a brand and the skill's declared mcp_tools, call each handler
 * (via mcp-client.callTool) and build a per-tool resolution summary plus
 * the raw data keyed by tool name.
 *
 * The raw data is returned keyed by tool; the caller is responsible for
 * grouping it into the SkillDataContext platform-shaped object the prompt
 * builder expects.
 */
export async function resolveDeclaredTools(
  brandId: string,
  tools: string[],
): Promise<{
  resolutions: Record<string, ToolResolution>;
  liveDataByTool: Record<string, unknown>;
}> {
  const { callTool } = await import('@/lib/mcp-client');

  const resolutions: Record<string, ToolResolution> = {};
  const liveDataByTool: Record<string, unknown> = {};

  for (const tool of tools) {
    try {
      const res = await callTool(tool, { brandId });

      if (res === undefined || res === null) {
        // Handler returned nothing — no credential, no data source.
        resolutions[tool] = {
          tool,
          source: null,
          confidence: 'low',
          isComplete: false,
          hasData: false,
        };
        continue;
      }

      if (isResolverResult(res)) {
        const r = res as ResolverResult<unknown>;
        const hasData = Array.isArray(r.data) ? r.data.length > 0 : !!r.data;
        resolutions[tool] = {
          tool,
          source: r.source,
          confidence: r.confidence,
          isComplete: r.isComplete,
          hasData,
        };
        if (hasData) liveDataByTool[tool] = r.data;
      } else {
        const hasData = arrayHasData(res);
        // Legacy tools: platform prefix from tool name serves as source; full
        // data treated as high confidence when present.
        const source = hasData ? (tool.split('.')[0] || null) : null;
        resolutions[tool] = {
          tool,
          source,
          confidence: 'high',
          isComplete: hasData,
          hasData,
        };
        if (hasData) liveDataByTool[tool] = res;
      }
    } catch (err) {
      console.warn(`[preflight] tool ${tool} threw:`, err);
      resolutions[tool] = {
        tool,
        source: null,
        confidence: 'low',
        isComplete: false,
        hasData: false,
      };
    }
  }

  return { resolutions, liveDataByTool };
}

/**
 * Compute the blocked_reason + missing_platforms from per-tool resolutions.
 * Returns null if nothing is blocked.
 */
export function computeBlockage(
  resolutions: Record<string, ToolResolution>,
): { blockedReason: string; missingPlatforms: string[] } | null {
  const unresolved = Object.values(resolutions).filter((r) => !r.hasData);
  if (unresolved.length === 0) return null;

  const toolList = unresolved.map((r) => r.tool).join(', ');
  const missingPlatforms = Array.from(
    new Set(unresolved.map((r) => r.tool.split('.')[0]).filter((p): p is string => !!p)),
  );
  const connectList = missingPlatforms.join(' or ');

  return {
    blockedReason: `Cannot run: no data source for ${toolList}. Connect ${connectList} to unlock.`,
    missingPlatforms,
  };
}
