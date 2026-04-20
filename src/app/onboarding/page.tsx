'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Onboarding entry.
 *
 * - No query params: route to Step 1 (connect-store) as before.
 * - `?store=<url>` present: skip Step 1. Auto-create the brand from the URL
 *   the user entered on the landing page and jump to /onboarding/extraction.
 * - `?plan=<id>` present: stash plan intent in sessionStorage so the checkout
 *   step later can pre-select it. We do NOT write plan to the brand here —
 *   that must come from a real billing flow.
 */
function OnboardingEntry() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const store = searchParams?.get('store')?.trim() ?? ''
    const plan = searchParams?.get('plan')?.trim() ?? ''

    if (plan) {
      try {
        sessionStorage.setItem('onboarding_intent_plan', plan)
      } catch {
        // sessionStorage disabled — non-fatal
      }
    }

    if (!store) {
      router.replace('/onboarding/connect-store')
      return
    }

    // Normalize + derive a brand name from the hostname.
    const withScheme = /^https?:\/\//i.test(store) ? store : `https://${store}`
    let hostname: string
    try {
      hostname = new URL(withScheme).hostname.replace(/^www\./i, '')
    } catch {
      router.replace('/onboarding/connect-store')
      return
    }
    const brandName = hostname.split('.')[0]
      ?.replace(/[-_]/g, ' ')
      ?.replace(/\b\w/g, (c) => c.toUpperCase()) || hostname

    ;(async () => {
      try {
        const res = await fetch('/api/onboarding/connect-store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: brandName, domain: hostname }),
        })
        const data = await res.json()
        if (!res.ok || !data.brandId) {
          throw new Error(data.error ?? 'Failed to set up your brand')
        }
        try {
          sessionStorage.setItem('onboarding_brand_id', data.brandId)
          sessionStorage.setItem('onboarding_domain', hostname)
        } catch {
          // non-fatal
        }
        router.replace('/onboarding/extraction')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
        // Fall back to the manual step so the user isn't stuck.
        setTimeout(() => router.replace('/onboarding/connect-store'), 1200)
      }
    })()
  }, [router, searchParams])

  return (
    <div className="w-full max-w-md text-center animate-fade-in">
      <div className="mx-auto mb-6 h-10 w-10 rounded-full border-2 border-[#6366f1]/30 border-t-[#6366f1] animate-spin" />
      <h1 className="font-heading font-bold text-2xl text-foreground mb-2">
        Setting up your store…
      </h1>
      <p className="text-sm text-muted-foreground">
        Mia is reading your site. This takes a few seconds.
      </p>
      {error && (
        <p className="mt-4 text-sm text-destructive">
          {error} — redirecting you to manual setup.
        </p>
      )}
    </div>
  )
}

export default function OnboardingIndex() {
  return (
    <Suspense fallback={null}>
      <OnboardingEntry />
    </Suspense>
  )
}
