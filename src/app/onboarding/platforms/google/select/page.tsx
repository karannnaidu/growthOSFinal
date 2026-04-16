import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { GOOGLE_OAUTH_PENDING_COOKIE } from '@/app/api/platforms/google/callback/route'
import type { Ga4Property, GoogleAdsCustomer } from '@/lib/google-admin'
import { GoogleSelectForm } from './google-select-form'

interface PendingOAuthPayload {
  brandId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  properties: Ga4Property[]
  adsCustomers: GoogleAdsCustomer[]
}

export default async function GoogleSelectPage() {
  const cookieStore = await cookies()
  const raw = cookieStore.get(GOOGLE_OAUTH_PENDING_COOKIE)?.value

  if (!raw) {
    redirect('/onboarding/platforms?error=google_pending_missing')
  }

  let pending: PendingOAuthPayload
  try {
    pending = JSON.parse(raw) as PendingOAuthPayload
  } catch {
    redirect('/onboarding/platforms?error=google_pending_invalid')
  }

  return (
    <div className="w-full max-w-xl animate-slide-up">
      <div className="flex justify-center mb-6">
        <span
          className="text-xs font-metric font-medium tracking-widest uppercase px-3 py-1 rounded-full border"
          style={{
            borderColor: 'oklch(1 0 0 / 15%)',
            color: 'oklch(0.65 0.02 243)',
            background: 'oklch(1 0 0 / 4%)',
          }}
        >
          Pick GA4 Property
        </span>
      </div>

      <div className="text-center mb-8">
        <h1 className="font-heading font-bold text-3xl sm:text-4xl text-foreground mb-3 tracking-tight">
          Which property should we use?
        </h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
          We found {pending.properties.length} Google Analytics 4 properties on your account.
          Pick the one that tracks this brand.
        </p>
      </div>

      <GoogleSelectForm
        properties={pending.properties}
        adsCustomers={pending.adsCustomers}
      />
    </div>
  )
}
