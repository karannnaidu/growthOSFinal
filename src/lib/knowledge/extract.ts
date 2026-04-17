// ---------------------------------------------------------------------------
// Entity Extraction — Task 3.4
//
// After a successful skill run, extractEntities() calls a lightweight LLM to
// pull structured entities out of the output and stores them in the knowledge
// graph (knowledge_nodes, knowledge_edges, knowledge_snapshots).
//
// Server-side only.
// ---------------------------------------------------------------------------

import { loadSkill } from '@/lib/skill-loader';
import { callModel } from '@/lib/model-client';
import { embedText } from '@/lib/knowledge/rag';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  nodesCreated: number;
  edgesCreated: number;
  snapshotsCreated: number;
  /** Node types the LLM returned that weren't in the skill's `produces` list. */
  unexpectedNodeTypes: string[];
  /** Set to a Node error message if the LLM call itself failed. */
  error?: string;
}

// Shape of the JSON we ask the LLM to produce
interface ExtractedGraph {
  nodes: Array<{
    name: string;
    node_type: string;
    summary?: string;
    properties?: Record<string, any>;
    confidence?: number;
  }>;
  edges: Array<{
    source: string; // name of source node (must match a node above)
    target: string; // name of target node (must match a node above)
    edge_type: string;
    weight?: number;
  }>;
  metrics?: Array<{
    node_name: string; // must match a node above
    metrics: Record<string, any>;
  }>;
}

// ---------------------------------------------------------------------------
// Valid enum values (mirrors the DB CHECK constraints)
// ---------------------------------------------------------------------------

const VALID_NODE_TYPES = new Set([
  'product', 'audience', 'campaign', 'content', 'competitor',
  'insight', 'metric', 'experiment', 'creative', 'keyword',
  'email_flow', 'channel', 'persona', 'product_image',
  'competitor_creative', 'ad_creative', 'video_asset',
  'landing_page', 'review_theme', 'price_point',
  'brand_guidelines', 'brand_asset', 'top_content',
  // Nova AI visibility:
  'brand_dna', 'ai_query', 'ai_probe_result', 'ai_artifact',
]);

const VALID_EDGE_TYPES = new Set([
  'targets', 'uses_creative', 'competes_with', 'inspired_by',
  'performs_on', 'belongs_to', 'generated_by', 'reviewed_by',
  'derived_from', 'part_of', 'sends_to', 'has_variant',
  'supersedes', 'similar_to', 'mentions',
]);

// ---------------------------------------------------------------------------
// LLM extraction prompt
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `You are an entity extraction engine for a marketing knowledge graph.

Given a skill output JSON, extract the most important entities and relationships.

Return ONLY valid JSON with this exact shape (no markdown fences, no extra text):
{
  "nodes": [
    {
      "name": "string (concise label)",
      "node_type": "one of: product|audience|campaign|content|competitor|insight|metric|experiment|creative|keyword|email_flow|channel|persona|product_image|competitor_creative|ad_creative|video_asset|landing_page|review_theme|price_point|brand_guidelines|brand_asset|top_content",
      "summary": "one sentence description",
      "properties": { "key": "value" },
      "confidence": 0.0-1.0
    }
  ],
  "edges": [
    {
      "source": "node name from above",
      "target": "node name from above",
      "edge_type": "one of: targets|uses_creative|competes_with|inspired_by|performs_on|belongs_to|generated_by|reviewed_by|derived_from|part_of|sends_to|has_variant|supersedes|similar_to|mentions",
      "weight": 0.0-1.0
    }
  ],
  "metrics": [
    {
      "node_name": "node name from above",
      "metrics": { "metricKey": "metricValue" }
    }
  ]
}

Rules:
- Extract 1–10 nodes maximum. Quality over quantity.
- Only add edges between nodes you listed.
- Only include metrics if the output contains numeric or time-series data.
- Skip nodes with generic names like "output" or "result".`;

