'use client'

import { use } from 'react'
import Link from 'next/link'
import { SLIDE_MAP, SlideNav } from '@/components/landing/slides'

export default function SlidePage({
  params,
}: {
  params: Promise<{ slideId: string }>
}) {
  const { slideId } = use(params)
  const SlideComponent = SLIDE_MAP[slideId ?? 'problem']

  if (!SlideComponent) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-heading text-4xl font-bold text-[#0b1c30]">Slide not found</h1>
        <p className="mt-2 text-[#45464d]">Unknown slide: {slideId}</p>
        <Link href="/deck/problem" className="mt-4 inline-block text-[#6b38d4] hover:underline">
          Go to first slide
        </Link>
      </div>
    )
  }

  return (
    <>
      <SlideComponent />
      <div className="mx-auto max-w-7xl px-6">
        <SlideNav current={slideId} />
      </div>
    </>
  )
}
