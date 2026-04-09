'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export default function VerifyEmailPage() {
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = useMemo(() => createClient(), [])

  async function handleResend() {
    setError(null)
    setResending(true)

    // Try to get current session email
    const { data: { session } } = await supabase.auth.getSession()
    const email = session?.user?.email

    if (!email) {
      setError('No email found. Please sign up again.')
      setResending(false)
      return
    }

    const { error: authError } = await supabase.auth.resend({
      type: 'signup',
      email,
    })

    if (authError) {
      setError(authError.message)
    } else {
      setResent(true)
    }
    setResending(false)
  }

  return (
    <div className="glass-panel glass-glow rounded-2xl p-8 space-y-6 text-center">
      {/* Icon */}
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#6366f1]/15">
        <svg
          className="h-7 w-7 text-[#6366f1]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>

      {/* Heading */}
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Verify your email
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          We&apos;ve sent a confirmation link to your email address.
          Please check your inbox and click the link to activate your account.
        </p>
      </div>

      {/* Tips */}
      <div className="glass-panel rounded-xl p-4 text-left space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
          Didn&apos;t receive it?
        </p>
        <ul className="text-sm text-muted-foreground space-y-1.5">
          <li className="flex items-start gap-2">
            <span className="text-[#6366f1] mt-0.5">1.</span>
            Check your spam or junk folder
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#6366f1] mt-0.5">2.</span>
            Make sure you entered the correct email
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#6366f1] mt-0.5">3.</span>
            Click the button below to resend
          </li>
        </ul>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Resend button */}
      <Button
        onClick={handleResend}
        disabled={resending || resent}
        variant="outline"
        className="w-full gap-2 border-border hover:bg-secondary"
      >
        {resent
          ? 'Email resent! Check your inbox.'
          : resending
            ? 'Resending...'
            : 'Resend verification email'}
      </Button>

      {/* Footer links */}
      <div className="flex items-center justify-center gap-4 text-sm">
        <Link
          href="/login"
          className="font-medium text-[#6366f1] hover:text-[#4f52d4] underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
        <span className="text-muted-foreground">or</span>
        <Link
          href="/signup"
          className="font-medium text-[#6366f1] hover:text-[#4f52d4] underline-offset-4 hover:underline"
        >
          Sign up again
        </Link>
      </div>
    </div>
  )
}
