'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

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
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md shadow-sm">
      <div className="flex justify-between items-center max-w-7xl mx-auto px-6 h-20">
        <Link href="/" className="text-xl font-bold tracking-tighter text-slate-900 font-heading">
          Growth OS v2
        </Link>

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

        <div className="flex items-center space-x-3 sm:space-x-4">
          <Link
            href="/login"
            className="hidden sm:inline text-slate-900 font-heading font-semibold text-sm hover:opacity-80 transition-opacity"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="hidden sm:inline-flex bg-[#0b1c30] text-white px-5 py-2.5 rounded-md font-heading font-semibold text-sm active:opacity-80 transition-transform"
          >
            Get Started
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-md text-slate-900 hover:bg-slate-100 transition-colors"
          >
            {open ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        className={`md:hidden overflow-hidden border-t border-slate-200/60 bg-white/95 backdrop-blur-md transition-[max-height,opacity] duration-300 ${
          open ? 'max-h-[80vh] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-6 py-4 flex flex-col gap-1 font-heading font-semibold text-base">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === '/'
                ? pathname === '/'
                : pathname.startsWith(link.href)
            return (
              <Link
                key={link.label}
                href={link.href}
                className={`py-3 px-2 rounded-md transition-colors ${
                  isActive ? 'text-[#6b38d4] bg-[#e9ddff]/50' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
          <div className="h-px bg-slate-200/70 my-3" />
          <Link href="/login" className="py-3 px-2 text-slate-700">
            Login
          </Link>
          <Link
            href="/signup"
            className="mt-1 bg-[#0b1c30] text-white text-center py-3 rounded-md"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  )
}
