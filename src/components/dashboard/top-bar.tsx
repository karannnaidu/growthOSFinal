'use client'

import { Bell, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface TopBarProps {
  userEmail?: string | null
}

export function TopBar({ userEmail }: TopBarProps) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="fixed top-0 right-0 left-0 md:left-60 z-20 h-14 glass-panel border-b border-white/[0.06] flex items-center justify-between px-4 md:px-6">
      {/* Left: Cmd+K search trigger */}
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors duration-150 min-w-[180px]"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-white/[0.1] px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/70">
          <span>⌘</span><span>K</span>
        </kbd>
      </button>

      {/* Right: notifications + avatar */}
      <div className="flex items-center gap-2">
        {/* Notifications bell */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
        </Button>

        {/* User avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6366f1]/20 text-xs font-semibold text-[#6366f1] uppercase hover:bg-[#6366f1]/30 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1]/50"
            aria-label="User menu"
          >
            {userEmail ? userEmail[0] : '?'}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {userEmail && (
              <>
                <div className="px-3 py-2">
                  <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/dashboard/billing')}>
              Billing
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={handleSignOut}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
