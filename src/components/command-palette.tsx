'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Settings,
  CreditCard,
  Zap,
  Bot,
  Search,
  ChevronRight,
} from 'lucide-react'
import { Dialog, DialogContent, DialogPortal, DialogOverlay } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommandItem {
  id: string
  group: 'quick' | 'nav' | 'skill' | 'agent'
  label: string
  description?: string
  icon?: React.ReactNode
  shortcut?: string
  action: () => void
  accentColor?: string
}

// ---------------------------------------------------------------------------
// Agents data (static from agents.json)
// ---------------------------------------------------------------------------

const AGENTS = [
  { id: 'mia', name: 'Mia', role: 'Manager', color: '#6366F1' },
  { id: 'scout', name: 'Scout', role: 'Diagnostician', color: '#0D9488' },
  { id: 'aria', name: 'Aria', role: 'Creative Director', color: '#F97316' },
  { id: 'luna', name: 'Luna', role: 'Email/SMS + Retention', color: '#10B981' },
  { id: 'hugo', name: 'Hugo', role: 'SEO/Content', color: '#D97706' },
  { id: 'sage', name: 'Sage', role: 'CRO + Pricing', color: '#8B5CF6' },
  { id: 'max', name: 'Max', role: 'Budget + Channels', color: '#3B82F6' },
  { id: 'atlas', name: 'Atlas', role: 'Audiences + Personas', color: '#E11D48' },
  { id: 'echo', name: 'Echo', role: 'Competitor Intel', color: '#64748B' },
  { id: 'nova', name: 'Nova', role: 'AI Visibility', color: '#7C3AED' },
  { id: 'navi', name: 'Navi', role: 'Inventory + Compliance', color: '#0EA5E9' },
  { id: 'penny', name: 'Penny', role: 'Finance', color: '#059669' },
]

// Top 5 most-used skills (hardcoded defaults — could be dynamic in future)
const TOP_SKILLS = [
  { id: 'health-check', name: 'Health Check', agentId: 'scout', description: 'Diagnose brand metrics' },
  { id: 'ad-copy', name: 'Ad Copy', agentId: 'aria', description: 'Generate ad creatives' },
  { id: 'email-copy', name: 'Email Copy', agentId: 'luna', description: 'Write email campaigns' },
  { id: 'seo-audit', name: 'SEO Audit', agentId: 'hugo', description: 'Audit SEO health' },
  { id: 'budget-allocation', name: 'Budget Allocation', agentId: 'max', description: 'Optimise ad spend' },
]

// ---------------------------------------------------------------------------
// Fuzzy match helper
// ---------------------------------------------------------------------------

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  return t.includes(q) || t.split(/\s+/).some(w => w.startsWith(q))
}

// ---------------------------------------------------------------------------
// Group label
// ---------------------------------------------------------------------------

