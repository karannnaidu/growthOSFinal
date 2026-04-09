'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PlatformCard {
  id: string
  name: string
  description: string
  connectEndpoint: string
  logoSrc: string
  accent: string
}

const PLATFORMS: PlatformCard[] = [
  {
    id: 'meta',
    name: 'Meta Ads',
    description: 'Facebook & Instagram advertising',
    connectEndpoint: '/api/platforms/meta/connect',
    logoSrc: '/icons/meta.svg',
    accent: '#3b82f6',
  },
  {
    id: 'google',
    name: 'Google Ads',
    description: 'Search, Shopping & Performance Max',
    connectEndpoint: '/api/platforms/google/connect',
    logoSrc: '/icons/google.svg',
    accent: '#f97316',
  },
]

export default function PlatformsPage() {
  const router = useRouter()
  const [connecting, setConnecting] = useState<string | null>(null)
  const [connected, setConnected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  async function handleConnect(platform: PlatformCard) {
    const brandId = sessionStorage.getItem('onboarding_brand_id')
    setConnecting(platform.id)
    setError(null)
    try {
      const res = await fetch(platform.connectEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: brandId ?? '' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? 'Connect failed')

      if (data.data?.redirectUrl) {
        window.location.href = data.data.redirectUrl
        return
      }
      // If no redirect, mark connected
      setConnected((prev) => new Set([...prev, platform.id]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setConnecting(null)
    }
  }

  return (
    <div className="w-full max-w-xl animate-slide-up">
      {/* Step badge */}
      <div className="flex justify-center mb-6">
        <span
          className="text-xs font-metric font-medium tracking-widest uppercase px-3 py-1 rounded-full border"
          style={{
            borderColor: 'oklch(1 0 0 / 15%)',
            color: 'oklch(0.65 0.02 243)',
            background: 'oklch(1 0 0 / 4%)',
          }}
        >
          Step 3 of 4
        </span>
      </div>

      {/* Heading */}
      <div className="text-center mb-10">
        <h1 className="font-heading font-bold text-3xl sm:text-4xl md:text-5xl text-foreground mb-4 tracking-tight">
          Connect Ad Platforms
        </h1>
        <p className="text-muted-foreground text-base max-w-lg mx-auto leading-relaxed">
          Optional — you can connect ad platforms later from your dashboard.
        </p>
      </div>

      {/* Platform cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {PLATFORMS.map((platform) => {
          const isConnected = connected.has(platform.id)
          const isConnecting = connecting === platform.id
          return (
            <div
              key={platform.id}
              className="glass-panel rounded-2xl p-6 flex flex-col gap-4"
            >
              {/* Platform icon placeholder */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm font-heading"
                style={{
                  background: `${platform.accent}20`,
                  color: platform.accent,
                }}
              >
                {platform.name.slice(0, 1)}
              </div>

              <div>
                <h3 className="font-heading font-semibold text-base text-foreground">
                  {platform.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {platform.description}
                </p>
              </div>

              {isConnected ? (
                <div className="flex items-center gap-2 text-sm text-[#10b981]">
                  <CheckCircle2 className="w-4 h-4" />
                  Connected
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleConnect(platform)}
                  disabled={isConnecting}
                  variant="outline"
                  className="w-full border-border/60 text-foreground hover:bg-white/5"
                >
                  {isConnecting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                      Connecting…
                    </span>
                  ) : (
                    `Connect ${platform.name}`
                  )}
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive text-center mb-4">{error}</p>
      )}

      {/* Security banner */}
      <div
        className="glass-panel rounded-xl px-5 py-4 flex items-start gap-3 mb-8"
        style={{ borderColor: '#10b98130' }}
      >
        <Shield className="w-5 h-5 text-[#10b981] mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">Enterprise-Grade Security</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Read-only OAuth access. We never store passwords. Revoke any time from your
            platform settings.
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          onClick={() => router.push('/onboarding/focus')}
          className="gap-2 border-border/50 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <Button
          onClick={() => router.push('/onboarding/diagnosis')}
          className="gap-2 bg-[#6366f1] hover:bg-[#5254cc] text-white font-semibold px-8"
        >
          {connected.size > 0 ? 'Next' : 'Skip for now'}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
