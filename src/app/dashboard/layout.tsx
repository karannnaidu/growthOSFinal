import { getBrandContext } from '@/lib/brand-context'
import { Sidebar } from '@/components/dashboard/sidebar'
import { TopBar } from '@/components/dashboard/top-bar'
import { ErrorBoundary } from '@/components/error-boundary'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Defense in depth: proxy already redirects but guard here too
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const userEmail = user.email ?? null

  const ctx = await getBrandContext()
  const brandId = ctx?.brandId ?? null
  const walletBalance = ctx ? ctx.walletBalance + ctx.freeCredits : 0

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed sidebar (desktop) + bottom nav (mobile) */}
      <Sidebar userEmail={userEmail} brandId={brandId} walletBalance={walletBalance} />

      {/* Fixed top bar */}
      <TopBar userEmail={userEmail} brandId={brandId} walletBalance={walletBalance} />

      {/* Main content area */}
      {/* Offset for sidebar (md+) and top bar; bottom padding for mobile nav */}
      <main className="md:ml-60 pt-14 pb-20 md:pb-6 min-h-screen">
        <div className="px-4 md:px-8 py-6">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}
