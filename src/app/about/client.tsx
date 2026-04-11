'use client'

import Link from 'next/link'
import { PublicNav } from '@/components/landing/public-nav'
import { PublicFooter } from '@/components/landing/public-footer'

export default function AboutPageClient() {
  return (
    <div className="!bg-[#f8f9ff] !text-[#0b1c30] font-body selection:bg-[#e9ddff] selection:text-[#5516be] min-h-screen">
      <PublicNav />
      <main className="pt-20">
        <section className="mx-auto w-full max-w-7xl px-6 py-16">
          <div className="text-center">
            <span className="inline-block rounded-full bg-[#e9ddff] px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#5516be]">
              About
            </span>
            <h1 className="font-heading mt-6 text-4xl font-bold leading-tight text-[#0b1c30] md:text-5xl lg:text-6xl">
              Built for the next generation of D2C founders.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-[#45464d]">
              Growth OS v2 is more than a platform. It&apos;s the competitive advantage you&apos;ve been waiting for. 12 AI agents, one unified dashboard, and the orchestrated intelligence to scale your brand.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            <div className="rounded-[40px] border border-white/60 bg-white/80 backdrop-blur-[20px] p-8 text-center">
              <p className="font-heading text-4xl font-bold text-[#6b38d4]">12</p>
              <p className="mt-2 text-sm text-[#45464d]">Specialized AI Agents</p>
            </div>
            <div className="rounded-[40px] border border-white/60 bg-white/80 backdrop-blur-[20px] p-8 text-center">
              <p className="font-heading text-4xl font-bold text-[#6b38d4]">50+</p>
              <p className="mt-2 text-sm text-[#45464d]">Marketing Skills</p>
            </div>
            <div className="rounded-[40px] border border-white/60 bg-white/80 backdrop-blur-[20px] p-8 text-center">
              <p className="font-heading text-4xl font-bold text-[#6b38d4]">24/7</p>
              <p className="mt-2 text-sm text-[#45464d]">Autonomous Operation</p>
            </div>
          </div>

          <div className="mt-16 text-center">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-[#0b1c30] text-white px-10 py-5 rounded-xl font-heading font-bold text-lg hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-black/10"
            >
              Get Started Free
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
