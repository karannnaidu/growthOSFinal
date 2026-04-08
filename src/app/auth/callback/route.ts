import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  // `next` is set by the OAuth flow; fall back to /dashboard
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Ensure `next` is a relative path to prevent open-redirect attacks
      const safeNext = next.startsWith('/') ? next : '/dashboard'
      return NextResponse.redirect(`${origin}${safeNext}`)
    }

    console.error('[auth/callback] exchangeCodeForSession error:', error.message)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    )
  }

  // No code present — something went wrong upstream
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('Missing auth code. Please try again.')}`
  )
}
