import Link from 'next/link'

export function PublicFooter() {
  return (
    <footer className="border-t border-[#e5eeff] bg-white">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 py-12 md:grid-cols-4">
        <div>
          <h4 className="font-heading text-lg font-bold text-[#0b1c30]">Growth OS</h4>
          <p className="mt-2 text-sm leading-relaxed text-[#45464d]">
            AI-powered marketing platform for D2C brands. 12 agents. One dashboard.
          </p>
        </div>
        <div>
          <h5 className="font-heading text-sm font-semibold uppercase tracking-wider text-[#0b1c30]">Product</h5>
          <ul className="mt-3 flex flex-col gap-2">
            <li><Link href="/" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Features</Link></li>
            <li><Link href="/agents" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Agents</Link></li>
            <li><Link href="/pricing" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Pricing</Link></li>
          </ul>
        </div>
        <div>
          <h5 className="font-heading text-sm font-semibold uppercase tracking-wider text-[#0b1c30]">Company</h5>
          <ul className="mt-3 flex flex-col gap-2">
            <li><Link href="/about" className="text-sm text-[#45464d] hover:text-[#6b38d4]">About</Link></li>
            <li><Link href="/privacy" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Privacy Policy</Link></li>
            <li><Link href="/terms" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Terms</Link></li>
          </ul>
        </div>
        <div>
          <h5 className="font-heading text-sm font-semibold uppercase tracking-wider text-[#0b1c30]">Resources</h5>
          <ul className="mt-3 flex flex-col gap-2">
            <li><Link href="/changelog" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Changelog</Link></li>
            <li><Link href="/market" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Market</Link></li>
            <li><Link href="/support" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Support</Link></li>
            <li><Link href="mailto:hello@growthOS.ai" className="text-sm text-[#45464d] hover:text-[#6b38d4]">Contact</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[#e5eeff] px-6 py-4">
        <p className="text-center text-xs text-[#45464d]">
          &copy; {new Date().getFullYear()} Growth OS. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
