// src/lib/knowledge/retention.ts
//
// Enforces knowledge node retention rules:
// - mia_decision: max 50 per brand, summarize oldest 25 into digest
// - platform_status: sync from credentials table

import { createServiceClient } from '@/lib/supabase/service'
import { callModel } from '@/lib/model-client'
import { syncPlatformStatus } from '@/lib/knowledge/intelligence'

export async function enforceRetention(brandId: string): Promise<{ digestCreated: boolean; nodesDeleted: number }> {
  const admin = createServiceClient()

  const { count } = await admin
    .from('knowledge_nodes')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_decision')
    .eq('is_active', true)

  if (!count || count < 50) {
    return { digestCreated: false, nodesDeleted: 0 }
  }

  const { data: oldest } = await admin
    .from('knowledge_nodes')
    .select('id, properties, created_at')
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_decision')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(25)

  if (!oldest || oldest.length === 0) {
    return { digestCreated: false, nodesDeleted: 0 }
  }

  const decisions = oldest.map(n => n.properties)
  const month = new Date(oldest[0]!.created_at).toISOString().slice(0, 7)

  let summary: string
  try {
    const summaryResult = await callModel({
      model: 'gemini-2.5-flash',
      provider: 'google',
      systemPrompt: 'Summarize these AI marketing manager decisions into a concise monthly digest. Include: total decisions, auto-runs, blocks, top actions taken, and key patterns. Output plain text, no markdown.',
      userPrompt: JSON.stringify(decisions),
      maxTokens: 512,
    })
    summary = summaryResult.content
  } catch {
    summary = `${oldest.length} decisions processed in ${month}. Digest generation failed.`
  }

  await admin.from('knowledge_nodes').upsert({
    brand_id: brandId,
    node_type: 'mia_digest',
    name: `mia_digest:${month}`,
    summary: summary.slice(0, 500),
    properties: {
      month,
      total_decisions: oldest.length,
      auto_runs: (decisions as Array<{ decision?: string }>).filter(d => d.decision === 'auto_run').length,
      blocks: (decisions as Array<{ decision?: string }>).filter(d => d.decision === 'blocked').length,
      summary,
    },
    is_active: true,
    confidence: 1.0,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'brand_id,name', ignoreDuplicates: false })

  const idsToDelete = oldest.map(n => n.id)
  await admin
    .from('knowledge_nodes')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .in('id', idsToDelete)

  return { digestCreated: true, nodesDeleted: idsToDelete.length }
}

export async function runDailyRetention(): Promise<void> {
  const admin = createServiceClient()
  const { data: brands } = await admin.from('brands').select('id').limit(100)

  for (const brand of brands ?? []) {
    try {
      await syncPlatformStatus(brand.id)
      await enforceRetention(brand.id)
    } catch (err) {
      console.error(`[retention] Failed for brand ${brand.id}:`, err)
    }
  }
}
