'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const SLIDES = [
  'problem',
  'aria',
  'luna',
  'penny',
  'seo',
  'pricing',
  'credits',
  'security',
  'agency',
] as const

export default function DeckLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const slideId = params.slideId as string | undefined

  const currentIndex = SLIDES.indexOf(slideId as (typeof SLIDES)[number])
  const safeIndex = currentIndex === -1 ? 0 : currentIndex

  const goTo = useCallback(
    (index: number) => {
      if (index >= 0 && index < SLIDES.length) {
        router.push(`/deck/${SLIDES[index]}`)
      }
    },
    [router],
  )

  const goPrev = useCallback(() => goTo(safeIndex - 1), [goTo, safeIndex])
  const goNext = useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex])

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [goPrev, goNext])

  // Redirect bare /deck to first slide
  useEffect(() => {
    if (!slideId) {
      router.replace('/deck/problem')
    }
  }, [slideId, router])

  return (
    <div className="relative flex min-h-screen flex-col" style={{ background: '#111c2d' }}>
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
        <span className="font-heading text-lg font-bold tracking-tight text-white">
          Growth OS
        </span>
        <span className="text-sm text-white/50">
          {safeIndex + 1} of {SLIDES.length}
        </span>
      </header>

      {/* Slide content */}
      <main className="flex flex-1 items-center justify-center px-6 py-20">
        {children}
      </main>

      {/* Bottom navigation */}
      <footer className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
        <button
          onClick={goPrev}
          disabled={safeIndex === 0}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        {/* Dots */}
        <div className="flex gap-2">
          {SLIDES.map((id, i) => (
            <button
              key={id}
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition-all ${
                i === safeIndex ? 'w-6 bg-white' : 'w-2 bg-white/30 hover:bg-white/50'
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          disabled={safeIndex === SLIDES.length - 1}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"
          aria-label="Next slide"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </footer>
    </div>
  )
}
