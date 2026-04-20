'use client'

import Image from 'next/image'
import { useState } from 'react'
import { FOUNDER_NOTE } from './landing-content'
import { useInViewport } from './use-in-viewport'
import { useReducedMotion } from './use-reduced-motion'

function SignatureSvg({ animate }: { animate: boolean }) {
  return (
    <svg viewBox="0 0 240 60" width="180" height="46" className="text-[#6b38d4]">
      <path
        d="M 10 40 Q 22 10, 34 40 T 58 40 M 68 20 Q 82 20, 82 40 T 102 30 M 112 30 L 112 50 M 112 30 Q 120 20, 128 30 M 140 20 Q 152 50, 164 20 M 174 20 L 180 48 L 192 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 400,
          strokeDashoffset: animate ? 0 : 400,
          transition: 'stroke-dashoffset 1200ms ease-out',
        }}
      />
    </svg>
  )
}

export function FounderNote() {
  const { ref, inView } = useInViewport<HTMLDivElement>(0.2)
  const reduced = useReducedMotion()
  const animate = inView && !reduced
  const [imgOk, setImgOk] = useState(Boolean(FOUNDER_NOTE.signatureImage))
  const initial = FOUNDER_NOTE.signatureName.trim().charAt(0).toUpperCase() || 'K'

  return (
    <section ref={ref} className="py-20 bg-[#f8f9ff] border-b border-[#c6c6cd]/10">
      <div className="max-w-2xl mx-auto px-6 space-y-6">
        <div className="space-y-4 text-[#0b1c30] leading-relaxed">
          {FOUNDER_NOTE.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="pt-4 flex items-center gap-4">
          {imgOk ? (
            <Image
              src={FOUNDER_NOTE.signatureImage}
              alt={FOUNDER_NOTE.signatureName}
              width={48}
              height={48}
              className="rounded-full border-2 border-white shadow"
              onError={() => setImgOk(false)}
            />
          ) : (
            <div
              aria-hidden="true"
              className="w-12 h-12 rounded-full border-2 border-white shadow flex items-center justify-center bg-[#6b38d4] text-white font-heading font-bold text-lg"
            >
              {initial}
            </div>
          )}
          <div>
            <SignatureSvg animate={animate} />
            <div className="text-sm text-[#45464d] mt-1">
              {FOUNDER_NOTE.signatureName} · {FOUNDER_NOTE.signatureRole}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
