'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sparkles,
  MessageSquare,
  Users,
  Settings,
  CreditCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import type { LucideIcon } from 'lucide-react'

type AgentNavItem = { label: string; href: string; agentId: string; exact: boolean; icon?: never }
type IconNavItem  = { label: string; href: string; icon: LucideIcon; exact: boolean; agentId?: never }
type NavItem = AgentNavItem | IconNavItem

function isAgentItem(item: NavItem): item is AgentNavItem {
  return typeof (item as AgentNavItem).agentId === 'string'
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Mia',
    href: '/dashboard',
    agentId: 'mia',
    exact: true,
  },
  {
    label: 'Chat',
    href: '/dashboard/chat',
    icon: MessageSquare,
    exact: false,
  },
  {
    label: 'Agents',
    href: '/dashboard/agents',
    icon: Users,
    exact: false,
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
    exact: false,
  },
  {
    label: 'Billing',
    href: '/dashboard/billing',
    icon: CreditCard,
    exact: false,
  },
]

interface SidebarProps {
  userEmail?: string | null
  brandId?: string | null
  walletBalance?: number
}

export function Sidebar({ userEmail, brandId: _brandId, walletBalance: _walletBalance }: SidebarProps) {
  const pathname = usePathname()

  function isActive(item: (typeof NAV_ITEMS)[number]) {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-60 flex-col glass-panel glow-mia z-30">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-6 py-5 border-b border-white/[0.06]">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6366f1]/20">
            <Sparkles className="h-4 w-4 text-[#6366f1]" aria-hidden="true" />
          </div>
          <span className="font-heading text-base font-semibold tracking-tight text-foreground">
            Growth OS
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                  active
                    ? 'bg-[#6366f1]/15 text-[#6366f1]'
                    : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground'
                )}
                aria-current={active ? 'page' : undefined}
              >
                {isAgentItem(item) ? (
                  <AgentAvatar
                    agentId={item.agentId}
                    size="sm"
                    state={active ? 'working' : 'default'}
                  />
                ) : (
                  <item.icon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      active ? 'text-[#6366f1]' : 'text-muted-foreground'
                    )}
                    aria-hidden="true"
                  />
                )}
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User info at bottom */}
        {userEmail && (
          <div className="border-t border-white/[0.06] px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6366f1]/20 text-xs font-semibold text-[#6366f1] uppercase">
                {userEmail[0]}
              </div>
              <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 glass-panel border-t border-white/[0.06] flex items-center justify-around px-2 py-2"
        aria-label="Mobile navigation"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg p-2 min-w-[52px] transition-colors duration-150',
                active
                  ? 'text-[#6366f1]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-current={active ? 'page' : undefined}
            >
              {isAgentItem(item) ? (
                <AgentAvatar
                  agentId={item.agentId}
                  size="sm"
                  state={active ? 'working' : 'default'}
                />
              ) : (
                <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              )}
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
