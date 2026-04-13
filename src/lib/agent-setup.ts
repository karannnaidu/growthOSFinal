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
  auto_from?: string  // e.g. 'brand.domain', 'brand.target_audience' — auto-resolve from Brand DNA
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

  // Load Brand DNA for auto-resolution
  const { createServiceClient } = await import('@/lib/supabase/service')
  const admin = createServiceClient()
  const { data: brandRow } = await admin.from('brands').select('domain, brand_guidelines').eq('id', brandId).single()
  const brandDNA = brandRow?.brand_guidelines as Record<string, unknown> | null

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
      // First check if Brand DNA can auto-resolve this requirement
      const autoFrom = (req as SetupRequirement).auto_from
      if (autoFrom && brandDNA) {
        if (autoFrom === 'brand.domain' && brandRow?.domain) {
          met = true
          value = { value: brandRow.domain }
        } else if (autoFrom === 'brand.target_audience' && brandDNA.target_audience) {
          met = true
          value = brandDNA.target_audience
        } else if (autoFrom === 'brand.products' && brandDNA.products) {
          met = true
          value = brandDNA.products
        } else if (autoFrom === 'brand.positioning' && brandDNA.positioning) {
          met = true
          value = brandDNA.positioning
        }
      }

      // If not auto-resolved, check manual brand_data nodes
      if (!met) {
        const brandData = await getBrandData(brandId, name!)
        met = !!brandData
        value = brandData?.data
      }
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
