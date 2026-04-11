'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Link2, Unlink, RefreshCw, CheckCircle2, Circle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlatformStatus =
  | { connected: true; connectedAt: string; [key: string]: unknown }
  | { connected: false }

interface PlatformConfig {
  id: string
  label: string
  description: string
  color: string
  oauth?: boolean
  connectFields?: { key: string; label: string; placeholder: string }[]
}

// ---------------------------------------------------------------------------
// Platform definitions
// ---------------------------------------------------------------------------

const PLATFORMS: PlatformConfig[] = [
  {
    id: 'shopify',
    label: 'Shopify',
    description: 'Sync orders, products, and customers',
    color: '#96bf48',
    connectFields: [
      { key: 'shop', label: 'Shop domain', placeholder: 'your-store.myshopify.com' },
      { key: 'access_token', label: 'Access token', placeholder: 'shppa_...' },
    ],
  },
  {
    id: 'meta',
    label: 'Meta Ads',
    description: 'Facebook & Instagram advertising data',
    color: '#1877f2',
    oauth: true,
  },
  {
    id: 'google',
    label: 'Google Ads',
    description: 'Google Ads and Analytics integration',
    color: '#4285f4',
    connectFields: [
      { key: 'refresh_token', label: 'Refresh token', placeholder: '1//...' },
      { key: 'customer_id', label: 'Customer ID', placeholder: '123-456-7890' },
    ],
  },
  {
    id: 'klaviyo',
    label: 'Klaviyo',
    description: 'Email marketing flows and lists',
    color: '#1b4f72',
    connectFields: [
      { key: 'api_key', label: 'API key', placeholder: 'pk_...' },
    ],
  },
  {
    id: 'snapchat',
    label: 'Snapchat Ads',
    description: 'Snapchat advertising campaigns',
    color: '#fffc00',
    connectFields: [
      { key: 'access_token', label: 'Access token', placeholder: '' },
      { key: 'ad_account_id', label: 'Ad account ID', placeholder: '' },
    ],
  },
  {
    id: 'chatgpt_ads',
    label: 'ChatGPT Ads',
    description: 'AI-powered ad generation (coming soon)',
    color: '#74aa9c',
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlatformsSettingsPage() {
  const supabase = createClient()

  const [brandId, setBrandId] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, PlatformStatus>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({})
  const [connecting, setConnecting] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Resolve brand via API (bypasses RLS)
  useEffect(() => {
    async function init() {
      const stored = sessionStorage.getItem('onboarding_brand_id') || localStorage.getItem('growth_os_brand_id')
      if (stored) { setBrandId(stored); return }
      try {
        const res = await fetch('/api/brands/me')
        if (res.ok) {
          const data = await res.json()
          if (data.brandId) {
            setBrandId(data.brandId)
            localStorage.setItem('growth_os_brand_id', data.brandId)
          }
        }
      } catch { /* ignore */ }
    }
    init()
  }, [])

  // Fetch platform statuses
  useEffect(() => {
    if (!brandId) return
    async function fetchStatuses() {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/platforms/status?brandId=${brandId}`)
        if (res.ok) {
          const data = await res.json() as { success: boolean; data: Record<string, PlatformStatus> }
          if (data.success) setStatuses(data.data)
        }
      } finally {
        setIsLoading(false)
      }
    }
    fetchStatuses()
  }, [brandId])

  function setField(platformId: string, key: string, value: string) {
    setFieldValues((prev) => ({
      ...prev,
      [platformId]: { ...(prev[platformId] ?? {}), [key]: value },
    }))
  }

  async function handleConnect(platformId: string) {
    if (!brandId) return
    setConnecting(platformId)
    setMessage(null)
    try {
      const fields = fieldValues[platformId] ?? {}
      const res = await fetch(`/api/platforms/${platformId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, ...fields }),
      })
      const data = await res.json() as { success?: boolean; data?: { redirectUrl?: string }; error?: { message?: string } }
      if (res.ok && data.success) {
        // OAuth flow — redirect to provider
        if (data.data?.redirectUrl) {
          window.location.href = data.data.redirectUrl
          return
        }
        setMessage({ type: 'success', text: `${platformId} connected successfully.` })
        // Refresh statuses
        const statusRes = await fetch(`/api/platforms/status?brandId=${brandId}`)
        if (statusRes.ok) {
          const statusData = await statusRes.json() as { success: boolean; data: Record<string, PlatformStatus> }
          if (statusData.success) setStatuses(statusData.data)
        }
        setExpandedPlatform(null)
      } else {
        setMessage({ type: 'error', text: data.error?.message ?? 'Connection failed.' })
      }
    } finally {
      setConnecting(null)
      setTimeout(() => setMessage(null), 5000)
    }
  }

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

      <Card className="glass-panel">
        <CardHeader className="border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6366f1]/15">
              <Link2 className="h-4 w-4 text-[#6366f1]" />
            </div>
            <CardTitle>Platform Connections</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
            ))
          ) : (
            PLATFORMS.map((platform) => {
              const status = statuses[platform.id] ?? { connected: false }
              const isConnected = status.connected
              const isExpanded = expandedPlatform === platform.id
              const isComingSoon = !platform.connectFields

              return (
                <div
                  key={platform.id}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden"
                >
                  {/* Platform row */}
                  <div className="flex items-center gap-4 p-4">
                    {/* Color dot */}
                    <div
                      className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${platform.color}20` }}
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: platform.color }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{platform.label}</p>
                      <p className="text-xs text-muted-foreground">{platform.description}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isConnected ? (
                        <>
                          <span className="flex items-center gap-1 text-xs text-[#059669]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Connected
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            title="Disconnect"
                          >
                            <Unlink className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : isComingSoon ? (
                        <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-xs text-muted-foreground">
                          Coming soon
                        </span>
                      ) : (
                        <>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Circle className="h-3.5 w-3.5" />
                            Not connected
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setExpandedPlatform(isExpanded ? null : platform.id)
                            }
                          >
                            Connect
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded connect form */}
                  {isExpanded && !isConnected && (
                    <div className="border-t border-white/[0.06] p-4 space-y-3 bg-white/[0.02]">
                      {platform.oauth ? (
                        /* OAuth platforms — single button */
                        <div className="flex flex-col items-center gap-3 py-2">
                          <p className="text-xs text-muted-foreground text-center">
                            Click below to securely connect your {platform.label} account. You&apos;ll be redirected to authorize access.
                          </p>
                          <Button
                            size="sm"
                            onClick={() => handleConnect(platform.id)}
                            disabled={connecting === platform.id}
                            style={{ background: platform.color }}
                            className="text-white hover:opacity-90"
                          >
                            {connecting === platform.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Link2 className="h-3.5 w-3.5" />
                            )}
                            {connecting === platform.id ? 'Redirecting...' : `Connect with ${platform.label}`}
                          </Button>
                        </div>
                      ) : platform.connectFields ? (
                        /* Manual credential entry */
                        <>
                          {platform.connectFields.map((field) => (
                            <div key={field.key} className="space-y-1.5">
                              <label className="text-xs font-medium text-muted-foreground">
                                {field.label}
                              </label>
                              <Input
                                value={fieldValues[platform.id]?.[field.key] ?? ''}
                                onChange={(e) => setField(platform.id, field.key, e.target.value)}
                                placeholder={field.placeholder}
                              />
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              onClick={() => handleConnect(platform.id)}
                              disabled={connecting === platform.id}
                              className="bg-[#6366f1] text-white hover:bg-[#6366f1]/80"
                            >
                              {connecting === platform.id ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Link2 className="h-3.5 w-3.5" />
                              )}
                              {connecting === platform.id ? 'Connecting...' : 'Save Connection'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedPlatform(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
