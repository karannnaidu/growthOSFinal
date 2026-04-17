import type { PostRunContext } from '@/lib/post-run';

interface CompetitorAd {
  id: string;
  page_name: string;
  ad_creative_body: string | null;
  media_type: string;
  thumbnail_url: string | null;
  ad_snapshot_url: string | null;
  estimated_days_active: number;
  ad_creative_link_title: string | null;
}

export async function persistCompetitorCreatives(ctx: PostRunContext, sourceSkillId: string): Promise<void> {
  const { brandId, runId, liveData, supabase } = ctx;
  const competitorAds = (liveData.competitor as { ads?: Array<{ competitor: string; ads: CompetitorAd[] }> } | undefined)?.ads;
  if (!competitorAds) return;

  for (const group of competitorAds) {
    for (const ad of (group.ads ?? []).slice(0, 25)) {
      await supabase.from('knowledge_nodes').upsert({
        brand_id: brandId,
        node_type: 'competitor_creative',
        name: `${group.competitor}: ${ad.ad_creative_link_title || ad.id}`,
        summary: ad.ad_creative_body?.slice(0, 300) ?? null,
        properties: {
          competitor_name: group.competitor,
          ad_id: ad.id,
          ad_creative_body: ad.ad_creative_body,
          ad_creative_link_title: ad.ad_creative_link_title,
          media_type: ad.media_type,
          thumbnail_url: ad.thumbnail_url,
          ad_snapshot_url: ad.ad_snapshot_url,
          estimated_days_active: ad.estimated_days_active,
          format: ad.media_type === 'video' ? 'video'
            : ad.media_type === 'image' ? 'static_image'
            : 'unknown',
          messaging_approach: 'unknown',
          estimated_performance: ad.estimated_days_active >= 14 ? 'high'
            : ad.estimated_days_active >= 7 ? 'medium'
            : 'low',
        },
        source_skill: sourceSkillId,
        source_run_id: runId,
        confidence: ad.estimated_days_active >= 14 ? 0.9 : 0.7,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'brand_id,name', ignoreDuplicates: false });
    }
  }
}
