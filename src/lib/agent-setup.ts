// src/lib/agent-setup.ts

import { createServiceClient } from '@/lib/supabase/service'
import {
  getPlatformStatus, getBrandData, getAgentSetup,
  upsertAgentSetup, syncPlatformStatus,
  type AgentSetupState,
} from '@/lib/knowledge/intelligence'
import fs from 'fs'
import path from 'path'

export interface SetupRequirement {
  key: string
  label: string
  type: 'connection' | 'number' | 'text' | 'file'
  required: boolean
  fallback?: 'manual'
}

export interface AgentSetup {
  requirements: SetupRequirement[]
  chat_prompt?: string
}

export interface RequirementStatus {
  key: string
  label: string
  type: string
  required: boolean
  met: boolean
  value?: unknown
}

let agentsCache: Record<string, unknown>[] | null = null

function loadAgents(): Record<string, unknown>[] {
  if (agentsCache) return agentsCache
  const raw = fs.readFileSync(path.join(process.cwd(), 'skills', 'agents.json'), 'utf-8')
  agentsCache = JSON.parse(raw)
  return agentsCache!
}

export function getAgentSetupConfig(agentId: string): AgentSetup | null {
  const agents = loadAgents()
  const agent = agents.find((a) => (a as { id: string }).id === agentId) as Record<string, unknown> | undefined
  return (agent?.setup as AgentSetup) ?? null
}

export async function checkRequirements(brandId: string, agentId: string): Promise<{
  status: RequirementStatus[]
  allRequiredMet: boolean
  state: AgentSetupState['state']
}> {
  const setup = getAgentSetupConfig(agentId)
  if (!setup) {
    return { status: [], allRequiredMet: true, state: 'ready' }
  }

  let platformStatus = await getPlatformStatus(brandId)
  if (!platformStatus) {
    platformStatus = await syncPlatformStatus(brandId)
  }

  const statuses: RequirementStatus[] = []

  for (const req of setup.requirements) {
    const [category, name] = req.key.split(':')
    let met = false
    let value: unknown = undefined

    if (category === 'platform') {
      const key = name as keyof typeof platformStatus
      met = !!platformStatus[key]
      value = met ? 'connected' : 'not connected'
    } else if (category === 'data') {
      const brandData = await getBrandData(brandId, name!)
      met = !!brandData
      value = brandData?.data
    }

    statuses.push({ key: req.key, label: req.label, type: req.type, required: req.required, met, value })
  }

  const allRequiredMet = statuses.filter(s => s.required).every(s => s.met)
  const anyMet = statuses.some(s => s.met)
  const state: AgentSetupState['state'] = allRequiredMet ? 'ready' : anyMet ? 'collecting' : 'inactive'

  await upsertAgentSetup(brandId, agentId, {
    state,
    requirements_met: statuses.filter(s => s.met).map(s => s.key),
    requirements_pending: statuses.filter(s => !s.met).map(s => s.key),
  })

  return { status: statuses, allRequiredMet, state }
}
