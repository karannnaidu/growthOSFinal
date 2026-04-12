// src/app/api/cron/chain-processor/route.ts

export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { runSkill } from '@/lib/skills-engine'

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  )
}

export async function GET(): Promise<NextResponse> {
  const admin = createServiceClient()

  // Find mia_decision nodes with non-empty pending_chain
  const { data: decisions } = await admin
    .from('knowledge_nodes')
    .select('id, brand_id, properties')
    .eq('node_type', 'mia_decision')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(10)

  if (!decisions || decisions.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  // Filter to those with non-empty pending_chain
  const withChain = decisions.filter(n => {
    const props = n.properties as { pending_chain?: string[] }
    return props.pending_chain && props.pending_chain.length > 0
  })

  if (withChain.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let processed = 0

  for (const node of withChain.slice(0, 5)) {
    const props = node.properties as { pending_chain?: string[]; target_agent?: string; [key: string]: unknown }
    const chain = props.pending_chain ?? []
    if (chain.length === 0) continue

    const nextSkill = chain[0]!
    const remainingChain = chain.slice(1)

    try {
      await runSkill({
        brandId: node.brand_id,
        skillId: nextSkill,
        triggeredBy: 'mia',
        additionalContext: { source: 'chain_processor', parent_decision: node.id },
        chainDepth: 1,
      })

      await admin
        .from('knowledge_nodes')
        .update({
          properties: { ...props, pending_chain: remainingChain },
          updated_at: new Date().toISOString(),
        })
        .eq('id', node.id)

      processed++
    } catch (err) {
      console.error(`[chain-processor] Failed to run ${nextSkill} for brand ${node.brand_id}:`, err)
      await admin
        .from('knowledge_nodes')
        .update({
          properties: { ...props, pending_chain: [], blocked_reason: `Chain failed at ${nextSkill}: ${err instanceof Error ? err.message : String(err)}` },
          updated_at: new Date().toISOString(),
        })
        .eq('id', node.id)
    }
  }

  return NextResponse.json({ processed })
}
