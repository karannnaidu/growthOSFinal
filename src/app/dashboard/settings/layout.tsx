'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { label: 'Brand DNA', href: '/dashboard/settings' },
  { label: 'Platforms', href: '/dashboard/settings/platforms' },
  { label: 'AI Model',  href: '/dashboard/settings/ai-model' },
  { label: 'Team',      href: '/dashboard/settings/team' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your brand preferences and integrations</p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-white/[0.08]">
        <nav className="-mb-px flex gap-1" aria-label="Settings tabs">
          {TABS.map((tab) => {
            const isActive =
              tab.href === '/dashboard/settings'
                ? pathname === '/dashboard/settings'
                : pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-[#6366f1] text-[#6366f1]'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-white/20'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Tab content */}
      {children}
    </div>
  )
}