const GROUP_LABELS: Record<string, string> = {
  quick: 'Quick Actions',
  nav: 'Navigation',
  skill: 'Skills',
  agent: 'Agents',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const [activeIndex, setActiveIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  // Build items
  const allItems: CommandItem[] = React.useMemo(() => {
    const items: CommandItem[] = []

    // Quick actions
    TOP_SKILLS.forEach(skill => {
      const agent = AGENTS.find(a => a.id === skill.agentId)
      items.push({
        id: `skill-quick-${skill.id}`,
        group: 'quick',
        label: `Run: ${skill.name}`,
        description: skill.description,
        icon: <Zap className="h-3.5 w-3.5" />,
        action: () => {
          router.push(`/dashboard/agents/${skill.agentId}?run=${skill.id}`)
          onOpenChange(false)
        },
        accentColor: agent?.color,
      })
    })

    items.push({
      id: 'chat-mia',
      group: 'quick',
      label: 'New Chat with Mia',
      description: 'Start a conversation with your AI manager',
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      action: () => {
        router.push('/dashboard/chat')
        onOpenChange(false)
      },
      accentColor: '#6366F1',
    })

    // Navigation
    const navItems = [
      { id: 'nav-dashboard', label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
      { id: 'nav-chat', label: 'Chat', path: '/dashboard/chat', icon: <MessageSquare className="h-3.5 w-3.5" /> },
      { id: 'nav-agents', label: 'Agents', path: '/dashboard/agents', icon: <Users className="h-3.5 w-3.5" /> },
      { id: 'nav-settings', label: 'Settings', path: '/dashboard/settings', icon: <Settings className="h-3.5 w-3.5" /> },
      { id: 'nav-billing', label: 'Billing', path: '/dashboard/billing', icon: <CreditCard className="h-3.5 w-3.5" /> },
    ]
    navItems.forEach(nav => {
      items.push({
        id: nav.id,
        group: 'nav',
        label: nav.label,
        icon: nav.icon,
        action: () => {
          router.push(nav.path)
          onOpenChange(false)
        },
      })
    })

    // All skills (from agents.json skill lists — static)
    const ALL_SKILLS = [
      { id: 'weekly-report', name: 'Weekly Report', agentId: 'mia' },
      { id: 'seasonal-planner', name: 'Seasonal Planner', agentId: 'mia' },
      { id: 'product-launch-playbook', name: 'Product Launch Playbook', agentId: 'mia' },
      { id: 'whatsapp-briefing', name: 'WhatsApp Briefing', agentId: 'mia' },
      { id: 'health-check', name: 'Health Check', agentId: 'scout' },
      { id: 'anomaly-detection', name: 'Anomaly Detection', agentId: 'scout' },
      { id: 'customer-signal-analyzer', name: 'Customer Signal Analyzer', agentId: 'scout' },
      { id: 'returns-analyzer', name: 'Returns Analyzer', agentId: 'scout' },
      { id: 'ad-copy', name: 'Ad Copy', agentId: 'aria' },
      { id: 'image-brief', name: 'Image Brief', agentId: 'aria' },
      { id: 'ugc-script', name: 'UGC Script', agentId: 'aria' },
      { id: 'social-content-calendar', name: 'Social Content Calendar', agentId: 'aria' },
      { id: 'ugc-scout', name: 'UGC Scout', agentId: 'aria' },
      { id: 'creative-fatigue-detector', name: 'Creative Fatigue Detector', agentId: 'aria' },
      { id: 'brand-voice-extractor', name: 'Brand Voice Extractor', agentId: 'aria' },
      { id: 'email-copy', name: 'Email Copy', agentId: 'luna' },
      { id: 'email-flow-audit', name: 'Email Flow Audit', agentId: 'luna' },
      { id: 'abandoned-cart-recovery', name: 'Abandoned Cart Recovery', agentId: 'luna' },
      { id: 'churn-prevention', name: 'Churn Prevention', agentId: 'luna' },
      { id: 'review-collector', name: 'Review Collector', agentId: 'luna' },
      { id: 'loyalty-program-designer', name: 'Loyalty Program Designer', agentId: 'luna' },
      { id: 'seo-audit', name: 'SEO Audit', agentId: 'hugo' },
      { id: 'keyword-strategy', name: 'Keyword Strategy', agentId: 'hugo' },
      { id: 'programmatic-seo', name: 'Programmatic SEO', agentId: 'hugo' },
      { id: 'page-cro', name: 'Page CRO', agentId: 'sage' },
      { id: 'signup-flow-cro', name: 'Signup Flow CRO', agentId: 'sage' },
      { id: 'ab-test-design', name: 'A/B Test Design', agentId: 'sage' },
      { id: 'pricing-optimizer', name: 'Pricing Optimizer', agentId: 'sage' },
      { id: 'budget-allocation', name: 'Budget Allocation', agentId: 'max' },
      { id: 'ad-scaling', name: 'Ad Scaling', agentId: 'max' },
      { id: 'channel-expansion-advisor', name: 'Channel Expansion Advisor', agentId: 'max' },
      { id: 'audience-targeting', name: 'Audience Targeting', agentId: 'atlas' },
      { id: 'retargeting-strategy', name: 'Retargeting Strategy', agentId: 'atlas' },
      { id: 'influencer-finder', name: 'Influencer Finder', agentId: 'atlas' },
      { id: 'influencer-tracker', name: 'Influencer Tracker', agentId: 'atlas' },
      { id: 'persona-builder', name: 'Persona Builder', agentId: 'atlas' },
      { id: 'competitor-scan', name: 'Competitor Scan', agentId: 'echo' },
      { id: 'competitor-creative-library', name: 'Competitor Creative Library', agentId: 'echo' },
      { id: 'geo-visibility', name: 'GEO Visibility', agentId: 'nova' },
      { id: 'inventory-alert', name: 'Inventory Alert', agentId: 'navi' },
      { id: 'reorder-calculator', name: 'Reorder Calculator', agentId: 'navi' },
      { id: 'compliance-checker', name: 'Compliance Checker', agentId: 'navi' },
      { id: 'billing-check', name: 'Billing Check', agentId: 'penny' },
      { id: 'unit-economics', name: 'Unit Economics', agentId: 'penny' },
      { id: 'cash-flow-forecast', name: 'Cash Flow Forecast', agentId: 'penny' },
    ]

    ALL_SKILLS.forEach(skill => {
      const agent = AGENTS.find(a => a.id === skill.agentId)
      items.push({
        id: `skill-${skill.id}`,
        group: 'skill',
        label: skill.name,
        description: agent ? `${agent.name} · ${agent.role}` : undefined,
        icon: <Zap className="h-3.5 w-3.5" />,
        action: () => {
          router.push(`/dashboard/agents/${skill.agentId}?run=${skill.id}`)
          onOpenChange(false)
        },
        accentColor: agent?.color,
      })
    })

    // Agents
    AGENTS.forEach(agent => {
      items.push({
        id: `agent-${agent.id}`,
        group: 'agent',
        label: agent.name,
        description: agent.role,
        icon: <Bot className="h-3.5 w-3.5" />,
        action: () => {
          router.push(`/dashboard/agents/${agent.id}`)
          onOpenChange(false)
        },
        accentColor: agent.color,
      })
    })

    return items
  }, [router, onOpenChange])

  // Filter by query
  const filtered = React.useMemo(() => {
    if (!query.trim()) return allItems
    return allItems.filter(item =>
      fuzzyMatch(query, item.label) ||
      (item.description && fuzzyMatch(query, item.description))
    )
  }, [allItems, query])

  // Group filtered items
  const grouped = React.useMemo(() => {
    const groups: Record<string, CommandItem[]> = {}
    for (const item of filtered) {
      if (!groups[item.group]) groups[item.group] = []
      groups[item.group]!.push(item)
    }
    return groups
  }, [filtered])

  // Flat list for keyboard nav
  const flatItems = React.useMemo(() => filtered, [filtered])

  // Reset on open + global Escape listener
  React.useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      const t = setTimeout(() => inputRef.current?.focus(), 50)

      // Global escape handler (works regardless of focus)
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onOpenChange(false)
      }
      document.addEventListener('keydown', handleEsc)
      return () => {
        clearTimeout(t)
        document.removeEventListener('keydown', handleEsc)
      }
    }
  }, [open, onOpenChange])

  // Keep activeIndex in bounds
  React.useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      flatItems[activeIndex]?.action()
    } else if (e.key === 'Escape') {
      onOpenChange(false)
    }
  }

  // Scroll active item into view
  React.useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  let globalIndex = 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        {/* Overlay — click to close */}
        <DialogOverlay onClick={() => onOpenChange(false)} />
        {/* Custom popup — not using DialogContent so we can control layout precisely */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="fixed left-1/2 top-[15vh] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0f1117]/95 shadow-2xl backdrop-blur-xl"
          onKeyDown={handleKeyDown}
          tabIndex={-1}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search commands, skills, agents…"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
              aria-autocomplete="list"
              aria-expanded="true"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground"
              >
                Clear
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-white/[0.1] px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/50">
              Esc
            </kbd>
          </div>

          {/* Results list */}
          <div
            ref={listRef}
            role="listbox"
            aria-label="Commands"
            className="max-h-[60vh] overflow-y-auto py-2 scrollbar-thin"
          >
            {flatItems.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No results for &ldquo;{query}&rdquo;
              </p>
            ) : (
              Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    {GROUP_LABELS[group] ?? group}
                  </p>
                  {items.map(item => {
                    const idx = globalIndex++
                    const isActive = idx === activeIndex
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        data-index={idx}
                        onClick={item.action}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-75',
                          isActive
                            ? 'bg-white/[0.06] text-foreground'
                            : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
                        )}
                      >
                        {/* Icon */}
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            background: item.accentColor ? `${item.accentColor}22` : 'rgba(255,255,255,0.06)',
                            color: item.accentColor ?? 'currentColor',
                          }}
                        >
                          {item.icon}
                        </span>

                        {/* Label + description */}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {item.label}
                          </span>
                          {item.description && (
                            <span className="block truncate text-[11px] text-muted-foreground/70">
                              {item.description}
                            </span>
                          )}
                        </span>

                        {/* Shortcut or arrow */}
                        {item.shortcut ? (
                          <kbd className="shrink-0 rounded border border-white/[0.1] px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/50">
                            {item.shortcut}
                          </kbd>
                        ) : (
                          <ChevronRight
                            className={cn(
                              'h-3.5 w-3.5 shrink-0 transition-opacity',
                              isActive ? 'opacity-50' : 'opacity-0'
                            )}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
              <kbd className="rounded border border-white/[0.1] px-1 py-0.5 font-mono">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
              <kbd className="rounded border border-white/[0.1] px-1 py-0.5 font-mono">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
              <kbd className="rounded border border-white/[0.1] px-1 py-0.5 font-mono">Esc</kbd>
              close
            </span>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  )
}
