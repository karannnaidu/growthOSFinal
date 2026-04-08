'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Building2, Save, RefreshCw } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrandProfile {
  name: string
  domain: string
  logo_url: string
  focus_areas: string[]
}

const FOCUS_AREA_OPTIONS = [
  'Email Marketing',
  'Paid Ads',
  'SEO & Content',
  'Social Media',
  'Retention',
  'Conversion Rate',
  'Customer Research',
  'Analytics',
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfileSettingsPage() {
  const supabase = createClient()

  const [brandId, setBrandId] = useState<string | null>(null)
  const [profile, setProfile] = useState<BrandProfile>({
    name: '',
    domain: '',
    logo_url: '',
    focus_areas: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Resolve brand
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: ownedBrand } = await supabase
        .from('brands')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1)
        .single()

      if (ownedBrand) {
        setBrandId(ownedBrand.id as string)
        return
      }

      const { data: member } = await supabase
        .from('brand_members')
        .select('brand_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      if (member) setBrandId(member.brand_id as string)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch profile
  useEffect(() => {
    if (!brandId) return
    async function fetchProfile() {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/settings/profile?brandId=${brandId}`)
        if (res.ok) {
          const data = await res.json() as BrandProfile
          setProfile(data)
        }
      } finally {
        setIsLoading(false)
      }
    }
    fetchProfile()
  }, [brandId])

  function toggleFocusArea(area: string) {
    setProfile((prev) => ({
      ...prev,
      focus_areas: prev.focus_areas.includes(area)
        ? prev.focus_areas.filter((a) => a !== area)
        : [...prev.focus_areas, area],
    }))
  }

  async function handleSave() {
    if (!brandId) return
    setIsSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, ...profile }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: 'Profile saved successfully.' })
      } else {
        const err = await res.json() as { error?: string }
        setMessage({ type: 'error', text: err.error ?? 'Failed to save profile.' })
      }
    } finally {
      setIsSaving(false)
      setTimeout(() => setMessage(null), 4000)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Feedback message */}
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

      <Card className="glass-panel">
        <CardHeader className="border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6366f1]/15">
              <Building2 className="h-4 w-4 text-[#6366f1]" />
            </div>
            <CardTitle>Brand Profile</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded-lg bg-white/[0.06]" />
              ))}
            </div>
          ) : (
            <>
              {/* Brand Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Brand Name</label>
                <Input
                  value={profile.name}
                  onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Acme Co."
                />
              </div>

              {/* Domain */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Domain</label>
                <Input
                  value={profile.domain}
                  onChange={(e) => setProfile((p) => ({ ...p, domain: e.target.value }))}
                  placeholder="e.g. acme.com"
                />
              </div>

              {/* Logo URL */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Logo URL</label>
                <Input
                  value={profile.logo_url}
                  onChange={(e) => setProfile((p) => ({ ...p, logo_url: e.target.value }))}
                  placeholder="https://..."
                />
                {profile.logo_url && (
                  <div className="mt-2 flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={profile.logo_url}
                      alt="Brand logo preview"
                      className="h-10 w-10 rounded-lg object-contain border border-white/[0.08]"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <span className="text-xs text-muted-foreground">Logo preview</span>
                  </div>
                )}
              </div>

              {/* Focus Areas */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Focus Areas</label>
                <p className="text-xs text-muted-foreground">
                  Select the areas you want Growth OS agents to prioritize.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {FOCUS_AREA_OPTIONS.map((area) => {
                    const active = profile.focus_areas.includes(area)
                    return (
                      <button
                        key={area}
                        onClick={() => toggleFocusArea(area)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          active
                            ? 'border-[#6366f1]/50 bg-[#6366f1]/15 text-[#6366f1]'
                            : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {area}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Save */}
              <div className="pt-2">
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-[#6366f1] text-white hover:bg-[#6366f1]/80"
                >
                  {isSaving ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {isSaving ? 'Saving...' : 'Save Profile'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
