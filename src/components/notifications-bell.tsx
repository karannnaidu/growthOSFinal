'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationType = 'needs_review' | 'auto_completed' | 'insight' | 'alert' | 'system'

interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string
  read: boolean
  created_at: string
  action_url: string | null
  agent_id: string | null
}

// ---------------------------------------------------------------------------
// Accent colours
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<NotificationType, string> = {
  needs_review: '#F59E0B',   // amber
  auto_completed: '#10B981', // green
  insight: '#14B8A6',        // teal
  alert: '#EF4444',          // red
  system: '#64748B',         // gray
}

const AGENT_COLORS: Record<string, string> = {
  mia: '#6366F1',
  scout: '#0D9488',
  aria: '#F97316',
  luna: '#10B981',
  hugo: '#D97706',
  sage: '#8B5CF6',
  max: '#3B82F6',
  atlas: '#E11D48',
  echo: '#64748B',
  nova: '#7C3AED',
  navi: '#0EA5E9',
  penny: '#059669',
}

// ---------------------------------------------------------------------------
// Time-ago helper
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NotificationsBellProps {
  brandId?: string | null
}

export function NotificationsBell({ brandId }: NotificationsBellProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [notifications, setNotifications] = React.useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchNotifications = React.useCallback(async () => {
    if (!brandId) return
    try {
      setLoading(true)
      const res = await fetch(`/api/notifications?brandId=${brandId}&limit=20`)
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch {
      // Non-fatal
    } finally {
      setLoading(false)
    }
  }, [brandId])

  // Initial fetch + polling every 30s
  React.useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on Escape
  React.useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function markAsRead(notifId: string) {
    try {
      await fetch(`/api/notifications/${notifId}/read`, { method: 'PATCH' })
      setNotifications(prev =>
        prev.map(n => (n.id === notifId ? { ...n, read: true } : n))
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {
      // Non-fatal
    }
  }

  async function markAllAsRead() {
    const unread = notifications.filter(n => !n.read)
    await Promise.all(unread.map(n => markAsRead(n.id)))
  }

  function handleNotificationClick(n: Notification) {
    if (!n.read) markAsRead(n.id)
    if (n.action_url) router.push(n.action_url)
    setOpen(false)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          role="region"
          aria-label="Notifications panel"
          className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0f1117]/95 shadow-2xl backdrop-blur-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[11px] text-[#6366f1] hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="mx-auto h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications yet
              </p>
            ) : (
              notifications.map(n => {
                const dotColor = n.agent_id
                  ? (AGENT_COLORS[n.agent_id] ?? TYPE_COLORS[n.type])
                  : TYPE_COLORS[n.type]

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-75 hover:bg-white/[0.04]',
                      !n.read && 'bg-white/[0.02]'
                    )}
                  >
                    {/* Agent/type color dot */}
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: dotColor }}
                      aria-hidden="true"
                    />

                    {/* Content */}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {n.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/70">
                        {n.body}
                      </span>
                      <span className="mt-1 block text-[10px] text-muted-foreground/50">
                        {timeAgo(n.created_at)}
                      </span>
                    </span>

                    {/* Unread indicator */}
                    {!n.read && (
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
                        aria-label="Unread"
                      />
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-white/[0.06] px-4 py-2.5">
              <button
                type="button"
                onClick={() => {
                  router.push('/dashboard/notifications')
                  setOpen(false)
                }}
                className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
