// ---------------------------------------------------------------------------
// RAG Query Engine — Task 3.4
//
// Semantic search over the knowledge graph using Gemini text-embedding-004
// vectors stored in Supabase. Graph traversal follows edges from matched nodes.
//
// Server-side only.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RAGQuery {
  brandId: string;
  query: string;
  /** Filter to specific node types (optional). */
  nodeTypes?: string[];
  /** Max nodes to return from vector search (default 10). */
  limit?: number;
  /** How many edge hops to follow from seed nodes (default 1). */
  traverseDepth?: number;
  /** Also fetch agency-level patterns if brand has an agency parent. */
  includeAgencyPatterns?: boolean;
}

export interface RAGResult {
  nodes: Array<{
    id: string;
    name: string;
    nodeType: string;
    summary: string;
    properties: any;
    confidence: number;
    similarity: number;
  }>;
  edges: Array<{
    sourceId: string;
    targetId: string;
    edgeType: string;
    weight: number;
  }>;
  snapshots: Array<{
    nodeId: string;
    metrics: any;
    snapshotAt: string;
  }>;
  agencyPatterns: Array<{
    name: string;
    patternType: string;
    data: any;
  }>;
}

// ---------------------------------------------------------------------------
// Embedding helper
// ---------------------------------------------------------------------------

/**
 * Generate a 768-dim embedding for `text` using Gemini text-embedding-004.
 * Returns a Float32Array-like number array.
 */
async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_KEY is not set');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini embedding API error ${response.status}: ${errText}`);
  }

  const json = (await response.json()) as { embedding?: { values?: number[] } };
  const values = json.embedding?.values;

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Gemini embedding returned empty values');
  }

  return values;
}

// ---------------------------------------------------------------------------
// Vector helper: format embedding as Postgres vector literal
// ---------------------------------------------------------------------------

function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

// ---------------------------------------------------------------------------
// Main ragQuery function
// ---------------------------------------------------------------------------

export async function ragQuery(input: RAGQuery): Promise<RAGResult> {
  const limit = input.limit ?? 10;
  const traverseDepth = input.traverseDepth ?? 1;

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  // ------------------------------------------------------------------
  // 1. Embed query text
  // ------------------------------------------------------------------
  let embedding: number[];
  try {
    embedding = await embedText(input.query);
  } catch (err) {
    console.warn('[RAG] Embedding failed, returning empty result:', err);
    return { nodes: [], edges: [], snapshots: [], agencyPatterns: [] };
  }

  // ------------------------------------------------------------------
  // 2. Vector similarity search via RPC
  // ------------------------------------------------------------------
  const { data: rawNodes, error: nodeError } = await supabase.rpc(
    'match_knowledge_nodes',
    {
      query_embedding: toVectorLiteral(embedding),
      match_brand_id: input.brandId,
      match_threshold: 0.3,
      match_count: limit,
      filter_node_types: input.nodeTypes ?? null,
    },
  );

  if (nodeError) {
    console.warn('[RAG] match_knowledge_nodes RPC error:', nodeError.message);
    return { nodes: [], edges: [], snapshots: [], agencyPatterns: [] };
  }

  const seedNodes: RAGResult['nodes'] = (rawNodes ?? []).map((n: any) => ({
    id: n.id as string,
    name: n.name as string,
    nodeType: n.node_type as string,
    summary: (n.summary ?? '') as string,
    properties: n.properties ?? {},
    confidence: Number(n.confidence ?? 1),
    similarity: Number(n.similarity ?? 0),
  }));

  const seedIds = seedNodes.map((n) => n.id);

  // ------------------------------------------------------------------
  // 3. Graph traversal — follow edges for `traverseDepth` hops
  // ------------------------------------------------------------------
  const allNodes = new Map<string, RAGResult['nodes'][number]>(
    seedNodes.map((n) => [n.id, n]),
  );
  const allEdges: RAGResult['edges'] = [];
  let currentIds = seedIds;

  for (let depth = 0; depth < traverseDepth && currentIds.length > 0; depth++) {
    const { data: edgeRows, error: edgeError } = await supabase
      .from('knowledge_edges')
      .select(
        'source_node_id, target_node_id, edge_type, weight, knowledge_nodes!target_node_id(id, name, node_type, summary, properties, confidence)',
      )
      .in('source_node_id', currentIds)
      .eq('brand_id', input.brandId);

    if (edgeError) {
      console.warn('[RAG] Edge traversal error (depth', depth, '):', edgeError.message);
      break;
    }

    const nextIds: string[] = [];

    for (const row of edgeRows ?? []) {
      allEdges.push({
        sourceId: row.source_node_id as string,
        targetId: row.target_node_id as string,
        edgeType: row.edge_type as string,
        weight: Number(row.weight ?? 1),
      });

      // Accumulate the target node if not already in the map
      const targetNode = row.knowledge_nodes as any;
      if (targetNode && !allNodes.has(targetNode.id as string)) {
        allNodes.set(targetNode.id as string, {
          id: targetNode.id as string,
          name: targetNode.name as string,
          nodeType: targetNode.node_type as string,
          summary: (targetNode.summary ?? '') as string,
          properties: targetNode.properties ?? {},
          confidence: Number(targetNode.confidence ?? 1),
          similarity: 0, // traversed, not directly matched
        });
        nextIds.push(targetNode.id as string);
      }
    }

    currentIds = nextIds;
  }

  // ------------------------------------------------------------------
  // 4. Snapshots — latest snapshot per seed node
  // ------------------------------------------------------------------
  const snapshots: RAGResult['snapshots'] = [];

  if (seedIds.length > 0) {
    // Fetch snapshots for all matched nodes
    const { data: snapshotRows, error: snapshotError } = await supabase
      .from('knowledge_snapshots')
      .select('node_id, metrics, snapshot_at')
      .in('node_id', seedIds)
      .eq('brand_id', input.brandId)
      .order('snapshot_at', { ascending: false });

    if (!snapshotError && snapshotRows) {
      // Keep only the latest snapshot per node
      const seenNodeIds = new Set<string>();
      for (const row of snapshotRows) {
        if (!seenNodeIds.has(row.node_id as string)) {
          seenNodeIds.add(row.node_id as string);
          snapshots.push({
            nodeId: row.node_id as string,
            metrics: row.metrics ?? {},
            snapshotAt: row.snapshot_at as string,
          });
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // 5. Agency patterns (optional)
  // ------------------------------------------------------------------
  const agencyPatterns: RAGResult['agencyPatterns'] = [];

  if (input.includeAgencyPatterns) {
    // Look up agency_parent_id for this brand
    const { data: brandRow } = await supabase
      .from('brands')
      .select('agency_parent_id')
      .eq('id', input.brandId)
      .single();

    const agencyParentId = brandRow?.agency_parent_id;

    if (agencyParentId) {
      const { data: patternRows, error: patternError } = await supabase
        .from('agency_patterns')
        .select('name, pattern_type, data')
        .eq('agency_brand_id', agencyParentId)
        .eq('is_active', true);

      if (!patternError && patternRows) {
        for (const row of patternRows) {
          agencyPatterns.push({
            name: row.name as string,
            patternType: row.pattern_type as string,
            data: row.data ?? {},
          });
        }
      }
    }
  }

  return {
    nodes: Array.from(allNodes.values()),
    edges: allEdges,
    snapshots,
    agencyPatterns,
  };
}
