'use client'

import Image from 'next/image'
import type { HeroSurface } from './landing-content'

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  )
}

export function SurfaceAria({ s }: { s: HeroSurface }) {
  return (
    <div className="p-5 rounded-2xl bg-white border border-[#c6c6cd]/40 shadow-lg space-y-3 w-[320px]">
      <Pill color={s.accentColor}>{s.caption}</Pill>
      <div className="grid grid-cols-2 gap-2">
        <div className="relative h-20 rounded-lg overflow-hidden border border-[#c6c6cd]/30">
          <Image src="/landing/aria-ad-1.jpg" alt="Ad variant 1" fill sizes="160px" className="object-cover" />
        </div>
        <div className="relative h-20 rounded-lg overflow-hidden border border-[#F97316]/40 animate-[pulse_1.2s_ease-out_1]">
          <Image src="/landing/aria-ad-2.jpg" alt="Ad variant 2" fill sizes="160px" className="object-cover" />
          <span className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded bg-[#F97316] text-white text-[9px] font-bold tracking-wider shadow">NEW</span>
        </div>
      </div>
      <p className="text-[13px] leading-snug text-[#45464d]">{s.body}</p>
    </div>
  )
}

export function SurfaceMax({ s }: { s: HeroSurface }) {
  const rows = [
    { name: "Summer v1", roas: '1.4x', status: 'Paused' },
    { name: "UGC hook 3", roas: '3.8x', status: 'Scaling' },
    { name: "Retarget 30d", roas: '5.2x', status: 'Stable' },
  ]
  return (
    <div className="p-5 rounded-2xl bg-white border border-[#c6c6cd]/40 shadow-lg space-y-3 w-[320px]">
      <Pill color={s.accentColor}>{s.caption}</Pill>
      <div className="text-[12px] divide-y divide-[#c6c6cd]/20">
        {rows.map((r, i) => (
          <div
            key={r.name}
            className={`flex justify-between items-center py-2 ${i === 0 ? 'animate-[fadeSlide_300ms_ease-out_1]' : ''}`}
          >
            <span className="text-[#0b1c30] font-medium">{r.name}</span>
            <span className="text-[#45464d]">{r.roas}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                r.status === 'Paused'
                  ? 'bg-amber-100 text-amber-800'
                  : r.status === 'Scaling'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-slate-100 text-slate-700'
              }`}
            >
              {r.status}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[13px] leading-snug text-[#45464d]">{s.body}</p>
    </div>
  )
}

export function SurfaceScout({ s }: { s: HeroSurface }) {
  return (
    <div className="p-5 rounded-2xl bg-white border border-[#c6c6cd]/40 shadow-lg space-y-3 w-[320px]">
      <Pill color={s.accentColor}>
        <span className="relative">
          <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
          <span className="relative block w-1.5 h-1.5 rounded-full bg-red-500" />
        </span>
        {s.caption}
      </Pill>
      <p className="text-[13px] leading-snug text-[#45464d]">{s.body}</p>
    </div>
  )
}

export function SurfaceEcho({ s }: { s: HeroSurface }) {
  return (
    <div className="p-5 rounded-2xl bg-white border border-[#c6c6cd]/40 shadow-lg space-y-3 w-[320px]">
      <Pill color={s.accentColor}>{s.caption}</Pill>
      <div className="grid grid-cols-3 gap-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="relative aspect-video rounded overflow-hidden border border-[#c6c6cd]/30">
            <Image src={`/landing/echo-ad-${i}.jpg`} alt={`Competitor ad ${i}`} fill sizes="96px" className="object-cover" />
          </div>
        ))}
      </div>
      <p className="text-[13px] leading-snug text-[#45464d]">{s.body}</p>
    </div>
  )
}

export function SurfacePenny({ s }: { s: HeroSurface }) {
  return (
    <div className="p-5 rounded-2xl bg-white border border-[#c6c6cd]/40 shadow-lg space-y-3 w-[320px]">
      <Pill color={s.accentColor}>{s.caption}</Pill>
      <svg viewBox="0 0 200 40" className="w-full h-10">
        <polyline
          points="0,32 30,28 60,30 90,22 120,18 150,12 180,8 200,6"
          fill="none"
          stroke={s.accentColor}
          strokeWidth="2"
          strokeLinecap="round"
          style={{ strokeDasharray: 400, strokeDashoffset: 400, animation: 'drawLine 600ms ease-out forwards' }}
        />
      </svg>
      <p className="text-[13px] leading-snug text-[#45464d]">{s.body}</p>
    </div>
  )
}

export function renderSurface(s: HeroSurface) {
  switch (s.id) {
    case 'aria': return <SurfaceAria s={s} />
    case 'max': return <SurfaceMax s={s} />
    case 'scout': return <SurfaceScout s={s} />
    case 'echo': return <SurfaceEcho s={s} />
    case 'penny': return <SurfacePenny s={s} />
  }
}
