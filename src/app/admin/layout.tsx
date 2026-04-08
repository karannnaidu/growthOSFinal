// ---------------------------------------------------------------------------
// Admin Layout — /admin/*
//
// Simple layout for the super-admin area. Server-side role check redirects
// non-admins to the dashboard.
// ---------------------------------------------------------------------------

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: role } = await supabase
    .from('platform_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .single()

  if (!role) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal admin nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link
            href="/admin"
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <ShieldCheck className="h-5 w-5 text-primary" />
            Growth OS Admin
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-muted-foreground hover:text-foreground transition-colors">
              Overview
            </Link>
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
              Back to App
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {children}
      </main>
    </div>
  )
}
