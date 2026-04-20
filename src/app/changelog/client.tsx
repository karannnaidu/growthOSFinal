'use client'

import { PublicNav } from '@/components/landing/public-nav'
import { PublicFooter } from '@/components/landing/public-footer'
import {
  CHANGELOG,
  SECTION_LABELS,
  SECTION_ORDER,
  type ChangelogEntry,
  type ChangelogItemType,
} from '../../../content/changelog'

function formatDate(iso: string): string {
  // "2026-04-21" → "Apr 21, 2026"
  const parts = iso.split('-').map(Number)
  const y = parts[0] ?? 1970
  const m = parts[1] ?? 1
  const d = parts[2] ?? 1
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function groupItems(entry: ChangelogEntry) {
  const grouped: Record<ChangelogItemType, typeof entry.items> = {
    'whats-new': [],
    improvement: [],
    fix: [],
  }
  for (const item of entry.items) grouped[item.type].push(item)
  return grouped
}

export default function ChangelogPageClient() {
  return (
    <div className="!bg-[#f8f9ff] !text-[#0b1c30] font-body selection:bg-[#e9ddff] selection:text-[#5516be] min-h-screen">
      <PublicNav />
      <main className="pt-20">
        <section className="mx-auto w-full max-w-3xl px-6 py-16">
          <header className="mb-12">
            <h1 className="font-heading text-4xl font-bold text-[#0b1c30] md:text-5xl">
              Changelog
            </h1>
            <p className="mt-3 text-lg text-[#45464d]">
              New features, improvements, and fixes. Shipped regularly.
            </p>
          </header>

          <ol className="flex flex-col gap-12">
            {CHANGELOG.map((entry) => {
              const grouped = groupItems(entry)
              return (
                <li
                  key={entry.date}
                  className="border-t border-[#e5eeff] pt-8"
                >
                  <p className="font-heading text-sm font-semibold uppercase tracking-wider text-[#6b38d4]">
                    {formatDate(entry.date)}
                  </p>
                  <div className="mt-4 flex flex-col gap-6">
                    {SECTION_ORDER.map((type) => {
                      const items = grouped[type]
                      if (items.length === 0) return null
                      return (
                        <div key={type}>
                          <h2 className="font-heading text-base font-semibold text-[#0b1c30]">
                            {SECTION_LABELS[type]}
                          </h2>
                          <ul className="mt-2 flex flex-col gap-3">
                            {items.map((item, idx) => (
                              <li key={idx}>
                                <p className="font-heading text-base font-semibold text-[#0b1c30]">
                                  {item.title}
                                </p>
                                {item.body && (
                                  <p className="mt-1 text-sm leading-relaxed text-[#45464d]">
                                    {item.body}
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
