import type { PostRunContext } from '@/lib/post-run';

interface EntityProfile {
  canonical_name?: string;
  category?: string;
  subcategory?: string;
  value_props?: string[];
  differentiators?: string[];
  target_customer?: string;
  competitors?: string[];
}

interface CandidateQuery {
  query: string;
  intent?: 'discovery' | 'comparison' | 'problem' | 'brand_named';
  priority?: 'high' | 'med' | 'low';
}

export async function postRun(ctx: PostRunContext): Promise<void> {
  const { brandId, skillId, runId, output, supabase } = ctx;
  const profile = (output.entity_profile as EntityProfile | undefined) ?? {};
  const queries = (output.candidate_queries as CandidateQuery[] | undefined) ?? [];

  // 1. Upsert brand_dna node. One per brand.
  const brandDnaName = `${profile.canonical_name ?? 'Brand'} — entity profile`;
  const { data: dnaNode, error: dnaErr } = await supabase
    .from('knowledge_nodes')
    .upsert({
      brand_id: brandId,
      node_type: 'brand_dna',
      name: brandDnaName,
      summary: `${profile.category ?? ''} — ${profile.target_customer ?? ''}`.slice(0, 500),
      properties: profile as Record<string, unknown>,
      confidence: 0.9,
      source_skill: skillId,
      source_run_id: runId,
      is_active: true,
    }, { onConflict: 'brand_id,name' })
    .select('id')
    .single();

  if (dnaErr) {
    console.warn('[brand-dna-extractor.postRun] brand_dna upsert failed:', dnaErr.message);
    return;
  }

  // 2. Upsert each ai_query node; edge back to brand_dna.
  for (const q of queries.slice(0, 50)) {
    if (!q.query) continue;
    const { data: qNode } = await supabase
      .from('knowledge_nodes')
      .upsert({
        brand_id: brandId,
        node_type: 'ai_query',
        name: q.query.slice(0, 255),
        summary: `${q.intent ?? 'discovery'} · ${q.priority ?? 'med'}`,
        properties: { intent: q.intent ?? 'discovery', priority: q.priority ?? 'med' },
        confidence: 0.85,
        source_skill: skillId,
        source_run_id: runId,
        is_active: true,
      }, { onConflict: 'brand_id,name' })
      .select('id')
      .single();

    if (qNode?.id && dnaNode?.id) {
      await supabase.from('knowledge_edges').upsert({
        brand_id: brandId,
        source_node_id: qNode.id,
        target_node_id: dnaNode.id,
        edge_type: 'derived_from',
        weight: 1.0,
      }, { onConflict: 'brand_id,source_node_id,target_node_id,edge_type' });
    }
  }
}
