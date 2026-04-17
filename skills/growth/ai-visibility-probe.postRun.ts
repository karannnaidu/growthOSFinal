import type { PostRunContext } from '@/lib/post-run';

interface PerEngineResult {
  cited: boolean;
  citation_rank: number | null;
  competitors_cited: string[];
  excerpt: string;
  error?: string;
  rate_limited?: boolean;
}

interface QueryResult {
  query: string;
  engines: Record<string, PerEngineResult>;
}

export async function postRun(ctx: PostRunContext): Promise<void> {
  const { brandId, skillId, runId, output, supabase } = ctx;
  const results = (output.results as QueryResult[] | undefined) ?? [];

  for (const r of results) {
    // Resolve the source ai_query node by name for edge creation.
    const { data: queryNode } = await supabase
      .from('knowledge_nodes')
      .select('id')
      .eq('brand_id', brandId)
      .eq('node_type', 'ai_query')
      .eq('name', r.query)
      .maybeSingle();

    for (const [engineId, per] of Object.entries(r.engines)) {
      const nodeName = `${r.query} — ${engineId}`;
      const { data: probeNode } = await supabase
        .from('knowledge_nodes')
        .upsert({
          brand_id: brandId,
          node_type: 'ai_probe_result',
          name: nodeName.slice(0, 255),
          summary: `${engineId}: ${per.cited ? `cited (rank ${per.citation_rank})` : 'not cited'}`,
          properties: {
            engine: engineId,
            query: r.query,
            cited: per.cited,
            citation_rank: per.citation_rank,
            competitors_cited: per.competitors_cited,
            excerpt: per.excerpt,
            error: per.error,
            rate_limited: per.rate_limited ?? false,
          },
          confidence: per.error ? 0.3 : 0.95,
          source_skill: skillId,
          source_run_id: runId,
          is_active: true,
        }, { onConflict: 'brand_id,name' })
        .select('id')
        .single();

      if (probeNode?.id && queryNode?.id) {
        await supabase.from('knowledge_edges').upsert({
          brand_id: brandId,
          source_node_id: probeNode.id,
          target_node_id: queryNode.id,
          edge_type: 'measures',
          weight: 1.0,
        }, { onConflict: 'brand_id,source_node_id,target_node_id,edge_type' });
      }
    }
  }
}
