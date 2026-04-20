'use client'

import { useEffect, useRef, useState } from 'react'

export function useInViewport<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.3,
): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, inView }
}
