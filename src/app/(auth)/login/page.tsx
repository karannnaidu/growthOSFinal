'use client'

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Inner component — uses useSearchParams, must be wrapped in Suspense
function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawRedirect = searchParams.get('redirectTo') ?? '/dashboard'
  const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    searchParams.get('error') ? 'Authentication failed. Please try again.' : null
  )

  const supabase = useMemo(() => createClient(), [])

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    router.push(redirectTo)
  }

  async function handleGoogleLogin() {
    setError(null)
    setGoogleLoading(true)

    const callbackUrl = new URL('/auth/callback', window.location.origin)
    callbackUrl.searchParams.set('next', redirectTo)

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
      },
    })

    if (authError) {
      setError(authError.message)
      setGoogleLoading(false)
    }
    // On success Supabase redirects the browser — no further action needed
  }

  return (
    <div className="glass-panel glass-glow rounded-2xl p-8 space-y-6">
      {/* Header */}
      <div className="space-y-1 text-center">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Growth OS
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in to your account
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Email / password form */}
      <form onSubmit={handleEmailLogin} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading || googleLoading}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading || googleLoading}
          />
        </div>

        <Button
          type="submit"
          className="w-full bg-[#6366f1] hover:bg-[#4f52d4] text-white font-semibold"
          disabled={loading || googleLoading}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {/* Divider */}
      <div className="relative flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Google OAuth */}
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2 border-border hover:bg-secondary"
        onClick={handleGoogleLogin}
        disabled={loading || googleLoading}
      >
        {/* Google "G" icon */}
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.705A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.705V4.963H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.007-2.332Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.963L3.964 7.295C4.672 5.163 6.656 3.58 9 3.58Z"
          />
        </svg>
        {googleLoading ? 'Redirecting…' : 'Continue with Google'}
      </Button>

      {/* Footer link */}
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link
          href="/signup"
          className="font-medium text-[#6366f1] hover:text-[#4f52d4] underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  )
}

// Skeleton shown while the form resolves search params
function LoginSkeleton() {
  return (
    <div className="glass-panel glass-glow rounded-2xl p-8 space-y-6 animate-pulse">
      <div className="space-y-1 text-center">
        <div className="mx-auto h-7 w-28 rounded bg-muted" />
        <div className="mx-auto h-4 w-40 rounded bg-muted" />
      </div>
      <div className="space-y-4">
        <div className="h-10 rounded bg-muted" />
        <div className="h-10 rounded bg-muted" />
        <div className="h-10 rounded bg-muted" />
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  )
}
