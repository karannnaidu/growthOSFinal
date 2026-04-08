import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BriefingCard } from '@/components/dashboard/briefing-card'
import { NeedsReviewList } from '@/components/dashboard/needs-review-list'
import { AutoCompletedList } from '@/components/dashboard/auto-completed-list'
import { InsightsList } from '@/components/dashboard/insights-list'
import { ActivityFeed } from '@/components/dashboard/activity-feed'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function getGreetingEmoji(): string {
  const hour = new Date().getHours()
  if (hour < 12) return '☀️'
  if (hour < 18) return '👋'
  return '🌙'
}

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const supabase = await createClient()

  // 1. Auth
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // 2. Resolve brand — owner first, then membership fallback
  let brandId: string | null = null

  const { data: ownedBrand } = await supabase
    .from('brands')
    .select('id, name')
    .eq('owner_id', user.id)
    .limit(1)
    .single()

  if (ownedBrand) {
    brandId = ownedBrand.id as string
  } else {
    const { data: member } = await supabase
      .from('brand_members')
      .select('brand_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()
    if (member) {
      brandId = member.brand_id as string
    }
  }

  if (!brandId) {
    // No brand — send to onboarding
    redirect('/onboarding')
  }

  // 3. Fetch briefing data in parallel
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const today = new Date().toISOString().split('T')[0]
  const todayStart = `${today}T00:00:00.000Z`

  const [skillRunsRes, notificationsRes, walletRes] = await Promise.all([
    supabase
      .from('skill_runs')
      .select('*')
      .eq('brand_id', brandId)
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('notifications')
      .select('*')
      .eq('brand_id', brandId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('wallets')
      .select('balance, free_credits')
      .eq('brand_id', brandId)
      .single(),
  ])

  const skillRuns = (skillRunsRes.data ?? []) as Record<string, unknown>[]
  const notifications = (notificationsRes.data ?? []) as Record<string, unknown>[]
  const wallet = walletRes.data

  // 4. Derive sections
  const needsReview = notifications.filter((n) => n.type === 'needs_review')

  const autoCompleted = skillRuns.filter(
    (r) => r.triggered_by === 'mia' && r.status === 'completed',
  )

  const recentInsights = skillRuns.filter((r) => r.agent === 'scout')

  const todayRuns = skillRuns.filter((r) => {
    const createdAt = r.created_at as string | undefined
    return createdAt && createdAt >= todayStart
  })

  const creditsUsedToday = todayRuns.reduce(
    (sum, r) => sum + ((r.credits_used as number) ?? 0),
    0,
  )

  const metrics = {
    skillRunsToday: todayRuns.length,
    autoCompletedCount: autoCompleted.length,
    needsReviewCount: needsReview.length,
    creditsUsedToday,
  }

  const walletBalance = wallet
    ? { balance: (wallet.balance as number) ?? 0, freeCredits: (wallet.free_credits as number) ?? 0 }
    : null

  const greeting = getGreeting()
  const emoji = getGreetingEmoji()

  // 5. Render
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">
          {greeting} {emoji}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here's what's happening with your brand
        </p>
      </div>

      {/* Briefing Metrics */}
      <BriefingCard metrics={metrics} walletBalance={walletBalance} />

      {/* Two-column layout on desktop */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-6">
          <NeedsReviewList
            items={needsReview as Array<{
              id: string
              title: string
              body?: string
              agent?: string
              created_at: string
              [key: string]: unknown
            }>}
          />
          <AutoCompletedList
            items={autoCompleted as Array<{
              id: string
              skill_name?: string
              agent?: string
              output?: string | Record<string, unknown>
              created_at: string
              status?: string
              [key: string]: unknown
            }>}
          />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <InsightsList
            items={recentInsights as Array<{
              id: string
              skill_name?: string
              agent?: string
              output?: string | Record<string, unknown>
              created_at: string
              [key: string]: unknown
            }>}
          />
          <ActivityFeed brandId={brandId} />
        </div>
      </div>
    </div>
  )
}
