// src/app/api/cron/chain-processor/route.ts
//
// Runs every 5 minutes (vercel.json). Picks up mia_decision nodes with
// non-empty pending_chain and executes all queued skills sequentially.

export const maxDuration = 300 // 5 min — enough to run a full chain

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

  let totalProcessed = 0

  for (const node of withChain.slice(0, 3)) {
    const props = node.properties as { pending_chain?: string[]; target_agent?: string; [key: string]: unknown }
    const chain = [...(props.pending_chain ?? [])]
    if (chain.length === 0) continue

    const completed: string[] = []
    const failed: string[] = []

    // Run ALL skills in the chain sequentially
    while (chain.length > 0) {
      const nextSkill = chain.shift()!

      try {
        await runSkill({
          brandId: node.brand_id,
          skillId: nextSkill,
          triggeredBy: 'mia',
          additionalContext: { source: 'chain_processor', parent_decision: node.id },
          chainDepth: 1,
        })
        completed.push(nextSkill)
        totalProcessed++
      } catch (err) {
        console.error(`[chain-processor] Failed to run ${nextSkill} for brand ${node.brand_id}:`, err)
        failed.push(nextSkill)
        // Continue with remaining skills — don't let one failure stop the chain
      }

      // Update pending_chain after each skill so progress is saved
      await admin
        .from('knowledge_nodes')
        .update({
          properties: { ...props, pending_chain: [...chain], completed_skills: completed, failed_skills: failed },
          updated_at: new Date().toISOString(),
        })
        .eq('id', node.id)
    }

    // Mark decision as fully processed
    await admin
      .from('knowledge_nodes')
      .update({
        properties: { ...props, pending_chain: [], completed_skills: completed, failed_skills: failed },
        is_active: false, // Done — won't be picked up again
        updated_at: new Date().toISOString(),
      })
      .eq('id', node.id)
  }

  return NextResponse.json({ processed: totalProcessed })
}
