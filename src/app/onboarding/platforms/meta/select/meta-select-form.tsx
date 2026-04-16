'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { MetaAdAccount } from '@/app/api/platforms/meta/callback/route'

interface MetaSelectFormProps {
  accounts: MetaAdAccount[]
}

export function MetaSelectForm({ accounts }: MetaSelectFormProps) {
  const router = useRouter()
  const [adAccountId, setAdAccountId] = useState<string>(accounts[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!adAccountId) {
      setError('Please pick a Meta ad account.')
      return
    }
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/platforms/meta/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adAccountId }),
      })
      const data = (await res.json()) as {
        ok: boolean
        error?: { message?: string }
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message ?? 'Failed to save selection')
      }
      router.push('/onboarding/platforms?connected=meta')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save selection')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="glass-panel rounded-2xl p-5 space-y-3">
        <legend className="px-2 text-sm font-heading font-semibold text-foreground">
          Meta ad account
        </legend>
        <div className="space-y-2">
          {accounts.map((a) => {
            const checked = adAccountId === a.id
            const inactive = a.account_status !== 1
            return (
              <label
                key={a.id}
                className="flex items-start gap-3 px-3 py-3 rounded-xl cursor-pointer border transition-colors"
                style={{
                  borderColor: checked ? '#6366f1' : 'oklch(1 0 0 / 10%)',
                  background: checked ? 'oklch(0.5 0.18 265 / 8%)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="adAccountId"
                  value={a.id}
                  checked={checked}
                  onChange={() => setAdAccountId(a.id)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {a.name || 'Unnamed account'}
                    <span className="text-muted-foreground font-metric">
                      {' · '}
                      {a.id}
                      {a.currency ? ` · ${a.currency}` : ''}
                    </span>
                  </div>
                  {inactive && (
                    <div
                      className="text-xs mt-1 font-metric"
                      style={{ color: 'oklch(0.72 0.17 55)' }}
                    >
                      Inactive — Meta won&apos;t serve ads on this account
                    </div>
                  )}
                </div>
              </label>
            )
          })}
        </div>
      </fieldset>

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      <div className="flex items-center justify-end">
        <Button
          type="submit"
          disabled={submitting || !adAccountId}
          className="gap-2 bg-[#6366f1] hover:bg-[#5254cc] text-white font-semibold px-8"
        >
          {submitting ? 'Saving…' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
