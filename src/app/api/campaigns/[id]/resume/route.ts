import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { loadMetaCredential, updateMetaCampaign } from '@/lib/meta-ads'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = createServiceClient()
  const { data: campaign } = await admin.from('campaigns').select('*').eq('id', id).single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (!campaign.meta_campaign_id) return NextResponse.json({ error: 'No Meta campaign ID' }, { status: 400 })

  try {
    const credential = await loadMetaCredential(campaign.brand_id)
    await updateMetaCampaign(credential, campaign.meta_campaign_id, { status: 'ACTIVE' })
    await admin.from('campaigns').update({
      status: 'active', paused_at: null, updated_at: new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Resume failed' }, { status: 500 })
  }
}
