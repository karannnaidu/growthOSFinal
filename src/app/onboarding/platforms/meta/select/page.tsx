import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  META_OAUTH_PENDING_COOKIE,
  type MetaAdAccount,
} from '@/app/api/platforms/meta/callback/route'
import { MetaSelectForm } from './meta-select-form'

interface PendingMetaOAuthPayload {
  brandId: string
  accessToken: string
  returnTo: string
  accounts: MetaAdAccount[]
}

export default async function MetaSelectPage() {
  const cookieStore = await cookies()
  const raw = cookieStore.get(META_OAUTH_PENDING_COOKIE)?.value

  if (!raw) {
    redirect('/onboarding/platforms?error=meta_pending_missing')
  }

  let pending: PendingMetaOAuthPayload
  try {
    pending = JSON.parse(raw) as PendingMetaOAuthPayload
  } catch {
    redirect('/onboarding/platforms?error=meta_pending_invalid')
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
          Pick Meta Ad Account
        </span>
      </div>

      <div className="text-center mb-8">
        <h1 className="font-heading font-bold text-3xl sm:text-4xl text-foreground mb-3 tracking-tight">
          Which ad account should we use?
        </h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
          We found {pending.accounts.length} Meta ad accounts on your profile. Pick the one that
          runs ads for this brand.
        </p>
      </div>

      <MetaSelectForm accounts={pending.accounts} />
    </div>
  )
}
