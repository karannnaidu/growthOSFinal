#!/usr/bin/env node
/**
 * Regenerates growth-os/DEVLOG.md from the full git history.
 * Idempotent: running twice produces identical output.
 *
 * Run manually:   node scripts/build-devlog.mjs
 * Run in CI:      triggered by .github/workflows/devlog.yml
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const DEVLOG_PATH = resolve(REPO_ROOT, 'DEVLOG.md')

const BOT_SUBJECT_PREFIX = 'chore(devlog):'
const GROUP_HEADER = (isoDate) => `## Week of ${isoDate}`

function readGitLog() {
  // Delimiter chosen to avoid collision with commit subjects.
  const FMT = '%H\x1f%s\x1f%an\x1f%aI'
  const stdout = execSync(
    `git log --pretty=format:"${FMT}" --no-merges`,
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
  )
  if (!stdout.trim()) return []
  return stdout.split('\n').map((line) => {
    const [sha, subject, author, isoDate] = line.split('\x1f')
    return { sha, subject, author, isoDate }
  })
}

function isBotCommit(c) {
  return c.subject.startsWith(BOT_SUBJECT_PREFIX)
}

/** ISO week start (Monday) for a given YYYY-MM-DDTHH:MM:SS+TZ string. */
function isoWeekStart(isoDate) {
  const d = new Date(isoDate)
  // UTC to avoid TZ drift between local and CI runners.
  const day = d.getUTCDay() // 0 Sun .. 6 Sat
  const diffToMon = (day + 6) % 7
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMon))
  return mon.toISOString().slice(0, 10)
}

function groupByWeek(commits) {
  const groups = new Map()
  for (const c of commits) {
    const key = isoWeekStart(c.isoDate)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(c)
  }
  // Sort groups: newest week first. Commits already come newest-first from git log.
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
}

function renderEntry(c) {
  const shortSha = c.sha.slice(0, 8)
  const date = c.isoDate.slice(0, 10)
  return `- **${shortSha}** — ${c.subject} *(${c.author}, ${date})*`
}

function renderDevlog(groups) {
  const today = new Date().toISOString().slice(0, 10)
  const header = [
    '# DEVLOG',
    '',
    'Auto-generated from git history on every push to `main`. Do not edit by hand —',
    'changes will be overwritten. For the user-facing changelog, see /changelog.',
    '',
    `Last updated: ${today}`,
    '',
  ].join('\n')
  const body = groups
    .map(([weekStart, commits]) =>
      [GROUP_HEADER(weekStart), '', ...commits.map(renderEntry), ''].join('\n'),
    )
    .join('\n')
  return `${header}\n${body}`
}

function main() {
  const commits = readGitLog().filter((c) => !isBotCommit(c))
  const output = renderDevlog(groupByWeek(commits))
  const existing = existsSync(DEVLOG_PATH) ? readFileSync(DEVLOG_PATH, 'utf8') : ''
  if (existing === output) {
    console.log('[build-devlog] no changes')
    process.exit(0)
  }
  writeFileSync(DEVLOG_PATH, output, 'utf8')
  console.log(`[build-devlog] wrote ${DEVLOG_PATH}`)
}

main()
