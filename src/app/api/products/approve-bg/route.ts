import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId: string; productName: string; approved: boolean }
  try {
    body = await request.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, productName, approved } = body
  if (!brandId || !productName || approved === undefined) {
    return NextResponse.json({ error: 'brandId, productName, and approved required' }, { status: 400 })
  }

  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id, brand_guidelines').eq('id', brandId).single()
  if (!brand || brand.owner_id !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const dna = brand.brand_guidelines as Record<string, unknown>
  const products = (dna?.products as Array<Record<string, unknown>>) ?? []
  const updated = products.map(p => {
    if (p.name === productName) {
      if (approved) {
        return { ...p, bg_approved: true }
      } else {
        const copy = { ...p }
        delete copy.transparent_image_url
        delete copy.bg_removed_at
        delete copy.bg_approved
        return copy
      }
    }
    return p
  })

  await admin.from('brands').update({ brand_guidelines: { ...dna, products: updated } }).eq('id', brandId)

  // Update knowledge node
  const { data: node } = await admin.from('knowledge_nodes')
    .select('id, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'product')
    .eq('name', productName)
    .eq('is_active', true)
    .single()

  if (node) {
    const nodeProps = node.properties as Record<string, unknown>
    if (approved) {
      await admin.from('knowledge_nodes').update({
        properties: { ...nodeProps, bg_approved: true },
      }).eq('id', node.id)
    } else {
      const copy = { ...nodeProps }
      delete copy.transparent_image_url
      delete copy.bg_removed_at
      delete copy.bg_approved
      await admin.from('knowledge_nodes').update({ properties: copy }).eq('id', node.id)
    }
  }

  return NextResponse.json({ success: true })
}
