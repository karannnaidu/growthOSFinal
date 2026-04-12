// ---------------------------------------------------------------------------
// Creative Feedback Loop — Plan 3, Task 5
//
// Pulls performance data from ad platforms back into the knowledge graph so
// future creative generation is informed by real results.
//
// Note: Actual Meta/Google API calls are stubs — the MCP client handles those.
// This module queries knowledge nodes with ad IDs, checks for recent snapshots,
// and logs which nodes would be updated.
// ---------------------------------------------------------------------------

import { createServiceClient } from '@/lib/supabase/service';

const SNAPSHOT_FRESHNESS_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Update creative performance for a brand by checking ad platform metrics.
 *
 * 1. Gets all ad_creative / video_asset knowledge nodes that have a
 *    meta_ad_id or google_ad_id in their properties.
 * 2. For each, checks if there is a recent snapshot (within 24h).
 * 3. If no recent snapshot, logs which nodes would be updated (stub).
 * 4. Returns count of updated creatives (0 for now since API calls are stubs).
 */
export async function updateCreativePerformance(brandId: string): Promise<number> {
  const supabase = createServiceClient();

  // 1. Get creative nodes that have ad platform IDs
  const { data: nodes, error } = await supabase
    .from('knowledge_nodes')
    .select('id, name, node_type, properties')
    .eq('brand_id', brandId)
    .eq('is_active', true)
    .in('node_type', ['ad_creative', 'video_asset']);

  if (error) {
    console.warn('[creative-feedback] Failed to query knowledge nodes:', error.message);
    return 0;
  }

  if (!nodes?.length) return 0;

  // Filter to nodes that have an ad platform ID
  const adNodes = nodes.filter((n) => {
    const props = n.properties as Record<string, unknown> | null;
    return props?.meta_ad_id || props?.google_ad_id;
  });

  if (adNodes.length === 0) return 0;

  const now = Date.now();
  let updatedCount = 0;

  for (const node of adNodes) {
    // 2. Check for a recent snapshot
    const { data: recentSnap } = await supabase
      .from('knowledge_snapshots')
      .select('id, snapped_at')
      .eq('node_id', node.id)
      .order('snapped_at', { ascending: false })
      .limit(1)
      .single();

    const snapTime = recentSnap?.snapped_at
      ? new Date(recentSnap.snapped_at).getTime()
      : 0;

    if (now - snapTime < SNAPSHOT_FRESHNESS_MS) {
      // Snapshot is fresh enough, skip
      continue;
    }

    // 3. Stub: log which nodes would be fetched from the platform
    const props = node.properties as Record<string, unknown>;
    if (props.meta_ad_id) {
      console.log(
        `[creative-feedback] Would fetch Meta Ads performance for node "${node.name}" (meta_ad_id: ${props.meta_ad_id})`,
      );
    }
    if (props.google_ad_id) {
      console.log(
        `[creative-feedback] Would fetch Google Ads performance for node "${node.name}" (google_ad_id: ${props.google_ad_id})`,
      );
    }

    // 4. In production, we would create a knowledge_snapshot here with the
    //    fetched metrics. For now this is a stub, so we don't create snapshots
    //    or increment the counter.
    // updatedCount++;
  }

  return updatedCount;
}
