'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { Ga4Property, GoogleAdsCustomer } from '@/lib/google-admin'

interface GoogleSelectFormProps {
  properties: Ga4Property[]
  adsCustomers: GoogleAdsCustomer[]
}

export function GoogleSelectForm({ properties, adsCustomers }: GoogleSelectFormProps) {
  const router = useRouter()
  const [propertyId, setPropertyId] = useState<string>(properties[0]?.propertyId ?? '')
  const [customerId, setCustomerId] = useState<string>(adsCustomers[0]?.customerId ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!propertyId) {
      setError('Please pick a GA4 property.')
      return
    }
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/platforms/google/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          customer_id: customerId || undefined,
        }),
      })
      const data = (await res.json()) as {
        success: boolean
        error?: { message?: string }
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? 'Failed to save selection')
      }
      router.push('/onboarding/platforms?connected=google')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save selection')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* GA4 properties */}
      <fieldset className="glass-panel rounded-2xl p-5 space-y-3">
        <legend className="px-2 text-sm font-heading font-semibold text-foreground">
          Google Analytics 4 property
        </legend>
        <div className="space-y-2">
          {properties.map((p) => {
            const checked = propertyId === p.propertyId
            return (
              <label
                key={p.propertyId}
                className="flex items-start gap-3 px-3 py-3 rounded-xl cursor-pointer border transition-colors"
                style={{
                  borderColor: checked ? '#6366f1' : 'oklch(1 0 0 / 10%)',
                  background: checked ? 'oklch(0.5 0.18 265 / 8%)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="property_id"
                  value={p.propertyId}
                  checked={checked}
                  onChange={() => setPropertyId(p.propertyId)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {p.accountDisplayName || 'Account'} · {p.displayName || 'Property'}
                  </div>
                  <div className="text-xs text-muted-foreground font-metric mt-0.5">
                    {p.propertyId}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* Google Ads customers (optional) */}
      {adsCustomers.length > 0 && (
        <fieldset className="glass-panel rounded-2xl p-5 space-y-3">
          <legend className="px-2 text-sm font-heading font-semibold text-foreground">
            Google Ads account (optional)
          </legend>
          <div className="space-y-2">
            <label
              className="flex items-start gap-3 px-3 py-3 rounded-xl cursor-pointer border transition-colors"
              style={{
                borderColor: customerId === '' ? '#6366f1' : 'oklch(1 0 0 / 10%)',
                background: customerId === '' ? 'oklch(0.5 0.18 265 / 8%)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="customer_id"
                value=""
                checked={customerId === ''}
                onChange={() => setCustomerId('')}
                className="mt-1"
              />
              <div className="text-sm text-muted-foreground">Skip for now</div>
            </label>
            {adsCustomers.map((c) => {
              const checked = customerId === c.customerId
              return (
                <label
                  key={c.customerId}
                  className="flex items-start gap-3 px-3 py-3 rounded-xl cursor-pointer border transition-colors"
                  style={{
                    borderColor: checked ? '#6366f1' : 'oklch(1 0 0 / 10%)',
                    background: checked ? 'oklch(0.5 0.18 265 / 8%)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="customer_id"
                    value={c.customerId}
                    checked={checked}
                    onChange={() => setCustomerId(c.customerId)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground font-metric">
                      {c.customerId}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {c.resourceName}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        </fieldset>
      )}

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <div className="flex items-center justify-end">
        <Button
          type="submit"
          disabled={submitting || !propertyId}
          className="gap-2 bg-[#6366f1] hover:bg-[#5254cc] text-white font-semibold px-8"
        >
          {submitting ? 'Saving…' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
