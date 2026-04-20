'use client'

import Image from 'next/image'
import Link from 'next/link'
import { PublicNav } from './public-nav'
import { PublicFooter } from './public-footer'
import { AGENCY_FEATURES, AGENCY_ORBIT_BRANDS } from './landing-content'
import { useReducedMotion } from './use-reduced-motion'
import { useInViewport } from './use-in-viewport'

function OrbitHero() {
  const reduced = useReducedMotion()
  const n = AGENCY_ORBIT_BRANDS.length
  const size = 420
  const center = size / 2
  const radius = 180

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      {/* Center Mia */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-xl z-10">
        <Image
          src="/agents/mia.png"
          alt="Mia"
          width={112}
          height={112}
          className="object-cover w-full h-full"
        />
      </div>

      {/* Orbit ring — slowly spins */}
      <div
        className="absolute inset-0 rounded-full border border-dashed border-[#6b38d4]/30"
        style={{ animation: reduced ? 'none' : 'orbitSpin 40s linear infinite' }}
      >
        {AGENCY_ORBIT_BRANDS.map((brand, i) => {
          const angle = (i * 360) / n - 90
          const rad = (angle * Math.PI) / 180
          const x = center + radius * Math.cos(rad)
          const y = center + radius * Math.sin(rad)
          return (
            <div
              key={brand.id}
              className="absolute px-3 py-1.5 rounded-full bg-white border border-[#c6c6cd]/30 shadow text-xs font-semibold text-[#0b1c30] whitespace-nowrap"
              style={{
                left: x,
                top: y,
                transform: 'translate(-50%, -50%)',
                animation: reduced ? 'none' : 'orbitSpinReverse 40s linear infinite',
              }}
            >
              {brand.label}
            </div>
          )
        })}
      </div>

      {/* Soft halo */}
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[#6b38d4]/5 blur-2xl" />
    </div>
  )
}

export default function AgencyPage() {
  const { ref, inView } = useInViewport<HTMLDivElement>(0.15)
  const reduced = useReducedMotion()

  return (
    <div className="!bg-[#f8f9ff] !text-[#0b1c30] font-body selection:bg-[#e9ddff] selection:text-[#5516be] min-h-screen">
      <PublicNav />
      <main className="pt-20">
        {/* Hero */}
        <section className="py-16">
          <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-5">
              <span className="inline-block rounded-full bg-[#e9ddff] px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#5516be]">
                For Agencies
              </span>
              <h1 className="font-heading font-bold text-4xl md:text-5xl lg:text-6xl text-[#0b1c30] leading-[1.05]">
                One crew. <span className="text-[#6b38d4]">Many brands.</span>
              </h1>
              <p className="text-lg text-[#45464d] max-w-xl">
                Spin up the full Growth OS crew per client. White-labeled, isolated, billed centrally. Run 50 brands from one seat.
              </p>
              <div className="flex gap-3">
                <Link
                  href="/signup?agency=true"
                  className="inline-flex bg-[#0b1c30] text-white px-6 py-3 rounded-xl font-bold hover:-translate-y-[2px] hover:shadow-xl active:scale-95 transition-all"
                >
                  Book agency demo
                </Link>
              </div>
            </div>
            <OrbitHero />
          </div>
        </section>

        {/* Feature grid */}
        <section ref={ref} className="py-16 bg-white">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="font-heading font-bold text-3xl md:text-4xl text-center text-[#0b1c30] mb-10">
              Built for agencies, not retrofitted.
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {AGENCY_FEATURES.map((f, i) => (
                <div
                  key={f.id}
                  className="p-6 rounded-2xl bg-white border border-[#c6c6cd]/40 hover:-translate-y-1 hover:shadow-xl transition-all"
                  style={{
                    animation:
                      inView && !reduced ? `fadeSlide 400ms ease-out ${i * 80}ms both` : 'none',
                    opacity: inView || reduced ? 1 : 0,
                  }}
                >
                  <h3 className="font-heading font-bold text-lg text-[#0b1c30]">{f.title}</h3>
                  <p className="mt-2 text-sm text-[#45464d] leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
