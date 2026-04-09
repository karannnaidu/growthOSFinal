import { redirect } from 'next/navigation'
import { getBrandContext } from '@/lib/brand-context'
import { createClient } from '@/lib/supabase/server'
import { MorningBrief } from '@/components/dashboard/morning-brief'
import { MetricCard } from '@/components/dashboard/metric-card'
import { AgentChains, type ChainNode } from '@/components/dashboard/agent-chains'
import { InternalLog, type LogEntry } from '@/components/dashboard/internal-log'
import { RecommendationCard } from '@/components/dashboard/recommendation-card'
import { ChatFAB } from '@/components/dashboard/chat-fab'
import { AGENT_MAP } from '@/lib/agents-data'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveMorningNarrative(
  skillRuns: Record<string, unknown>[],
  brandName: string,
): { narrative: string; metricsContext: string } {
  // Try to find a scout health-check output
  const healthCheck = skillRuns.find(
    (r) => r.agent === 'scout' && r.skill_name === 'health-check' && r.status === 'completed',
  )

  if (healthCheck && typeof healthCheck.output === 'string') {
    // Use the first sentence as narrative, rest as context
    const text = healthCheck.output
    const firstDot = text.indexOf('.')
    if (firstDot > 0 && firstDot < 200) {
      return {
        narrative: text.slice(0, firstDot + 1),
        metricsContext: text.slice(firstDot + 1).trim() || `Here's your ${brandName} morning overview.`,
      }
    }
    return { narrative: text.slice(0, 150), metricsContext: `Based on the latest diagnostics for ${brandName}.` }
  }

  // Fallback narrative
  const runCount = skillRuns.length
  return {
    narrative: runCount > 0
      ? `${brandName} had ${runCount} skill runs in the last 24 hours. Let me walk you through what matters.`
      : `Good morning. No automated runs yet today for ${brandName} — let's get things moving.`,
    metricsContext: runCount > 0
      ? `Your agents have been active. Review the metrics below and take action on any recommendations.`
      : `Start by executing the morning strategy to activate your agent pipeline.`,
  }
}

function deriveChainNodes(skillRuns: Record<string, unknown>[]): ChainNode[] {
  // Always show Mia as supervising, then active agents from recent runs
  const nodes: ChainNode[] = [
    { agentId: 'mia', agentName: 'Mia', role: 'Manager', status: 'supervising' },
  ]

  const seenAgents = new Set<string>(['mia'])
  for (const run of skillRuns) {
    const agentId = run.agent as string | undefined
    if (!agentId || seenAgents.has(agentId)) continue
    seenAgents.add(agentId)

    const agent = AGENT_MAP[agentId]
    const status = run.status === 'running' ? 'running' : run.status === 'needs_review' ? 'action_required' : 'standby'
    nodes.push({
      agentId,
      agentName: agent?.name ?? agentId,
      role: agent?.role ?? '',
      status: status as ChainNode['status'],
    })
    if (nodes.length >= 6) break
  }

  return nodes
}

function deriveLogEntries(skillRuns: Record<string, unknown>[]): LogEntry[] {
  return skillRuns
    .filter((r) => r.agent && r.skill_name)
    .slice(0, 15)
    .map((r) => ({
      agent: (r.agent as string) ?? 'system',
      message: `${r.skill_name} — ${r.status}${r.credits_used ? ` (${r.credits_used} credits)` : ''}`,
      timestamp: (r.created_at as string) ?? new Date().toISOString(),
    }))
}

