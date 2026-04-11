'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { label: 'Product', href: '/' },
  { label: 'Market', href: '/market' },
  { label: 'Agents', href: '/agents' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Security', href: '/security' },
  { label: 'Agency', href: '/agency' },
  { label: 'About', href: '/about' },
]

export function PublicNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md shadow-sm">
      <div className="flex justify-between items-center max-w-7xl mx-auto px-6 h-20">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold tracking-tighter text-slate-900 font-heading">
          Growth OS v2
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center space-x-6 font-heading font-semibold text-sm tracking-tight text-slate-500">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === '/'
                ? pathname === '/'
                : pathname.startsWith(link.href)

            return (
              <Link
                key={link.label}
                href={link.href}
                className={
                  isActive
                    ? 'text-slate-900 border-b-2 border-slate-900 pb-1'
                    : 'hover:text-purple-600 transition-colors duration-300'
                }
              >
                {link.label}
              </Link>
            )
          })}
        </div>

        {/* Auth buttons */}
        <div className="flex items-center space-x-4">
          <Link
            href="/login"
            className="text-slate-900 font-heading font-semibold text-sm hover:opacity-80 transition-opacity"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="bg-[#0b1c30] text-white px-5 py-2.5 rounded-md font-heading font-semibold text-sm active:opacity-80 transition-transform"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  )
}
