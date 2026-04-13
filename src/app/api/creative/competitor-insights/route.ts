// src/app/api/creative/competitor-insights/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const admin = createServiceClient()

  const { data: creatives } = await admin
    .from('knowledge_nodes')
    .select('id, name, summary, properties, confidence, created_at')
    .eq('brand_id', brandId)
    .eq('node_type', 'competitor_creative')
    .eq('is_active', true)
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50)

  const items = (creatives ?? []).map(c => {
    const props = c.properties as Record<string, unknown>
    return {
      id: c.id,
      name: c.name,
      competitorName: props.competitor_name as string ?? c.name,
      thumbnailUrl: (props.stored_thumbnail_url as string) ?? (props.thumbnail_url as string) ?? null,
      videoUrl: (props.stored_video_url as string) ?? (props.video_url as string) ?? null,
      ctaText: props.cta_text as string ?? null,
      linkUrl: props.link_url as string ?? null,
      visualDescription: props.visual_description as string ?? c.summary,
      format: props.format as string ?? 'unknown',
      messagingApproach: props.messaging_approach as string ?? 'unknown',
      visualStyle: props.visual_style as string ?? 'unknown',
      estimatedPerformance: props.estimated_performance as string ?? 'unknown',
      daysActive: props.estimated_days_active as number ?? 0,
      keyElements: props.key_elements as string[] ?? [],
      adBody: props.ad_creative_body as string ?? null,
      adSnapshotUrl: props.ad_snapshot_url as string ?? null,
      isInspiration: c.confidence >= 0.95,
      createdAt: c.created_at,
    }
  })

  const formatCounts: Record<string, number> = {}
  const messagingCounts: Record<string, number> = {}
  for (const item of items) {
    formatCounts[item.format] = (formatCounts[item.format] ?? 0) + 1
    messagingCounts[item.messagingApproach] = (messagingCounts[item.messagingApproach] ?? 0) + 1
  }
  const topPerformers = items.filter(i => i.estimatedPerformance === 'high').slice(0, 10)
  const newExperiments = items.filter(i => i.daysActive < 7).slice(0, 5)

  return NextResponse.json({
    items,
    topPerformers,
    newExperiments,
    trends: { formatCounts, messagingCounts },
    total: items.length,
  })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId: string; creativeId: string; inspire: boolean }
  try { body = await request.json() as typeof body } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { brandId, creativeId, inspire } = body
  if (!brandId || !creativeId) return NextResponse.json({ error: 'brandId and creativeId required' }, { status: 400 })

  const admin = createServiceClient()
  await admin.from('knowledge_nodes')
    .update({ confidence: inspire ? 0.95 : 0.7, updated_at: new Date().toISOString() })
    .eq('id', creativeId)
    .eq('brand_id', brandId)

  return NextResponse.json({ success: true })
}
