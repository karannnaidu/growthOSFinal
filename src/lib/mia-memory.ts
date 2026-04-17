// ---------------------------------------------------------------------------
// Mia Memory — durable cross-session facts stored as mia_memory nodes.
//
// - extractMemories(): called async after each assistant turn; runs cheap
//   model extractor, upserts nodes.
// - getRelevantMemories(): called synchronously when building the chat
//   prompt; returns top-N recent memories for injection.
// - listMemories(): for the settings panel.
// - deleteMemory(): for the settings panel.
// ---------------------------------------------------------------------------

import { createServiceClient } from '@/lib/supabase/service'
import { callModel } from '@/lib/model-client'

export type MemoryKind = 'preference' | 'decision' | 'context_fact' | 'avoid'

export interface MiaMemory {
  id: string
  kind: MemoryKind
  content: string
  confidence: number
  created_at: string
  source_message_id: string | null
}

interface RawMemoryNode {
  id: string
  name: string
  properties: {
    kind?: string
    content?: string
    confidence?: number
    source_message_id?: string
  } | null
  created_at: string
}

const MEMORY_MODEL = 'claude-haiku-4-5-20251001'
const MEMORY_PROVIDER = 'anthropic'
const MAX_MEMORIES_PER_BRAND = 50
const CONFIDENCE_FLOOR = 0.7

const EXTRACTOR_SYSTEM_PROMPT = `You extract durable facts a marketing AI assistant should remember about a brand across sessions.

Output JSON only, no markdown. Shape:
{ "memories": [ { "kind": "preference" | "decision" | "context_fact" | "avoid", "content": "<=200 chars", "confidence": 0.0-1.0 } ] }

Rules:
- "preference" = how the user wants to work (e.g. "prefers terse replies", "hates emojis").
- "decision" = a standing choice about the business (e.g. "Q2 focus is retention, not acquisition").
- "context_fact" = a stable fact about the brand/user (e.g. "primary product is Green Mantra").
- "avoid" = things NOT to do (e.g. "do not re-run health-check more than monthly").
- Skip ephemeral content, pleasantries, single-turn questions, anything already obvious from Brand DNA.
- If nothing durable is in the turn, return { "memories": [] }.
- Confidence: 1.0 = user said it explicitly; 0.7 = clearly implied; skip anything below 0.7.`

function stripJsonFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

export async function extractMemories(args: {
  brandId: string
  userMessage: string
  assistantMessage: string
  sourceMessageId?: string | null
}): Promise<{ created: number }> {
  const { brandId, userMessage, assistantMessage, sourceMessageId } = args

  const userPrompt = `## User turn\n${userMessage}\n\n## Assistant reply\n${assistantMessage}`

  let raw: string
  try {
    const result = await callModel({
      model: MEMORY_MODEL,
      provider: MEMORY_PROVIDER,
      systemPrompt: EXTRACTOR_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 384,
      temperature: 0.1,
    })
    raw = result.content
  } catch (err) {
    console.warn('[mia-memory] extractor LLM call failed:', err)
    return { created: 0 }
  }

  type ExtractorOut = { memories?: Array<{ kind?: string; content?: string; confidence?: number }> }
  let parsed: ExtractorOut
  try { parsed = JSON.parse(stripJsonFences(raw)) as ExtractorOut } catch {
    console.warn('[mia-memory] extractor returned unparseable JSON')
    return { created: 0 }
  }

  const VALID_KINDS: MemoryKind[] = ['preference', 'decision', 'context_fact', 'avoid']
  const candidates = (parsed.memories ?? [])
    .filter((m): m is { kind: MemoryKind; content: string; confidence: number } =>
      !!m &&
      typeof m.kind === 'string' && VALID_KINDS.includes(m.kind as MemoryKind) &&
      typeof m.content === 'string' && m.content.trim().length > 0 &&
      typeof m.confidence === 'number' && m.confidence >= CONFIDENCE_FLOOR,
    )
    .map((m) => ({ kind: m.kind, content: m.content.slice(0, 280), confidence: Math.min(1, Math.max(0, m.confidence)) }))

  if (candidates.length === 0) return { created: 0 }

  const admin = createServiceClient()

  // Dedupe: skip inserting if same (kind, content) already exists for this brand
  const { data: existing } = await admin
    .from('knowledge_nodes')
    .select('name, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_memory')

  const existingSet = new Set(
    ((existing ?? []) as Array<{ name: string; properties: { kind?: string; content?: string } | null }>)
      .map((r) => `${r.properties?.kind ?? ''}::${(r.properties?.content ?? '').toLowerCase()}`),
  )

  let created = 0
  for (const c of candidates) {
    const dedupeKey = `${c.kind}::${c.content.toLowerCase()}`
    if (existingSet.has(dedupeKey)) continue
    const { error } = await admin.from('knowledge_nodes').insert({
      brand_id: brandId,
      node_type: 'mia_memory',
      name: c.content.slice(0, 255),
      summary: c.content,
      properties: {
        kind: c.kind,
        content: c.content,
        confidence: c.confidence,
        source_message_id: sourceMessageId ?? null,
      },
    })
    if (!error) created++
  }

  // Enforce the 50-memory cap: delete oldest overflow
  const { data: all } = await admin
    .from('knowledge_nodes')
    .select('id, created_at, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_memory')
    .order('created_at', { ascending: false })

  if (all && all.length > MAX_MEMORIES_PER_BRAND) {
    const overflow = all.slice(MAX_MEMORIES_PER_BRAND)
    const ids = overflow.map((r) => (r as { id: string }).id)
    if (ids.length > 0) {
      await admin.from('knowledge_nodes').delete().in('id', ids)
    }
  }

  return { created }
}

export async function getRelevantMemories(brandId: string, limit = 20): Promise<MiaMemory[]> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('id, name, properties, created_at')
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_memory')
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as RawMemoryNode[]).map((r) => ({
    id: r.id,
    kind: (r.properties?.kind as MemoryKind) ?? 'context_fact',
    content: r.properties?.content ?? r.name,
    confidence: r.properties?.confidence ?? 0.7,
    created_at: r.created_at,
    source_message_id: r.properties?.source_message_id ?? null,
  }))
}

export async function listMemories(brandId: string): Promise<MiaMemory[]> {
  return getRelevantMemories(brandId, MAX_MEMORIES_PER_BRAND)
}

export async function deleteMemory(brandId: string, memoryId: string): Promise<boolean> {
  const admin = createServiceClient()
  const { error } = await admin
    .from('knowledge_nodes')
    .delete()
    .eq('id', memoryId)
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_memory')
  return !error
}
