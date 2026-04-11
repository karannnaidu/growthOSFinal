import Link from 'next/link'

const NAV_LINKS = [
  { label: 'Product', href: '/deck/problem' },
  { label: 'Agents', href: '/deck/aria' },
  { label: 'Pricing', href: '/deck/pricing' },
  { label: 'About', href: '/deck/security' },
]

export default function DeckLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#f8f9ff' }}>
      {/* ── Navbar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-[#e5eeff] bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/deck/problem" className="font-heading text-xl font-bold tracking-tight text-[#0b1c30]">
            Growth OS v2
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-[#45464d] transition-colors hover:text-[#0b1c30]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <Link href="#" className="text-sm font-medium text-[#45464d] hover:text-[#0b1c30]">
              Login
            </Link>
            <Link
              href="#"
              className="rounded-full bg-[#0b1c30] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#111c2d]"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Page Content ──────────────────────────────────────── */}
      <main className="flex-1">{children}</main>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-[#e5eeff] bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 py-12 md:grid-cols-4">
          {/* Col 1 */}
          <div>
            <h4 className="font-heading text-lg font-bold text-[#0b1c30]">Growth OS</h4>
            <p className="mt-2 text-sm leading-relaxed text-[#45464d]">
              AI-powered marketing platform for D2C brands. 12 agents. One dashboard.
            </p>
          </div>

          {/* Col 2 */}
          <div>
            <h5 className="font-heading text-sm font-semibold uppercase tracking-wider text-[#0b1c30]">Product</h5>
            <ul className="mt-3 flex flex-col gap-2">
              <li><Link href="/deck/problem" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Features</Link></li>
              <li><Link href="/deck/aria" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Aria Creative</Link></li>
              <li><Link href="/deck/luna" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Luna Retention</Link></li>
            </ul>
          </div>

          {/* Col 3 */}
          <div>
            <h5 className="font-heading text-sm font-semibold uppercase tracking-wider text-[#0b1c30]">Company</h5>
            <ul className="mt-3 flex flex-col gap-2">
              <li><Link href="#" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Careers</Link></li>
              <li><Link href="#" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Privacy Policy</Link></li>
            </ul>
          </div>

          {/* Col 4 */}
          <div>
            <h5 className="font-heading text-sm font-semibold uppercase tracking-wider text-[#0b1c30]">Resources</h5>
            <ul className="mt-3 flex flex-col gap-2">
              <li><Link href="/deck/pricing" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Pricing</Link></li>
              <li><Link href="/deck/security" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Security</Link></li>
              <li><Link href="/deck/agency" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Agency</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#e5eeff] px-6 py-4">
          <p className="text-center text-xs text-[#45464d]">
            &copy; {new Date().getFullYear()} Growth OS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
