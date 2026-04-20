/**
 * Public changelog content. Edited by hand when shipping user-visible features.
 *
 * Newest entries first. Each `date` is YYYY-MM-DD (ship date, not commit date).
 * Write `title` and `body` in Growth OS voice: clear, user-facing, not a git
 * log line. Use commit type to pick `type`:
 *
 *   - feat:        → 'whats-new'
 *   - fix: / perf: → 'improvement'
 *   - other:       → don't add here (stays in DEVLOG only)
 */

export type ChangelogItemType = 'whats-new' | 'improvement' | 'fix'

export interface ChangelogItem {
  type: ChangelogItemType
  title: string
  body?: string
}

export interface ChangelogEntry {
  /** YYYY-MM-DD */
  date: string
  items: ChangelogItem[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-04-21',
    items: [
      {
        type: 'whats-new',
        title: 'Changelog is live',
        body: 'Track every user-facing improvement to Growth OS on this page.',
      },
    ],
  },
]

/** Labels rendered under each date grouping. */
export const SECTION_LABELS: Record<ChangelogItemType, string> = {
  'whats-new': "What's new",
  improvement: 'Improvements',
  fix: 'Fixes',
}

/** Section render order inside each date. */
export const SECTION_ORDER: ChangelogItemType[] = ['whats-new', 'improvement', 'fix']
