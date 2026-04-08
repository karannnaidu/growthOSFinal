import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap, CheckCircle2, AlertTriangle, Coins } from 'lucide-react'

interface BriefingMetrics {
  skillRunsToday: number
  autoCompletedCount: number
  needsReviewCount: number
  creditsUsedToday: number
}

interface WalletBalance {
  balance: number
  freeCredits: number
}

interface BriefingCardProps {
  metrics: BriefingMetrics
  walletBalance: WalletBalance | null
}

const METRIC_ITEMS = [
  {
    key: 'skillRunsToday' as const,
    label: 'Skill Runs Today',
    icon: Zap,
    color: '#6366f1',
    bgColor: 'bg-[#6366f1]/10',
  },
  {
    key: 'autoCompletedCount' as const,
    label: 'Auto-Completed',
    icon: CheckCircle2,
    color: '#10b981',
    bgColor: 'bg-[#10b981]/10',
  },
  {
    key: 'needsReviewCount' as const,
    label: 'Needs Review',
    icon: AlertTriangle,
    color: '#f59e0b',
    bgColor: 'bg-[#f59e0b]/10',
  },
  {
    key: 'creditsUsedToday' as const,
    label: 'Credits Used',
    icon: Coins,
    color: '#0d9488',
    bgColor: 'bg-[#0d9488]/10',
  },
]

export function BriefingCard({ metrics, walletBalance }: BriefingCardProps) {
  const totalCredits = walletBalance
    ? walletBalance.balance + walletBalance.freeCredits
    : null

  return (
    <Card className="glass-panel glow-mia">
      <CardHeader className="border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-heading font-semibold text-foreground">
            Today's Overview
          </CardTitle>
          {totalCredits !== null && (
            <span className="text-xs text-muted-foreground">
              {totalCredits.toLocaleString()} credits remaining
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {METRIC_ITEMS.map((item) => {
            const Icon = item.icon
            const value = metrics[item.key]
            return (
              <div
                key={item.key}
                className="flex flex-col gap-2 rounded-xl p-3 bg-white/[0.03] border border-white/[0.06]"
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.bgColor}`}>
                  <Icon className="h-4 w-4" style={{ color: item.color }} aria-hidden="true" />
                </div>
                <div>
                  <p
                    className="text-2xl font-metric font-semibold leading-none"
                    style={{ color: item.color }}
                  >
                    {value.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
