import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { TrendingUp, ArrowRight } from 'lucide-react'

interface InsightItem {
  id: string
  skill_name?: string
  agent?: string
  output?: string | Record<string, unknown>
  created_at: string
  [key: string]: unknown
}

interface InsightsListProps {
  items: InsightItem[]
}

function extractInsightTitle(item: InsightItem): string {
  if (item.skill_name) return item.skill_name
  if (item.output && typeof item.output === 'object') {
    const title = (item.output as Record<string, unknown>).title
    if (typeof title === 'string') return title
  }
  return 'Market Insight'
}

function extractInsightFinding(item: InsightItem): string {
  if (!item.output) return ''
  if (typeof item.output === 'string') return item.output.slice(0, 120)
  if (typeof item.output === 'object') {
    const finding =
      (item.output as Record<string, unknown>).summary ??
      (item.output as Record<string, unknown>).finding ??
      (item.output as Record<string, unknown>).message
    if (typeof finding === 'string') return finding.slice(0, 120)
  }
  return ''
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

function InsightCard({ item }: { item: InsightItem }) {
  const title = extractInsightTitle(item)
  const finding = extractInsightFinding(item)
  const timeAgo = formatRelativeTime(item.created_at)

  return (
    <Link
      href={`/dashboard/runs/${item.id}`}
      className="group block rounded-xl glass-panel-elevated border-l-2 p-4 transition-all hover:bg-white/[0.04]"
      style={{ borderLeftColor: '#0d9488' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: '#0d9488' }}
          aria-hidden="true"
        >
          S
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-foreground leading-snug group-hover:text-[#0d9488] transition-colors">
              {title}
            </p>
            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50 group-hover:text-[#0d9488] transition-colors" aria-hidden="true" />
          </div>
          {finding && (
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {finding}
            </p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground/60">Scout · {timeAgo}</p>
        </div>
      </div>
    </Link>
  )
}

export function InsightsList({ items }: InsightsListProps) {
  return (
    <Card className="glass-panel glow-scout">
      <CardHeader className="border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#0d9488]" aria-hidden="true" />
          <CardTitle className="text-sm font-heading font-semibold text-foreground">
            Recent Insights
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#0d9488]/10">
              <TrendingUp className="h-5 w-5 text-[#0d9488]/50" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground">Scout hasn't surfaced any insights yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.slice(0, 5).map((item) => (
              <InsightCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
