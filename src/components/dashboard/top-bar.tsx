'use client'

import * as React from 'react'
import { Search } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { CommandPalette } from '@/components/command-palette'
import { NotificationsBell } from '@/components/notifications-bell'

interface TopBarProps {
  userEmail?: string | null
  brandId?: string | null
  walletBalance?: number
}

export function TopBar({ userEmail, brandId, walletBalance: _walletBalance }: TopBarProps) {
  const router = useRouter()
  const [paletteOpen, setPaletteOpen] = React.useState(false)

  // Global Cmd+K / Ctrl+K listener
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(v => !v)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function handleSignOut() {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.refresh()
    } finally {
      router.push('/login')
    }
  }

  return (
    <>
      <header className="fixed top-0 right-0 left-0 md:left-60 z-20 h-14 glass-panel border-b border-white/[0.06] flex items-center justify-between px-4 md:px-6">
        {/* Left: Cmd+K search trigger */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors duration-150 min-w-[180px]"
          aria-label="Open command palette"
          aria-keyshortcuts="Meta+k Ctrl+k"
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
          <NotificationsBell brandId={brandId} />

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

      {/* Command palette (rendered outside header to avoid stacking context issues) */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
