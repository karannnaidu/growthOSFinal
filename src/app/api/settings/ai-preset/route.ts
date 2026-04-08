// ---------------------------------------------------------------------------
// PATCH /api/settings/ai-preset
//
// Request:  { brandId: string, preset: 'autopilot'|'budget'|'quality'|'byok', apiKey?: string }
// Response: { preset: string }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_PRESETS = ['autopilot', 'budget', 'quality', 'byok'] as const
type Preset = (typeof VALID_PRESETS)[number]

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { brandId, preset, apiKey } = body as {
    brandId?: string
    preset?: string
    apiKey?: string
  }

  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
  if (!preset || !(VALID_PRESETS as readonly string[]).includes(preset)) {
    return NextResponse.json(
      { error: `preset must be one of: ${VALID_PRESETS.join(', ')}` },
      { status: 400 },
    )
  }

  // Brand access check
  const { data: brand } = await supabase
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  if (brand.owner_id !== user.id) {
    const { data: membership } = await supabase
      .from('brand_members')
      .select('brand_id, role')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    // Only admins can change AI preset
    if (!membership || (membership.role as string) !== 'admin') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  // Build update
  const updatePayload: Record<string, unknown> = { ai_preset: preset as Preset }

  // Store BYOK key in brand metadata (or dedicated column if it exists)
  if (preset === 'byok' && apiKey) {
    // Store encrypted key reference — for now we store in metadata
    updatePayload.ai_preset_meta = { byok_key_hint: `${apiKey.slice(0, 6)}...` }
  }

  const { error } = await supabase
    .from('brands')
    .update(updatePayload)
    .eq('id', brandId)

  if (error) {
    console.error('[PATCH /api/settings/ai-preset] DB error:', error)
    return NextResponse.json({ error: 'Failed to update AI preset' }, { status: 500 })
  }

  return NextResponse.json({ preset })
}
