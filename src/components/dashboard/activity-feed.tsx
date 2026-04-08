import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Activity } from 'lucide-react'

interface ActivityFeedProps {
  brandId: string
}

interface SkillRun {
  id: string
  skill_name?: string
  agent?: string
  status?: string
  created_at: string
  [key: string]: unknown
}

const AGENT_COLORS: Record<string, string> = {
  mia: '#6366f1',
  scout: '#0d9488',
  aria: '#f97316',
  luna: '#10b981',
  hugo: '#d97706',
  sage: '#8b5cf6',
  max: '#3b82f6',
  atlas: '#e11d48',
  echo: '#64748b',
  nova: '#7c3aed',
  navi: '#0ea5e9',
  penny: '#059669',
}

function getAgentColor(agent?: string): string {
  if (!agent) return '#6366f1'
  return AGENT_COLORS[agent.toLowerCase()] ?? '#6366f1'
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center rounded-full bg-[#10b981]/15 px-2 py-0.5 text-[10px] font-medium text-[#10b981]">
        completed
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center rounded-full bg-[#3b82f6]/15 px-2 py-0.5 text-[10px] font-medium text-[#3b82f6]">
        running
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center rounded-full bg-[#e11d48]/15 px-2 py-0.5 text-[10px] font-medium text-[#e11d48]">
        failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {status}
    </span>
  )
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export async function ActivityFeed({ brandId }: ActivityFeedProps) {
  const supabase = await createClient()

  const { data: runs } = await supabase
    .from('skill_runs')
    .select('id, skill_name, agent, status, created_at')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(10)

  const skillRuns: SkillRun[] = runs ?? []

  return (
    <div className="glass-panel rounded-xl">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <Activity className="h-4 w-4 text-[#6366f1]" aria-hidden="true" />
        <h3 className="text-sm font-heading font-semibold text-foreground">Activity Feed</h3>
      </div>
      <div className="p-4">
        {skillRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#6366f1]/10">
              <Activity className="h-5 w-5 text-[#6366f1]/50" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        ) : (
          <ol className="space-y-3" aria-label="Recent activity">
            {skillRuns.map((run) => {
              const agentColor = getAgentColor(run.agent)
              const agentLabel = run.agent
                ? run.agent.charAt(0).toUpperCase() + run.agent.slice(1)
                : 'Mia'
              return (
                <li key={run.id} className="flex items-center gap-3">
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: agentColor }}
                    aria-hidden="true"
                  >
                    {agentLabel[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      {run.skill_name ?? 'Skill run'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60">{agentLabel}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={run.status} />
                    <span className="text-[10px] text-muted-foreground/60">
                      {formatTime(run.created_at)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
