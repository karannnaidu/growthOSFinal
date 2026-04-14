// src/app/api/skills/run-stream/route.ts

export const maxDuration = 300

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runSkill, type SkillProgressEvent } from '@/lib/skills-engine'

export async function POST(request: NextRequest): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 })
  }

  const body = await request.json() as { brandId?: string; skillId?: string; additionalContext?: Record<string, unknown> }
  const { brandId, skillId, additionalContext } = body

  if (!brandId || !skillId) {
    return new Response(JSON.stringify({ error: 'brandId and skillId required' }), { status: 400 })
  }

  // Verify brand access
  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id').eq('id', brandId).single()
  if (!brand || brand.owner_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Access denied' }), { status: 403 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch { /* stream may be closed */ }
      }

      const onProgress = (event: SkillProgressEvent) => {
        send('progress', event as unknown as Record<string, unknown>)
      }

      try {
        const result = await runSkill(
          { brandId, skillId, triggeredBy: 'user', additionalContext: { ...additionalContext, source: 'stream' } },
          onProgress,
        )

        send('result', {
          id: result.id,
          status: result.status,
          output: result.output,
          creditsUsed: result.creditsUsed,
          modelUsed: result.modelUsed,
          durationMs: result.durationMs,
          error: result.error,
        })
      } catch (err) {
        send('error', { message: err instanceof Error ? err.message : 'Skill run failed' })
      } finally {
        send('done', { timestamp: new Date().toISOString() })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
