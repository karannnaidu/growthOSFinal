import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { removeBackground } from '@/lib/fal-client'

export const maxDuration = 60

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId: string; productName: string; imageUrl: string }
  try {
    body = await request.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, productName, imageUrl } = body
  if (!brandId || !productName || !imageUrl) {
    return NextResponse.json({ error: 'brandId, productName, and imageUrl required' }, { status: 400 })
  }

  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id').eq('id', brandId).single()
  if (!brand || brand.owner_id !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  try {
    // 1. Remove background via fal.ai
    const transparentFalUrl = await removeBackground(imageUrl, brandId)

    // 2. Download and upload to Supabase Storage
    const imgRes = await fetch(transparentFalUrl)
    if (!imgRes.ok) throw new Error('Failed to download transparent image')
    const buffer = Buffer.from(await imgRes.arrayBuffer())

    const safeName = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const storagePath = `${brandId}/products/${safeName}-transparent.png`

    const { error: uploadErr } = await admin.storage
      .from('generated-assets')
      .upload(storagePath, buffer, { contentType: 'image/png', upsert: true })

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)

    const { data: urlData } = admin.storage.from('generated-assets').getPublicUrl(storagePath)
    const transparentUrl = urlData?.publicUrl ?? ''

    // 3. Update product in brand_guidelines
    const { data: brandRow } = await admin.from('brands')
      .select('brand_guidelines')
      .eq('id', brandId)
      .single()

    if (brandRow?.brand_guidelines) {
      const dna = brandRow.brand_guidelines as Record<string, unknown>
      const products = (dna.products as Array<Record<string, unknown>>) ?? []
      const updated = products.map(p => {
        if (p.name === productName) {
          return { ...p, transparent_image_url: transparentUrl, bg_removed_at: new Date().toISOString(), bg_approved: false }
        }
        return p
      })
      await admin.from('brands').update({ brand_guidelines: { ...dna, products: updated } }).eq('id', brandId)
    }

    // 4. Update knowledge node
    const { data: node } = await admin.from('knowledge_nodes')
      .select('id, properties')
      .eq('brand_id', brandId)
      .eq('node_type', 'product')
      .eq('name', productName)
      .eq('is_active', true)
      .single()

    if (node) {
      await admin.from('knowledge_nodes').update({
        properties: { ...(node.properties as Record<string, unknown>), transparent_image_url: transparentUrl, bg_removed_at: new Date().toISOString(), bg_approved: false },
      }).eq('id', node.id)
    }

    return NextResponse.json({ transparentUrl, storagePath })
  } catch (err) {
    console.error('[remove-bg] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Background removal failed' }, { status: 500 })
  }
}