function deriveMetrics(skillRuns: Record<string, unknown>[], todayStart: string) {
  const todayRuns = skillRuns.filter((r) => {
    const createdAt = r.created_at as string | undefined
    return createdAt && createdAt >= todayStart
  })

  const creditsUsed = todayRuns.reduce(
    (sum, r) => sum + ((r.credits_used as number) ?? 0),
    0,
  )

  const completedCount = skillRuns.filter((r) => r.status === 'completed').length
  const reviewCount = skillRuns.filter((r) => r.status === 'needs_review').length

  return { todayRuns: todayRuns.length, creditsUsed, completedCount, reviewCount }
}

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const ctx = await getBrandContext()
  const supabase = await createClient()

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const today = new Date().toISOString().split('T')[0]
  const todayStart = `${today}T00:00:00.000Z`

  const [skillRunsRes, notificationsRes, metricsHistoryRes] = await Promise.all([
    supabase
      .from('skill_runs')
      .select('*')
      .eq('brand_id', ctx.brandId)
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('notifications')
      .select('*')
      .eq('brand_id', ctx.brandId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('brand_metrics_history')
      .select('metric_name, metric_value, recorded_at')
      .eq('brand_id', ctx.brandId)
      .order('recorded_at', { ascending: false })
      .limit(50),
  ])

  const skillRuns = (skillRunsRes.data ?? []) as Record<string, unknown>[]
  const notifications = (notificationsRes.data ?? []) as Record<string, unknown>[]
  const metricsHistory = (metricsHistoryRes.data ?? []) as Record<string, unknown>[]

  // Derive data
  const { narrative, metricsContext } = deriveMorningNarrative(skillRuns, ctx.brandName)
  const metrics = deriveMetrics(skillRuns, todayStart)
  const chainNodes = deriveChainNodes(skillRuns)
  const logEntries = deriveLogEntries(skillRuns)

  // Latest run ID for "View Full Audit" link
  const latestRunId = skillRuns[0]?.id as string | undefined

  // Build sparkline data from metrics history
  const revenueSparkline = metricsHistory
    .filter((m) => m.metric_name === 'revenue')
    .slice(0, 5)
    .reverse()
    .map((m) => (m.metric_value as number) ?? 0)

  // Derive recommendations from notifications & recent scout runs
  const recommendations = notifications
    .filter((n) => n.type === 'needs_review' && n.agent)
    .slice(0, 3)
    .map((n) => ({
      agentId: (n.agent as string) ?? 'mia',
      title: (n.title as string) ?? 'Review needed',
      description: (n.body as string) ?? 'An agent has a recommendation for you.',
      ctaLabel: 'Run Now',
      skillId: (n.skill_id as string) ?? 'health-check',
      brandId: ctx.brandId,
    }))

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Morning Brief */}
      <MorningBrief
        narrative={narrative}
        metricsContext={metricsContext}
        latestRunId={latestRunId}
        brandId={ctx.brandId}
      />

      {/* 12-col grid: main (8) + sidebar (4) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Main content */}
        <div className="xl:col-span-8 space-y-6">
          {/* Metric cards row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Skill Runs"
              value={String(metrics.todayRuns)}
              change={metrics.todayRuns > 0 ? `+${metrics.todayRuns} today` : undefined}
              status={metrics.todayRuns > 3 ? 'optimal' : metrics.todayRuns > 0 ? 'stable' : 'declining'}
            />
            <MetricCard
              label="Completed"
              value={String(metrics.completedCount)}
              status={metrics.completedCount > 0 ? 'optimal' : 'stable'}
            />
            <MetricCard
              label="Needs Review"
              value={String(metrics.reviewCount)}
              status={metrics.reviewCount > 3 ? 'declining' : metrics.reviewCount > 0 ? 'stable' : 'optimal'}
            />
            <MetricCard
              label="Credits Used"
              value={String(metrics.creditsUsed)}
              sparklineData={revenueSparkline.length > 0 ? revenueSparkline : [2, 4, 3, 5, 4]}
              status="stable"
            />
          </div>

          {/* Internal Log */}
          <InternalLog entries={logEntries} />

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Mia&apos;s Recommendations
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendations.map((rec, i) => (
                  <RecommendationCard key={i} {...rec} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="xl:col-span-4 space-y-6">
          <AgentChains nodes={chainNodes} />

          {/* Quick stats card */}
          <div className="glass-panel rounded-2xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Wallet
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Balance</span>
                <span className="font-mono text-foreground">${ctx.walletBalance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Free Credits</span>
                <span className="font-mono text-foreground">{ctx.freeCredits}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-mono text-foreground capitalize">{ctx.plan}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ChatFAB />
    </div>
  )
}