// ---------------------------------------------------------------------------
// Tolerant JSON parser
//
// Even with Gemini's responseMimeType=application/json, occasional replies
// come back with trailing commas or get truncated mid-object when the model
// hits the token limit. We salvage what we can rather than losing the whole
// extraction.
// ---------------------------------------------------------------------------

function parseExtractedGraph(raw: string): ExtractedGraph {
  let text = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const firstBrace = text.indexOf('{');
  if (firstBrace > 0) text = text.slice(firstBrace);

  try {
    return JSON.parse(text) as ExtractedGraph;
  } catch {
    // Salvage path: trim to the last complete array element, strip trailing
    // commas, then close any open braces/brackets.
    let salvaged = text.replace(/,\s*([}\]])/g, '$1');

    // If JSON.parse still fails, walk back to the last `}` or `]` that sits
    // at a shallow depth and truncate there. This handles the common case of
    // "cut off mid-node".
    try {
      return JSON.parse(salvaged) as ExtractedGraph;
    } catch {
      const lastObjEnd = Math.max(salvaged.lastIndexOf('}'), salvaged.lastIndexOf(']'));
      if (lastObjEnd > 0) {
        salvaged = salvaged.slice(0, lastObjEnd + 1);
        // Close any still-open containers the truncation left dangling.
        let depth = 0;
        const stack: string[] = [];
        for (const ch of salvaged) {
          if (ch === '{') { stack.push('}'); depth++; }
          else if (ch === '[') { stack.push(']'); depth++; }
          else if (ch === '}' || ch === ']') { stack.pop(); depth--; }
        }
        while (stack.length > 0) salvaged += stack.pop();
        // Strip trailing commas one more time before parsing.
        salvaged = salvaged.replace(/,(\s*[}\]])/g, '$1');
        return JSON.parse(salvaged) as ExtractedGraph;
      }
      throw new Error('Unparseable LLM JSON output');
    }
  }
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function extractEntities(
  brandId: string,
  skillId: string,
  skillRunId: string,
  output: Record<string, any>,
): Promise<ExtractionResult> {
  // Short-circuit if output is empty or trivially small
  const outputJson = JSON.stringify(output);
  if (outputJson.length < 30) {
    return { nodesCreated: 0, edgesCreated: 0, snapshotsCreated: 0, unexpectedNodeTypes: [] };
  }

  // ------------------------------------------------------------------
  // 1. Load skill's `produces` config (used as a hint to the LLM and
  //    for fallback node typing when the LLM is uncertain).
  // ------------------------------------------------------------------
  let producesHint = '';
  try {
    const skill = await loadSkill(skillId);
    if (skill.produces && skill.produces.length > 0) {
      producesHint = `\n\nThe skill is configured to produce nodes of these types: ${skill.produces.map((p) => p.nodeType).join(', ')}.`;
    }
  } catch {
    // Non-fatal — continue without the hint
  }

  // ------------------------------------------------------------------
  // 2. Call Gemini Flash-Lite (free tier) to extract entities
  // ------------------------------------------------------------------
  let extracted: ExtractedGraph;
  try {
    const result = await callModel({
      model: 'gemini-2.5-flash-lite',
      provider: 'google',
      systemPrompt: EXTRACTION_SYSTEM_PROMPT + producesHint,
      userPrompt: `## Skill Output\n${outputJson.slice(0, 8000)}`, // cap to avoid token limit
      maxTokens: 2048,
      temperature: 0.1,
      jsonMode: true,
    });

    extracted = parseExtractedGraph(result.content);
  } catch (err) {
    console.warn('[Extract] LLM extraction failed (non-fatal):', err);
    return {
      nodesCreated: 0,
      edgesCreated: 0,
      snapshotsCreated: 0,
      unexpectedNodeTypes: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // ------------------------------------------------------------------
  // 3. Persist to Supabase
  // ------------------------------------------------------------------
  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = createServiceClient();

  let nodesCreated = 0;
  let edgesCreated = 0;
  let snapshotsCreated = 0;

  // Track name → id for edge and metrics resolution
  const nodeIdByName = new Map<string, string>();

  // --- Nodes ---
  // Build per-skill allow-list from `produces`. If the skill declares no
  // produces, we fall back to the global VALID_NODE_TYPES (old behaviour).
  let allowedTypes: Set<string> | null = null;
  try {
    const skill = await loadSkill(skillId);
    if (skill.produces && skill.produces.length > 0) {
      allowedTypes = new Set(skill.produces.map(p => p.nodeType));
    }
  } catch { /* already logged above */ }

  const unexpectedNodeTypes: string[] = [];

  for (const node of extracted.nodes ?? []) {
    if (!node.name || !node.node_type) continue;
    if (!VALID_NODE_TYPES.has(node.node_type)) {
      unexpectedNodeTypes.push(node.node_type);
      continue;
    }
    if (allowedTypes && !allowedTypes.has(node.node_type)) {
      unexpectedNodeTypes.push(node.node_type);
      continue;
    }

    // Generate embedding inline so the node is immediately searchable via RAG
    let embedding: number[] | null = null;
    try {
      const textForEmbedding = `${node.name}. ${node.summary || ''}. ${JSON.stringify(node.properties || {})}`;
      embedding = await embedText(textForEmbedding);
    } catch (err) {
      console.warn(`[extract] Embedding generation failed for "${node.name}":`, err);
    }

    const { data: inserted, error } = await supabase
      .from('knowledge_nodes')
      .insert({
        brand_id: brandId,
        node_type: node.node_type,
        name: node.name.slice(0, 255),
        summary: node.summary?.slice(0, 500) ?? null,
        properties: node.properties ?? {},
        confidence: node.confidence ?? 1.0,
        source_skill: skillId,
        source_run_id: skillRunId,
        embedding,
        is_active: true,
      })
      .select('id')
      .single();

    if (!error && inserted?.id) {
      nodeIdByName.set(node.name, inserted.id as string);
      nodesCreated++;
    } else if (error) {
      console.warn('[Extract] Failed to insert node:', node.name, error.message);
    }
  }

  // --- Edges ---
  for (const edge of extracted.edges ?? []) {
    if (!edge.source || !edge.target || !edge.edge_type) continue;
    if (!VALID_EDGE_TYPES.has(edge.edge_type)) continue;

    const sourceId = nodeIdByName.get(edge.source);
    const targetId = nodeIdByName.get(edge.target);
    if (!sourceId || !targetId || sourceId === targetId) continue;

    const { error } = await supabase.from('knowledge_edges').insert({
      brand_id: brandId,
      source_node_id: sourceId,
      target_node_id: targetId,
      edge_type: edge.edge_type,
      weight: edge.weight ?? 1.0,
      source_skill: skillId,
      source_run_id: skillRunId,
    });

    if (!error) {
      edgesCreated++;
    } else if (!error.message.includes('unique')) {
      // Ignore duplicate-edge violations silently; warn on other errors
      console.warn('[Extract] Failed to insert edge:', edge.source, '->', edge.target, error.message);
    }
  }

  // --- Snapshots ---
  for (const snap of extracted.metrics ?? []) {
    if (!snap.node_name || !snap.metrics || Object.keys(snap.metrics).length === 0) continue;

    const nodeId = nodeIdByName.get(snap.node_name);
    if (!nodeId) continue;

    const { error } = await supabase.from('knowledge_snapshots').insert({
      brand_id: brandId,
      node_id: nodeId,
      metrics: snap.metrics,
      source_skill: skillId,
      source_run_id: skillRunId,
      snapshot_at: new Date().toISOString(),
    });

    if (!error) {
      snapshotsCreated++;
    } else {
      console.warn('[Extract] Failed to insert snapshot for node:', snap.node_name, error.message);
    }
  }

  return { nodesCreated, edgesCreated, snapshotsCreated, unexpectedNodeTypes };
}
