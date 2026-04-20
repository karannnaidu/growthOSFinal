'use client'

import { PublicNav } from '@/components/landing/public-nav'
import { PublicFooter } from '@/components/landing/public-footer'
import { PricingTable } from '@/components/landing/pricing-table'

export default function PricingPageClient() {
  return (
    <div className="!bg-[#f8f9ff] !text-[#0b1c30] font-body selection:bg-[#e9ddff] selection:text-[#5516be] min-h-screen">
      <PublicNav />
      <main className="pt-20">
        <PricingTable />
      </main>
      <PublicFooter />
    </div>
  )
}
