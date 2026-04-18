// ---------------------------------------------------------------------------
// POST /api/media/upload
//
// Multipart upload to Supabase Storage.
// FormData fields: file (File), brandId (string), bucket (string)
//   bucket must be one of: brand-assets | generated-assets | competitor-assets
//
// Response: { path, bucket, publicUrl }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const ALLOWED_BUCKETS = ['brand-assets', 'generated-assets', 'competitor-assets'] as const
type Bucket = (typeof ALLOWED_BUCKETS)[number]

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  // Font files (brand custom fonts)
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
  'application/font-woff',
  'application/font-woff2',
  'application/x-font-ttf',
  'application/x-font-otf',
]

const FONT_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf']

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Parse multipart form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const brandId = formData.get('brandId') as string | null
  const bucket = formData.get('bucket') as string | null

  if (!file || !brandId || !bucket) {
    return NextResponse.json({ error: 'file, brandId, and bucket are required' }, { status: 400 })
  }

  if (!ALLOWED_BUCKETS.includes(bucket as Bucket)) {
    return NextResponse.json(
      { error: `bucket must be one of: ${ALLOWED_BUCKETS.join(', ')}` },
      { status: 400 },
    )
  }

  // Validate file type. Browsers sometimes send `application/octet-stream`
  // for font files — accept that only when the filename ends in a known font
  // extension, so we don't silently allow arbitrary binaries.
  const hasFontExtension = FONT_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))
  const isAllowedMime = ALLOWED_MIME_TYPES.includes(file.type)
  const isOctetFontFallback = file.type === 'application/octet-stream' && hasFontExtension
  if (!isAllowedMime && !isOctetFontFallback) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File size exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB limit` },
      { status: 400 },
    )
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

  // Build storage path: {brand_id}/{sub_category}/{timestamp}-{filename}
  const subCategory = bucket.replace('-assets', '')
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${brandId}/${subCategory}/${Date.now()}-${safeFilename}`

  // Upload to Supabase Storage
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    console.error('[POST /api/media/upload] Upload error:', uploadError)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath)

  return NextResponse.json(
    { path: storagePath, bucket, publicUrl: urlData?.publicUrl ?? null },
    { status: 201 },
  )
}
