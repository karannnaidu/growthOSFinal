import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/dashboard/sidebar'
import { TopBar } from '@/components/dashboard/top-bar'
import { ErrorBoundary } from '@/components/error-boundary'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Defense in depth: proxy already redirects but guard here too
  if (!user) {
    redirect('/login')
  }

  const userEmail = user.email ?? null

  // Fetch the user's first brand for notifications
  const { data: brand } = await supabase
    .from('brands')
    .select('id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  const brandId = brand?.id ?? null

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed sidebar (desktop) + bottom nav (mobile) */}
      <Sidebar userEmail={userEmail} />

      {/* Fixed top bar */}
      <TopBar userEmail={userEmail} brandId={brandId} />

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
