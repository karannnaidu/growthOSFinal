// Daily digest composer — turns the accumulating mia_digests row into a
// single chat post, once per brand per day. Always posts (even on quiet
// days) so the user sees continuity: "Nothing fired today — watching X, Y, Z".
//
// Called from /api/cron/mia-digest (Phase 9) once per brand local morning.

import { createServiceClient } from './supabase/service'
import type { DigestLineDraft } from './mia-wake'

type Client = ReturnType<typeof createServiceClient>

type SectionKind = DigestLineDraft['kind']

const SECTION_ORDER: SectionKind[] = ['win', 'risk', 'ask', 'action', 'info']
const SECTION_TITLES: Record<SectionKind, string> = {
  win: '**Wins**',
  risk: '**Risks**',
  ask: '**Needs your input**',
  action: '**Actions taken**',
  info: '**For your awareness**',
}

export interface DigestRow {
  id: string
  brand_id: string
  digest_date: string
  status: 'accumulating' | 'posted' | 'skipped'
  sections: Partial<Record<SectionKind, DigestLineDraft[]>>
  posted_at: string | null
  channels_posted: string[] | null
  source_decision_ids: string[]
}

/**
 * Pure formatter — given sections + a "watching" summary, build the chat
 * body. Exported for CI fixtures.
 */
export function formatDigestBody(
  sections: DigestRow['sections'],
  watching: { openWatches: number; openRequests: number },
  brandName: string,
  digestDate: string,
): string {
  const lines: string[] = []
  lines.push(`# ${brandName} — daily digest for ${digestDate}`)

  const hasAny = SECTION_ORDER.some(k => (sections[k]?.length ?? 0) > 0)
  if (!hasAny) {
    lines.push('')
    lines.push('Nothing loud today.')
    lines.push('')
    if (watching.openWatches > 0 || watching.openRequests > 0) {
      lines.push(`I'm keeping an eye on ${watching.openWatches} signal(s) and ${watching.openRequests} open ask(s). You\'ll hear from me the moment something moves.`)
    } else {
      lines.push("I'm idle right now. If you want me to focus on something specific, just say the word.")
    }
    return lines.join('\n')
  }

  for (const kind of SECTION_ORDER) {
    const entries = sections[kind] ?? []
    if (!entries.length) continue
    lines.push('')
    lines.push(SECTION_TITLES[kind])
    for (const entry of entries) {
      lines.push(`- ${entry.text}`)
    }
  }

  lines.push('')
  lines.push(`_Watching ${watching.openWatches} signal(s) · ${watching.openRequests} open ask(s)._`)
  return lines.join('\n')
}

/**
 * Compose + post today's digest for a brand. Idempotent: if already posted,
 * returns the existing row without reposting.
 */
export async function composeDigest(
  brandId: string,
  digestDate: string,
  client?: Client,
): Promise<{ posted: boolean; reason: string; messageId?: string; digestId?: string }> {
  const c = client ?? createServiceClient()

  const { data: brand } = await c.from('brands').select('name').eq('id', brandId).maybeSingle()
  const brandName = (brand?.name as string) ?? 'your brand'

  const { data: digestRow } = await c
    .from('mia_digests')
    .select('id, digest_date, status, sections, source_decision_ids')
    .eq('brand_id', brandId)
    .eq('digest_date', digestDate)
    .maybeSingle()

  // No digest row means no decisions touched today's date — synthesise an
  // empty one so we still post the "quiet today" line.
  let rowId = digestRow?.id as string | undefined
  let sections: DigestRow['sections'] = (digestRow?.sections ?? {}) as DigestRow['sections']
  if (!rowId) {
    const { data: inserted } = await c
      .from('mia_digests')
      .insert({ brand_id: brandId, digest_date: digestDate, status: 'accumulating', sections: {} })
      .select('id')
      .single()
    rowId = inserted?.id as string
    sections = {}
  } else if (digestRow?.status === 'posted') {
    return { posted: false, reason: 'already posted', digestId: rowId }
  }

  // Watching counts for the tail line.
  const [{ count: openWatches }, { count: openRequests }] = await Promise.all([
    c.from('watches').select('id', { count: 'exact', head: true }).eq('brand_id', brandId).eq('status', 'open'),
    c.from('mia_requests').select('id', { count: 'exact', head: true }).eq('brand_id', brandId).eq('status', 'open'),
  ])

  const body = formatDigestBody(sections, { openWatches: openWatches ?? 0, openRequests: openRequests ?? 0 }, brandName, digestDate)

  // Post to the brand's most recent conversation (or create one if none).
  const { data: conv } = await c
    .from('conversations')
    .select('id')
    .eq('brand_id', brandId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let conversationId = conv?.id as string | undefined
  if (!conversationId) {
    const { data: newConv } = await c
      .from('conversations')
      .insert({ brand_id: brandId, agent: 'mia', title: `Daily digest ${digestDate}` })
      .select('id')
      .single()
    conversationId = newConv?.id as string
  }

  const { data: msg } = await c
    .from('conversation_messages')
    .insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: body,
      author_kind: 'mia_digest',
    })
    .select('id')
    .maybeSingle()

  await c
    .from('mia_digests')
    .update({
      status: 'posted',
      posted_at: new Date().toISOString(),
      channels_posted: ['chat'],
    })
    .eq('id', rowId!)

  return { posted: true, reason: 'posted', messageId: msg?.id as string, digestId: rowId }
}
