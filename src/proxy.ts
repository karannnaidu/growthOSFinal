import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Public paths that do not require authentication
const PUBLIC_PATHS = ['/', '/login', '/signup', '/terms', '/privacy', '/support']
const PUBLIC_PREFIXES = ['/auth/', '/deck/', '/onboarding/']

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true
  return false
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return supabaseResponse
  }

  const supabase = createServerClient(url, key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write cookies onto the request first (for downstream middleware)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Rebuild the response so the updated cookies are forwarded to the browser
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Call getUser() early so the session is refreshed before the
  // response is committed. Do not add any logic between createServerClient and
  // getUser() that might cause an early return.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Protect /dashboard/* routes — redirect unauthenticated users to /login
  if (pathname.startsWith('/dashboard') && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from auth pages to the dashboard
  // Only redirect login/signup, not all public paths — prevents loops
  if ((pathname === '/login' || pathname === '/signup') && user) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    dashboardUrl.searchParams.delete('redirectTo')
    return NextResponse.redirect(dashboardUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Run on all paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
