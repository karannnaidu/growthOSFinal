// src/lib/knowledge/intelligence.ts
//
// Typed helpers for intelligence knowledge nodes.
// All queries use direct indexed lookups on (brand_id, node_type) or (brand_id, name).
// No semantic RAG search — keeps pre-flight checks under 50ms.

import { createServiceClient } from '@/lib/supabase/service'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MiaDecision {
  decision: 'auto_run' | 'blocked' | 'needs_review' | 'skip'
  reasoning: string
  follow_up_skills: string[]
  pending_chain: string[]
  blocked_reason?: string
  skill_run_id?: string
  target_agent?: string
}

export interface Instruction {
  text: string
  target_agent: string
  acknowledged: boolean
}

export interface BrandDataEntry {
  source: 'manual' | 'upload' | 'chat'
  data_type: string
  data: Record<string, unknown>
}

export interface PlatformStatus {
  shopify: boolean
  meta: boolean
  ga4: boolean
  gsc: boolean
  klaviyo: boolean
  updated_at: string
}

export interface AgentSetupState {
  state: 'inactive' | 'collecting' | 'ready'
  requirements_met: string[]
  requirements_pending: string[]
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export async function getPlatformStatus(brandId: string): Promise<PlatformStatus | null> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'platform_status')
    .eq('is_active', true)
    .limit(1)
    .single()
  return (data?.properties as PlatformStatus) ?? null
}

export async function getInstruction(brandId: string, agentId: string): Promise<Instruction | null> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'instruction')
    .eq('name', `instruction:${agentId}`)
    .eq('is_active', true)
    .limit(1)
    .single()
  return (data?.properties as Instruction) ?? null
}

export async function getAgentSetup(brandId: string, agentId: string): Promise<AgentSetupState | null> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'agent_setup')
    .eq('name', `agent_setup:${agentId}`)
    .eq('is_active', true)
    .limit(1)
    .single()
  return (data?.properties as AgentSetupState) ?? null
}

export async function getBrandData(brandId: string, dataType: string): Promise<BrandDataEntry | null> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'brand_data')
    .eq('name', `brand_data:${dataType}`)
    .eq('is_active', true)
    .limit(1)
    .single()
  return (data?.properties as BrandDataEntry) ?? null
}

export async function getRecentMiaDecisions(brandId: string, limit: number = 20): Promise<Array<MiaDecision & { id: string; created_at: string }>> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('id, properties, created_at')
    .eq('brand_id', brandId)
    .eq('node_type', 'mia_decision')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map(n => ({ ...(n.properties as MiaDecision), id: n.id, created_at: n.created_at }))
}

export async function getAllAgentSetups(brandId: string): Promise<Record<string, AgentSetupState>> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('name, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'agent_setup')
    .eq('is_active', true)
  const result: Record<string, AgentSetupState> = {}
  for (const n of data ?? []) {
    const agentId = n.name.replace('agent_setup:', '')
    result[agentId] = n.properties as AgentSetupState
  }
  return result
}

export async function getAllInstructions(brandId: string): Promise<Record<string, Instruction>> {
  const admin = createServiceClient()
  const { data } = await admin
    .from('knowledge_nodes')
    .select('name, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'instruction')
    .eq('is_active', true)
  const result: Record<string, Instruction> = {}
  for (const n of data ?? []) {
    const agentId = n.name.replace('instruction:', '')
    result[agentId] = n.properties as Instruction
  }
  return result
}

// ---------------------------------------------------------------------------
// Write helpers — use select+insert/update instead of upsert (no unique index)
// ---------------------------------------------------------------------------

async function safeUpsertNode(
  brandId: string,
  nodeType: string,
  name: string,
  fields: { summary: string; properties: Record<string, unknown>; confidence?: number },
): Promise<void> {
  const admin = createServiceClient()

  // Check if node exists
  const { data: existing } = await admin
    .from('knowledge_nodes')
    .select('id')
    .eq('brand_id', brandId)
    .eq('name', name)
    .eq('is_active', true)
    .limit(1)
    .single()

  if (existing) {
    // Update
    await admin.from('knowledge_nodes').update({
      summary: fields.summary,
      properties: fields.properties,
      confidence: fields.confidence ?? 1.0,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id)
  } else {
    // Insert
    await admin.from('knowledge_nodes').insert({
      brand_id: brandId,
      node_type: nodeType,
      name,
      summary: fields.summary,
      properties: fields.properties,
      is_active: true,
      confidence: fields.confidence ?? 1.0,
    })
  }
}

export async function upsertPlatformStatus(brandId: string, status: PlatformStatus): Promise<void> {
  const connected = Object.entries(status)
    .filter(([k, v]) => k !== 'updated_at' && v === true)
    .map(([k]) => k)
  await safeUpsertNode(brandId, 'platform_status', 'platform_status', {
    summary: `Connected: ${connected.join(', ') || 'none'}`,
    properties: { ...status, updated_at: new Date().toISOString() },
  })
}

export async function upsertInstruction(brandId: string, agentId: string, text: string): Promise<void> {
  await safeUpsertNode(brandId, 'instruction', `instruction:${agentId}`, {
    summary: text.slice(0, 200),
    properties: { text, target_agent: agentId, acknowledged: false },
  })
}

export async function upsertAgentSetup(brandId: string, agentId: string, state: AgentSetupState): Promise<void> {
  await safeUpsertNode(brandId, 'agent_setup', `agent_setup:${agentId}`, {
    summary: `${agentId}: ${state.state} (${state.requirements_met.length} met, ${state.requirements_pending.length} pending)`,
    properties: { ...state } as Record<string, unknown>,
  })
}

export async function upsertBrandData(brandId: string, dataType: string, data: Record<string, unknown>, source: 'manual' | 'upload' | 'chat' = 'manual'): Promise<void> {
  await safeUpsertNode(brandId, 'brand_data', `brand_data:${dataType}`, {
    summary: `${dataType} (${source})`,
    properties: { source, data_type: dataType, data },
  })
}

export async function createMiaDecision(brandId: string, decision: MiaDecision): Promise<string> {
  const admin = createServiceClient()
  const { data } = await admin.from('knowledge_nodes').insert({
    brand_id: brandId,
    node_type: 'mia_decision',
    name: `mia_decision:${Date.now()}`,
    summary: `${decision.decision}: ${decision.reasoning.slice(0, 200)}`,
    properties: decision,
    is_active: true,
    confidence: 1.0,
  }).select('id').single()
  return data?.id ?? ''
}

// ---------------------------------------------------------------------------
// Platform status sync — call after OAuth callbacks and during daily cron
// ---------------------------------------------------------------------------

export async function syncPlatformStatus(brandId: string): Promise<PlatformStatus> {
  const admin = createServiceClient()
  const { data: creds } = await admin
    .from('credentials')
    .select('platform')
    .eq('brand_id', brandId)

  const platforms = new Set((creds ?? []).map(c => c.platform))
  const status: PlatformStatus = {
    shopify: platforms.has('shopify'),
    meta: platforms.has('meta'),
    ga4: platforms.has('google'),
    gsc: platforms.has('google'),
    klaviyo: platforms.has('klaviyo'),
    updated_at: new Date().toISOString(),
  }
  await upsertPlatformStatus(brandId, status)
  return status
}
