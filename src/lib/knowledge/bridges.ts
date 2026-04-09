import { createClient } from '@/lib/supabase/server';
import { embedText } from '@/lib/knowledge/rag';

export async function bridgeTopContent(brandId: string): Promise<number> {
  const supabase = await createClient();
  const { data: topContent } = await supabase
    .from('top_content')
    .select('*')
    .eq('brand_id', brandId);

  if (!topContent?.length) return 0;

  let created = 0;
  for (const item of topContent) {
    let embedding: number[] | null = null;
    try {
      embedding = await embedText(
        `${item.content_type} content: ${item.title || 'Untitled'}. Performance: ${JSON.stringify(item.performance_metrics || {})}`
      );
    } catch { /* continue */ }

    const { error } = await supabase.from('knowledge_nodes').upsert({
      brand_id: brandId,
      node_type: 'top_content',
      name: item.title || `Top ${item.content_type} #${item.rank || created + 1}`,
      summary: `High-performing ${item.content_type} content`,
      properties: {
        content_type: item.content_type,
        content: item.content,
        performance_metrics: item.performance_metrics,
        tags: item.tags,
        rank: item.rank,
      },
      tags: item.tags || [],
      embedding,
      is_active: true,
    }, { onConflict: 'brand_id,name' });

    if (!error) created++;
  }

  return created;
}
