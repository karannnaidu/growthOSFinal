'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HERO_CONTENT } from './landing-content'
import { useReducedMotion } from './use-reduced-motion'

type Size = 'hero' | 'default' | 'final'

// Mobile gets explicitly larger inputs (chunky touch targets, 17px+ font to
// avoid iOS auto-zoom on focus) — desktop sizes kick in at sm: and up.
const SIZE_CLASSES: Record<Size, { input: string; button: string; wrap: string }> = {
  hero: {
    wrap: 'flex flex-col sm:flex-row gap-3 w-full max-w-xl',
    input: 'h-[68px] text-[17px] sm:h-16 sm:text-lg px-5',
    button: 'h-[68px] text-[17px] sm:h-16 sm:text-lg px-8',
  },
  default: {
    wrap: 'flex flex-col sm:flex-row gap-3 w-full max-w-lg',
    input: 'h-16 text-[17px] sm:h-14 sm:text-base px-5 sm:px-4',
    button: 'h-16 text-[17px] sm:h-14 sm:text-base px-7 sm:px-6',
  },
  final: {
    wrap: 'flex flex-col sm:flex-row gap-3 w-full max-w-xl',
    input: 'h-16 text-[17px] sm:h-14 sm:text-base px-5 sm:px-4',
    button: 'h-16 text-[17px] sm:h-14 sm:text-base px-7 sm:px-6',
  },
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const u = new URL(withScheme)
    if (!u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

export function UrlInputCta({
  size = 'default',
  label,
  tone = 'light',
}: {
  size?: Size
  label: string
  tone?: 'light' | 'dark'
}) {
  const router = useRouter()
  const reduced = useReducedMotion()
  const [value, setValue] = useState('')
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [placeholderText, setPlaceholderText] = useState<string>(HERO_CONTENT.urlPlaceholders[0])
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cycling typewriter placeholder (only when empty + not focused + motion allowed)
  useEffect(() => {
    if (reduced || focused || value.length > 0) return
    const target = HERO_CONTENT.urlPlaceholders[placeholderIdx]
    if (!target) return
    let i = 0
    setPlaceholderText('')
    const typer = setInterval(() => {
      i += 1
      setPlaceholderText(target.slice(0, i))
      if (i >= target.length) {
        clearInterval(typer)
        setTimeout(() => {
          setPlaceholderIdx((p) => (p + 1) % HERO_CONTENT.urlPlaceholders.length)
        }, 1500)
      }
    }, 120)
    return () => clearInterval(typer)
  }, [placeholderIdx, focused, value, reduced])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const normalized = normalizeUrl(value)
    if (!normalized) {
      setError('Please enter a valid store URL.')
      return
    }
    setError(null)
    const target = `/signup?store=${encodeURIComponent(normalized)}`
    router.push(target)
  }

  const classes = SIZE_CLASSES[size]
  const buttonPulseClass = focused && !reduced ? 'animate-[pulse_1s_ease-in-out_infinite]' : ''
  const dark = tone === 'dark'

  const buttonClass = dark
    ? 'bg-white text-[#6b38d4] hover:bg-[#f8f9ff]'
    : 'bg-[#0b1c30] text-white'
  const shineTint = dark ? 'via-[#6b38d4]/20' : 'via-white/20'
  const microcopyClass = dark ? 'text-white/80' : 'text-[#45464d]/70'
  const errorClass = dark ? 'text-red-200' : 'text-red-600'

  return (
    <form onSubmit={onSubmit} className="space-y-2 w-full">
      <div className={classes.wrap}>
        <input
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={reduced ? HERO_CONTENT.urlPlaceholders[0] : placeholderText}
          aria-label="Your store URL"
          className={`flex-1 rounded-xl border border-[#c6c6cd] bg-white text-[#0b1c30] placeholder:text-[#45464d]/60 focus:border-[#6b38d4] focus:ring-2 focus:ring-[#6b38d4]/30 outline-none transition-all ${classes.input}`}
        />
        <button
          type="submit"
          className={`relative overflow-hidden rounded-xl font-bold hover:-translate-y-[2px] hover:shadow-xl active:scale-95 transition-all ${buttonClass} ${classes.button} ${buttonPulseClass}`}
        >
          <span className="relative z-10">{label}</span>
          {!reduced && (
            <span className={`pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent ${shineTint} to-transparent animate-[shine_6s_linear_infinite]`} />
          )}
        </button>
      </div>
      {error && <p className={`text-sm ${errorClass}`}>{error}</p>}
      <p className={`text-xs ${microcopyClass}`}>{HERO_CONTENT.ctaMicrocopy}</p>
    </form>
  )
}
