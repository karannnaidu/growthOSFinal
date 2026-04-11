import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { extractBrandDna, type ExtractionProgress } from '@/lib/brand-extractor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/onboarding/extract-brand
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Auth check
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // 2. Parse body
  let body: { brandId?: string; domain?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, domain } = body

  if (!brandId || typeof brandId !== 'string') {
    return Response.json({ error: 'brandId is required' }, { status: 400 })
  }
  if (!domain || typeof domain !== 'string') {
    return Response.json({ error: 'domain is required' }, { status: 400 })
  }

  // 3. Verify brand ownership via admin client (bypasses RLS)
  const admin = createServiceClient()
  const { data: brand, error: brandError } = await admin
    .from('brands')
    .select('id, name, owner_id')
    .eq('id', brandId)
    .single()

  if (brandError || !brand) {
    return Response.json({ error: 'Brand not found' }, { status: 404 })
  }

  if (brand.owner_id !== user.id) {
    return Response.json({ error: 'Access denied' }, { status: 403 })
  }

  // 4. Create SSE stream
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        )
      }

      const onProgress = (progress: ExtractionProgress) => {
        send('progress', progress as unknown as Record<string, unknown>)
      }

      try {
        const result = await extractBrandDna(brandId, domain, brand.name, onProgress)

        send('complete', {
          brandDna: result.brandDna,
          pagesScraped: result.pagesScraped,
          reExtracted: result.reExtracted,
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Extraction failed'
        send('error', { message })
      } finally {
        controller.close()
      }
    },
  })

  // 5. Return SSE response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
