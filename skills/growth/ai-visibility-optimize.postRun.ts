import type { PostRunContext } from '@/lib/post-run';

interface Artifact {
  type: 'json_ld_organization' | 'json_ld_product' | 'json_ld_faqpage' | 'llms_txt' | 'faq_markdown';
  content: unknown;
  question?: string;
  product_ref?: string;
}

export async function postRun(ctx: PostRunContext): Promise<void> {
  const { brandId, skillId, runId, output, supabase } = ctx;
  const artifacts = (output.artifacts as Artifact[] | undefined) ?? [];

  for (const a of artifacts) {
    // Unique key: (brand_id, type, question OR product_ref OR 'default').
    const discriminator = a.question ?? a.product_ref ?? 'default';
    const name = `${a.type} · ${discriminator}`.slice(0, 255);
    await supabase.from('knowledge_nodes').upsert({
      brand_id: brandId,
      node_type: 'ai_artifact',
      name,
      summary: typeof a.content === 'string'
        ? (a.content as string).slice(0, 500)
        : a.type,
      properties: {
        type: a.type,
        content: a.content,
        status: 'draft',
        question: a.question,
        product_ref: a.product_ref,
      },
      confidence: 0.9,
      source_skill: skillId,
      source_run_id: runId,
      is_active: true,
    }, { onConflict: 'brand_id,name' });
  }
}
