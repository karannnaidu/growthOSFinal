'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sparkles,
  Users,
  Zap,
  Palette,
  CreditCard,
  Plus,
  Settings,
  HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgentAvatar } from '@/components/agents/agent-avatar'

interface SidebarProps {
  userEmail?: string | null
  brandId?: string | null
  walletBalance?: number
}

const MAIN_NAV = [
  { label: 'Mia Orchestrator', href: '/dashboard', icon: Sparkles, exact: true },
  { label: 'Marketing Agents', href: '/dashboard/agents', icon: Users, exact: false },
  { label: 'Agent Skills', href: '/dashboard/skills', icon: Zap, exact: false },
  { label: 'Creative Studio', href: '/dashboard/creative', icon: Palette, exact: false },
  { label: 'Billing & Usage', href: '/dashboard/billing', icon: CreditCard, exact: false },
]

const MOBILE_NAV = [
  { label: 'Mia', href: '/dashboard', icon: Sparkles, exact: true },
  { label: 'Agents', href: '/dashboard/agents', icon: Users, exact: false },
  { label: 'Skills', href: '/dashboard/skills', icon: Zap, exact: false },
  { label: 'Creative', href: '/dashboard/creative', icon: Palette, exact: false },
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard, exact: false },
]

const BOTTOM_NAV = [
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
  { label: 'Support', href: '/support', icon: HelpCircle },
]

export function Sidebar({ brandId: _brandId, walletBalance = 0 }: SidebarProps) {
  const pathname = usePathname()

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside data-print-hide className="hidden md:flex fixed left-0 top-0 h-full w-60 flex-col bg-[#0a1628] border-r border-white/[0.06] z-30">

        {/* Mia header */}
        <div className="flex flex-col items-center gap-2 px-6 pt-7 pb-5 border-b border-white/[0.06]">
          <AgentAvatar agentId="mia" size="lg" state="default" />
          <div className="text-center">
            <p className="text-sm font-semibold text-white leading-none mt-1">Mia</p>
            <p className="text-[11px] text-white/40 mt-0.5">Manager Agent</p>
          </div>
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5" aria-label="Main navigation">
          {MAIN_NAV.map(({ label, href, icon: Icon, exact }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 border-l-2',
                  active
                    ? 'border-[#6366f1] bg-[#6366f1]/10 text-[#6366f1]'
                    : 'border-transparent text-white/50 hover:bg-white/[0.05] hover:text-white/80'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon
                  className={cn('h-4 w-4 shrink-0', active ? 'text-[#6366f1]' : 'text-white/40')}
                  aria-hidden="true"
                />
                {label}
              </Link>
            )
          })}

          {/* New Campaign CTA */}
          <div className="pt-3 pb-1">
            <Link
              href="/dashboard/campaigns/new"
              className="flex items-center justify-center gap-2 w-full rounded-lg px-3 py-2.5 text-sm font-semibold bg-[#6366f1] hover:bg-[#5558e8] text-white transition-colors duration-150"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              New Campaign
            </Link>
          </div>
        </nav>

        {/* Bottom links */}
        <div className="px-3 pb-2 space-y-0.5 border-t border-white/[0.06] pt-3">
          {BOTTOM_NAV.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                  active
                    ? 'text-white/80 bg-white/[0.05]'
                    : 'text-white/40 hover:bg-white/[0.05] hover:text-white/70'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            )
          })}
        </div>

        {/* Wallet balance */}
        <div className="border-t border-white/[0.06] px-4 py-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-3.5 w-3.5 shrink-0 text-[#059669]" aria-hidden="true" />
            <div>
              <p className="text-[10px] text-white/40 font-medium uppercase tracking-wide leading-none">
                Penny&apos;s Wallet
              </p>
              <p className="text-sm font-semibold text-[#059669] mt-0.5 leading-none">
                {walletBalance.toLocaleString()} credits
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        data-print-hide
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0a1628] border-t border-white/[0.06] flex items-center justify-around px-2 py-2"
        aria-label="Mobile navigation"
      >
        {MOBILE_NAV.map(({ label, href, icon: Icon, exact }) => {
          const active = isActive(href, exact)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg p-2 min-w-[52px] transition-colors duration-150',
                active ? 'text-[#6366f1]' : 'text-white/40 hover:text-white/70'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
