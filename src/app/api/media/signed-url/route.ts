// ---------------------------------------------------------------------------
// GET /api/media/signed-url?brandId=xxx&path=xxx&bucket=xxx
//
// Generates a 1-hour signed URL from Supabase Storage for a given path.
// Auth: user must have access to the brand.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const ALLOWED_BUCKETS = ['brand-assets', 'generated-assets', 'competitor-assets'] as const
type Bucket = (typeof ALLOWED_BUCKETS)[number]

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 // 1 hour

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const brandId = searchParams.get('brandId')
  const path = searchParams.get('path')
  const bucket = searchParams.get('bucket')

  if (!brandId || !path || !bucket) {
    return NextResponse.json({ error: 'brandId, path, and bucket are required' }, { status: 400 })
  }

  if (!ALLOWED_BUCKETS.includes(bucket as Bucket)) {
    return NextResponse.json(
      { error: `bucket must be one of: ${ALLOWED_BUCKETS.join(', ')}` },
      { status: 400 },
    )
  }

  // Verify that the path belongs to this brand (path must start with brandId/)
  if (!path.startsWith(`${brandId}/`)) {
    return NextResponse.json({ error: 'Path does not belong to the specified brand' }, { status: 403 })
  }

  // Verify brand access
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  if (brand.owner_id !== user.id) {
    const { data: membership } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  // Generate signed URL
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS)

  if (error || !data?.signedUrl) {
    console.error('[GET /api/media/signed-url] Signed URL error:', error)
    return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl, expiresIn: SIGNED_URL_EXPIRY_SECONDS })
}
