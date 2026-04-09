'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Store, CheckCircle2, ArrowRight, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const NEXT_STEPS = [
  'Auto-extract your brand voice and tone',
  'Build full product catalogue context',
  'Run your first store health check',
]

export default function ConnectStorePage() {
  const router = useRouter()
  const [mode, setMode] = useState<'shopify' | 'url' | null>(null)
  const [form, setForm] = useState({ name: '', domain: '' })
  const [loading, setLoading] = useState(false)
  const [shopifyDomain, setShopifyDomain] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleShopifyConnect() {
    if (!shopifyDomain.trim()) {
      setError('Please enter your Shopify store URL')
      return
    }
    setLoading(true)
    setError(null)
    try {
      // We need a brandId first — create a temporary brand via connect-store
      const createRes = await fetch('/api/onboarding/connect-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: shopifyDomain, domain: shopifyDomain }),
      })
      const createData = await createRes.json()
      if (!createRes.ok || !createData.brandId) {
        throw new Error(createData.error ?? 'Failed to create brand')
      }
      const brandId = createData.brandId
      sessionStorage.setItem('onboarding_brand_id', brandId)

      // Now initiate Shopify OAuth
      const res = await fetch('/api/platforms/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, shopDomain: shopifyDomain }),
      })
      const data = await res.json()
      if (!res.ok || !data.data?.redirectUrl) {
        throw new Error(data.error?.message ?? 'Shopify connect failed')
      }
      window.location.href = data.data.redirectUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.domain.trim()) {
      setError('Store name and URL are required')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding/connect-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, domain: form.domain }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create brand')
      sessionStorage.setItem('onboarding_brand_id', data.brandId)
      router.push('/onboarding/focus')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  function handleSkip() {
    router.push('/onboarding/focus')
  }

  return (
    <div className="w-full max-w-lg animate-slide-up">
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
          Step 1 of 4
        </span>
      </div>

      {/* Heading */}
      <div className="text-center mb-10">
        <h1 className="font-heading font-bold text-3xl sm:text-4xl md:text-5xl text-foreground mb-4 tracking-tight">
          Connect your Store
        </h1>
        <p className="text-muted-foreground text-base max-w-md mx-auto leading-relaxed">
          Link your Shopify store so Growth OS can learn your brand.
        </p>
      </div>

      {/* Main card */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6">
        {/* Shopify button */}
        {mode !== 'url' && (
          <div className="space-y-3">
            {mode === 'shopify' ? (
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">
                  Your Shopify store URL
                </label>
                <Input
                  placeholder="yourstore.myshopify.com"
                  value={shopifyDomain}
                  onChange={(e) => setShopifyDomain(e.target.value)}
                  className="bg-transparent border-border/60 focus:border-[#6366f1] text-foreground"
                  onKeyDown={(e) => e.key === 'Enter' && handleShopifyConnect()}
                />
                <Button
                  onClick={handleShopifyConnect}
                  disabled={loading}
                  className="w-full font-semibold"
                  style={{ background: '#10b981', color: '#fff' }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Connecting…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Store className="w-4 h-4" />
                      Connect Shopify Store
                      <ArrowRight className="w-4 h-4 ml-auto" />
                    </span>
                  )}
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setMode('shopify')}
                className="w-full font-semibold"
                style={{ background: '#10b981', color: '#fff' }}
              >
                <Store className="w-4 h-4 mr-2" />
                Connect Shopify Store
              </Button>
            )}
          </div>
        )}

        {/* Divider */}
        {mode !== 'shopify' && mode !== 'url' && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border/50" />
          </div>
        )}

        {/* Manual URL form */}
        {mode !== 'shopify' && (
          mode === 'url' ? (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Store / Brand name
                </label>
                <Input
                  placeholder="Acme Co."
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="bg-transparent border-border/60 focus:border-[#6366f1] text-foreground"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Website URL
                </label>
                <Input
                  placeholder="https://yourstore.com"
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  className="bg-transparent border-border/60 focus:border-[#6366f1] text-foreground"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#6366f1] hover:bg-[#5254cc] text-white font-semibold"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Setting up…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>
          ) : (
            <button
              onClick={() => setMode('url')}
              className="w-full flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 justify-center"
            >
              <Globe className="w-4 h-4" />
              Connect via Website URL
            </button>
          )
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}
      </div>

      {/* What happens next */}
      <div className="mt-6 glass-panel rounded-xl p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
          What happens next
        </p>
        <ul className="space-y-2">
          {NEXT_STEPS.map((step) => (
            <li key={step} className="flex items-start gap-2 text-sm text-foreground/80">
              <CheckCircle2 className="w-4 h-4 text-[#10b981] mt-0.5 flex-shrink-0" />
              {step}
            </li>
          ))}
        </ul>
      </div>

      {/* Skip */}
      <div className="text-center mt-6">
        <button
          onClick={handleSkip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
