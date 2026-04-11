'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Users, UserPlus, Trash2, RefreshCw } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMember {
  id: string
  user_id: string
  brand_id: string
  role: 'admin' | 'member' | string
  email?: string
  full_name?: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamSettingsPage() {
  const supabase = createClient()

  const [brandId, setBrandId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [isInviting, setIsInviting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Resolve brand
  useEffect(() => {
    async function init() {
      // Always fetch from API to get the canonical brand ID
      try {
        const res = await fetch('/api/brands/me')
        if (res.ok) {
          const data = await res.json()
          if (data.brandId) {
            setBrandId(data.brandId)
            localStorage.setItem('growth_os_brand_id', data.brandId)
            sessionStorage.setItem('onboarding_brand_id', data.brandId)
            return
          }
        }
      } catch { /* ignore */ }
      // Fallback to cached (only if API fails)
      const stored = sessionStorage.getItem('onboarding_brand_id') || localStorage.getItem('growth_os_brand_id')
      if (stored) setBrandId(stored)
    }
    init()
  }, [])

  const fetchMembers = useCallback(async (bid: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/settings/team?brandId=${bid}`)
      if (res.ok) {
        const data = await res.json() as { members: TeamMember[] }
        setMembers(data.members ?? [])
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (brandId) fetchMembers(brandId)
  }, [brandId, fetchMembers])

  async function handleInvite() {
    if (!brandId || !inviteEmail.trim()) return
    setIsInviting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, email: inviteEmail.trim(), role: inviteRole }),
      })
      const data = await res.json() as { error?: string; member?: TeamMember }
      if (res.ok) {
        setMessage({ type: 'success', text: `Invitation sent to ${inviteEmail}.` })
        setInviteEmail('')
        fetchMembers(brandId)
      } else {
        setMessage({ type: 'error', text: data.error ?? 'Failed to invite member.' })
      }
    } finally {
      setIsInviting(false)
      setTimeout(() => setMessage(null), 5000)
    }
  }

  async function handleRemove(memberId: string) {
    if (!brandId) return
    setRemovingId(memberId)
    try {
      const { error } = await supabase
        .from('brand_members')
        .delete()
        .eq('id', memberId)
      if (!error) {
        setMembers((prev) => prev.filter((m) => m.id !== memberId))
      }
    } finally {
      setRemovingId(null)
    }
  }

  const roleLabel = (role: string) =>
    role === 'admin' ? 'Admin' : 'Member'

  const roleColor = (role: string) =>
    role === 'admin' ? 'text-[#f97316]' : 'text-muted-foreground'

  return (
    <div className="max-w-2xl space-y-5">
      {/* Feedback */}
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-[#059669]/30 bg-[#059669]/10 text-[#059669]'
              : 'border-[#ef4444]/30 bg-[#ef4444]/10 text-[#ef4444]'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Member list */}
      <Card className="glass-panel">
        <CardHeader className="border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6366f1]/15">
              <Users className="h-4 w-4 text-[#6366f1]" />
            </div>
            <CardTitle>Team Members</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-2">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[0.04]" />
            ))
          ) : !members.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No team members yet. Invite someone below.
            </p>
          ) : (
            members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                {/* Avatar */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6366f1]/20 text-xs font-semibold text-[#6366f1] uppercase">
                  {(member.full_name ?? member.email ?? '?')[0]}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {member.full_name ?? member.email ?? member.user_id}
                  </p>
                  {member.email && member.full_name && (
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  )}
                </div>

                <span className={`text-xs font-medium ${roleColor(member.role)}`}>
                  {roleLabel(member.role)}
                </span>

                {/* Remove button — can't remove yourself */}
                {member.user_id !== currentUserId && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemove(member.id)}
                    disabled={removingId === member.id}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove member"
                  >
                    {removingId === member.id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Invite form */}
      <Card className="glass-panel">
        <CardHeader className="border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#059669]/15">
              <UserPlus className="h-4 w-4 text-[#059669]" />
            </div>
            <CardTitle>Invite Member</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Email address</label>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Role</label>
            <div className="flex gap-2">
              {(['member', 'admin'] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => setInviteRole(role)}
                  className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
                    inviteRole === role
                      ? 'border-[#6366f1]/50 bg-[#6366f1]/15 text-[#6366f1]'
                      : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {role === 'admin' ? 'Admin' : 'Member'}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Admins can manage settings and billing. Members can use agents.
            </p>
          </div>

          <Button
            onClick={handleInvite}
            disabled={isInviting || !inviteEmail.trim()}
            className="bg-[#6366f1] text-white hover:bg-[#6366f1]/80"
          >
            {isInviting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            {isInviting ? 'Inviting...' : 'Send Invite'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
