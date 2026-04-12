export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { embedText } from '@/lib/knowledge/rag'
import { describeImage } from '@/lib/fal-client'

export async function GET(): Promise<NextResponse> {
  const supabase = createServiceClient()

  let embeddingsBackfilled = 0
  let visionsBackfilled = 0

  // 1. Backfill missing embeddings (any node without an embedding)
  const { data: noEmbedding } = await supabase
    .from('knowledge_nodes')
    .select('id, name, summary, properties, node_type')
    .is('embedding', null)
    .eq('is_active', true)
    .limit(30)

  for (const node of noEmbedding ?? []) {
    try {
      const parts = [
        node.name,
        node.summary || '',
        (node.properties as Record<string, unknown>)?.visual_description as string || '',
        (node.properties as Record<string, unknown>)?.prompt as string || '',
      ].filter(Boolean)
      const embedding = await embedText(parts.join('. '))
      await supabase.from('knowledge_nodes').update({ embedding }).eq('id', node.id)
      embeddingsBackfilled++
    } catch { /* skip */ }
  }

  // 2. Backfill vision descriptions for creative nodes without one
  const { data: noVision } = await supabase
    .from('knowledge_nodes')
    .select('id, properties')
    .in('node_type', ['ad_creative', 'competitor_creative'])
    .eq('is_active', true)
    .limit(10)

  for (const node of noVision ?? []) {
    const props = node.properties as Record<string, unknown>
    // Skip if already has visual_description
    if (props?.visual_description) continue

    const imageUrl = (props?.media_url as string) || (props?.thumbnail_url as string)
    if (!imageUrl) continue

    try {
      const description = await describeImage(imageUrl)
      if (description) {
        const updatedProps = { ...props, visual_description: description }
        // Re-embed with richer text
        const text = [
          props?.prompt as string || '',
          description,
          props?.copy_headline as string || '',
        ].filter(Boolean).join('. ')
        const embedding = await embedText(text)

        await supabase
          .from('knowledge_nodes')
          .update({ properties: updatedProps, embedding })
          .eq('id', node.id)
        visionsBackfilled++
      }
    } catch { /* skip */ }
  }

  return NextResponse.json({
    embeddings: embeddingsBackfilled,
    visions: visionsBackfilled,
    total: embeddingsBackfilled + visionsBackfilled,
  })
}
