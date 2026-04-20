'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Palette, Type, Users, Target, Package, RefreshCw, Dna,
  Plus, ExternalLink, X, Pencil, Check, Upload, Image as ImageIcon, Search,
} from 'lucide-react'
import { BRAND_FONTS, FONT_CATEGORY_LABELS, googleFontsPreviewUrl, type FontCategory } from '@/lib/brand-fonts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrandDna {
  brand_voice: {
    formality: string
    warmth: string
    humor: string
    confidence: string
    style_notes: string
    sample_phrases: string[]
  }
  tone_adjectives: string[]
  target_audience: {
    age_range: string
    gender_skew: string
    interests: string[]
    pain_points: string[]
    income_bracket: string
    psychographic: string
  }
  positioning: {
    statement: string
    category: string
    differentiator: string
    price_positioning: string
  }
  products: {
    name: string
    description: string
    price: string | null
    image_url: string | null
    category: string
    transparent_image_url?: string
    bg_approved?: boolean
    bg_removed_at?: string
  }[]
  visual_identity: {
    primary_colors: string[]
    secondary_colors: string[]
    font_families: string[]
    custom_fonts?: CustomFont[]
    logo_url: string | null
    logo_variants?: LogoVariant[]
    aesthetic: string
  }
  brand_story: string | null
  key_themes: string[]
  trust_signals: string[]
  extraction_confidence: Record<string, number>
}

export type LogoVariantKind = 'primary' | 'mono-dark' | 'mono-light'

export interface LogoVariant {
  url: string
  variant: LogoVariantKind
}

export interface CustomFont {
  name: string
  url: string
  /** Deduced from filename extension; used by the @font-face format() hint. */
  format?: 'woff2' | 'woff' | 'truetype' | 'opentype'
}

const FONT_ACCEPT = '.woff2,.woff,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf'

function fontFormatFromFilename(name: string): CustomFont['format'] {
  const lower = name.toLowerCase()
  if (lower.endsWith('.woff2')) return 'woff2'
  if (lower.endsWith('.woff')) return 'woff'
  if (lower.endsWith('.ttf')) return 'truetype'
  if (lower.endsWith('.otf')) return 'opentype'
  return undefined
}

function displayNameFromFilename(name: string): string {
  // Strip extension, replace separators with spaces, collapse whitespace.
  const stem = name.replace(/\.[^.]+$/, '')
  return stem.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const LOGO_VARIANT_LABELS: Record<LogoVariantKind, { label: string; hint: string; swatch: string }> = {
  'primary': { label: 'Primary', hint: 'Full-color logo', swatch: 'transparent' },
  'mono-dark': { label: 'Mono / Dark', hint: 'For light backgrounds', swatch: '#ffffff' },
  'mono-light': { label: 'Mono / Light', hint: 'For dark backgrounds', swatch: '#111827' },
}

const LOGO_VARIANT_ORDER: LogoVariantKind[] = ['primary', 'mono-dark', 'mono-light']

// ---------------------------------------------------------------------------
// Editable Components
// ---------------------------------------------------------------------------

function EditableText({
  value,
  onSave,
  multiline = false,
  className = '',
  placeholder = 'Click to edit...',
}: {
  value: string
  onSave: (v: string) => void
  multiline?: boolean
  className?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <div className="space-y-1.5">
        {multiline ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[#6366f1]/40 bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none resize-none"
            autoFocus
          />
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-lg border border-[#6366f1]/40 bg-white/5 px-3 py-1.5 text-sm text-foreground focus:outline-none"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { onSave(draft); setEditing(false) } }}
          />
        )}
        <div className="flex gap-1.5">
          <button onClick={() => { onSave(draft); setEditing(false) }}
            className="flex items-center gap-1 rounded-md bg-[#6366f1] px-2 py-1 text-[10px] font-medium text-white hover:bg-[#5254cc]">
            <Check className="w-3 h-3" /> Save
          </button>
          <button onClick={() => { setDraft(value); setEditing(false) }}
            className="rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <p
      onClick={() => { setDraft(value); setEditing(true) }}
      className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm text-foreground/80 transition hover:bg-white/10 group flex items-center gap-2 ${className}`}
    >
      <span className="flex-1">{value || <span className="italic text-muted-foreground/50">{placeholder}</span>}</span>
      <Pencil className="w-3 h-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </p>
  )
}

function EditableMetric({
  label,
  value,
  onSave,
}: {
  label: string
  value: string
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <div className="rounded-lg bg-white/5 px-3 py-2">
        <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded border border-[#6366f1]/40 bg-white/5 px-2 py-1 text-sm text-foreground focus:outline-none"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onSave(draft); setEditing(false) }
            if (e.key === 'Escape') { setDraft(value); setEditing(false) }
          }}
          onBlur={() => { onSave(draft); setEditing(false) }}
        />
      </div>
    )
  }

  return (
    <div
      className="rounded-lg bg-white/5 px-3 py-2 cursor-pointer hover:bg-white/10 transition group"
      onClick={() => { setDraft(value); setEditing(true) }}
    >
      <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">{label}</span>
      <span className="text-sm font-metric font-semibold text-foreground flex items-center gap-1.5">
        {value || '—'}
        <Pencil className="w-2.5 h-2.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
    </div>
  )
}

function EditablePills({
  items,
  color,
  onUpdate,
  placeholder = 'Add...',
}: {
  items: string[]
  color: string
  onUpdate: (items: string[]) => void
  placeholder?: string
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  function handleAdd() {
    const val = draft.trim()
    if (val && !items.includes(val)) {
      onUpdate([...items, val])
    }
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium group"
          style={{ background: `${color}22`, color }}
        >
          {item}
          <button
            onClick={() => onUpdate(items.filter((i) => i !== item))}
            className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
            if (e.key === 'Escape') { setAdding(false); setDraft('') }
          }}
          onBlur={handleAdd}
          placeholder={placeholder}
          autoFocus
          className="rounded-full border border-dashed border-white/20 bg-white/5 px-2.5 py-0.5 text-xs text-foreground focus:outline-none focus:border-[#6366f1]/40 w-28"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/15 px-2 py-0.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground hover:border-white/30 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      )}
    </div>
  )
}

function FontPicker({
  items,
  customFonts,
  brandId,
  onUpdate,
  onCustomFontsChange,
}: {
  items: string[]
  customFonts: CustomFont[]
  brandId: string | null
  onUpdate: (items: string[]) => void
  onCustomFontsChange: (next: CustomFont[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | FontCategory | 'custom'>('all')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Inject a preview stylesheet covering selected + filtered Google Fonts so
  // each option renders in its own typeface. Cap at 40 families to keep the
  // network hit small; custom fonts get their own @font-face rules below.
  useEffect(() => {
    const customNameSet = new Set(customFonts.map((f) => f.name))
    const selected = items.filter((n) => !customNameSet.has(n))
    const candidates = BRAND_FONTS
      .filter((f) => category === 'all' || category === 'custom' || f.category === category)
      .filter((f) => !query.trim() || f.name.toLowerCase().includes(query.trim().toLowerCase()))
      .slice(0, 40)
      .map((f) => f.name)
    const families = Array.from(new Set([...selected, ...candidates]))
    if (families.length === 0) return
    const href = googleFontsPreviewUrl(families)
    const id = 'brand-font-preview'
    let link = document.getElementById(id) as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    if (link.href !== href) link.href = href
  }, [items, query, category, open, customFonts])

  // Inject @font-face rules for brand-uploaded custom fonts so they preview
  // in the list and in the selected chips. One <style> element, rewritten on
  // change — the set of custom fonts is small (a handful per brand).
  useEffect(() => {
    const id = 'brand-custom-font-face'
    let styleEl = document.getElementById(id) as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = id
      document.head.appendChild(styleEl)
    }
    const css = customFonts
      .map((f) => {
        const fmt = f.format ? ` format('${f.format}')` : ''
        return `@font-face{font-family:'${f.name.replace(/'/g, "\\'")}';src:url('${f.url}')${fmt};font-display:swap;}`
      })
      .join('\n')
    if (styleEl.textContent !== css) styleEl.textContent = css
  }, [customFonts])

  const filteredGoogle = BRAND_FONTS
    .filter((f) => category === 'all' || (category !== 'custom' && f.category === category))
    .filter((f) => !query.trim() || f.name.toLowerCase().includes(query.trim().toLowerCase()))

  const filteredCustom = customFonts
    .filter(() => category === 'all' || category === 'custom')
    .filter((f) => !query.trim() || f.name.toLowerCase().includes(query.trim().toLowerCase()))

  function toggle(name: string) {
    if (items.includes(name)) onUpdate(items.filter((i) => i !== name))
    else onUpdate([...items, name])
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!brandId) { setUploadError('Brand not loaded yet'); return }
    const format = fontFormatFromFilename(file.name)
    if (!format) { setUploadError('Unsupported font format. Use .woff2, .woff, .ttf, or .otf'); return }
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('brandId', brandId)
      fd.append('bucket', 'brand-assets')
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        setUploadError(j.error || 'Upload failed')
        return
      }
      const data = await res.json() as { publicUrl: string | null }
      if (!data.publicUrl) { setUploadError('Upload returned no URL'); return }
      const fontName = displayNameFromFilename(file.name) || 'Custom Font'
      // Avoid collisions with Google Fonts or existing custom fonts — append
      // a numeric suffix until unique.
      const existingNames = new Set([...customFonts.map((f) => f.name), ...BRAND_FONTS.map((b) => b.name)])
      let uniqueName = fontName
      let i = 2
      while (existingNames.has(uniqueName)) {
        uniqueName = `${fontName} ${i}`
        i += 1
      }
      const next = [...customFonts, { name: uniqueName, url: data.publicUrl, format }]
      onCustomFontsChange(next)
      if (!items.includes(uniqueName)) onUpdate([...items, uniqueName])
    } catch {
      setUploadError('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function removeCustomFont(name: string) {
    onCustomFontsChange(customFonts.filter((f) => f.name !== name))
    if (items.includes(name)) onUpdate(items.filter((i) => i !== name))
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs group"
              style={{ background: '#f9731622', color: '#f97316', fontFamily: `'${name}', system-ui` }}
            >
              {name}
              <button
                onClick={() => onUpdate(items.filter((i) => i !== name))}
                className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/15 px-2 py-0.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground hover:border-white/30 transition-colors"
        >
          <Plus className="w-3 h-3" /> Browse fonts
        </button>
      ) : (
        <div className="rounded-lg border border-border/40 bg-white/[0.02] p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search 50+ fonts…"
                className="w-full rounded bg-white/5 border border-border/40 pl-7 pr-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-[#f97316] focus:outline-none"
              />
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground px-1.5"
            >
              Done
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {(['all', 'sans', 'serif', 'display', 'handwriting', 'mono', 'custom'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
                    category === c
                      ? 'bg-[#f97316] text-white'
                      : 'bg-white/5 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {c === 'all' ? 'All' : c === 'custom' ? `Custom${customFonts.length > 0 ? ` (${customFonts.length})` : ''}` : FONT_CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
            <label className={`shrink-0 inline-flex items-center gap-1 rounded-full border border-dashed border-white/20 px-2 py-0.5 text-[10px] cursor-pointer transition-colors ${uploading ? 'opacity-50 cursor-wait' : 'text-muted-foreground hover:text-foreground hover:border-[#f97316]/50'}`}>
              {uploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              {uploading ? 'Uploading…' : 'Upload'}
              <input
                type="file"
                accept={FONT_ACCEPT}
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </div>
          {uploadError && (
            <div className="text-[10px] text-[#ef4444]">{uploadError}</div>
          )}
          <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1">
            {filteredCustom.length > 0 && (
              <>
                {filteredCustom.map((f) => {
                  const selected = items.includes(f.name)
                  return (
                    <div key={`custom-${f.name}`} className="flex items-center gap-1 group">
                      <button
                        onClick={() => toggle(f.name)}
                        className={`flex-1 flex items-center justify-between rounded px-2 py-1 text-left transition-colors ${
                          selected ? 'bg-[#f97316]/20' : 'hover:bg-white/5'
                        }`}
                      >
                        <span
                          className="text-sm text-foreground"
                          style={{ fontFamily: `'${f.name}', system-ui` }}
                        >
                          {f.name}
                        </span>
                        <span className="text-[9px] uppercase tracking-widest text-[#f97316]/80">
                          {selected ? '✓' : 'Custom'}
                        </span>
                      </button>
                      <button
                        onClick={() => removeCustomFont(f.name)}
                        title="Remove custom font"
                        className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })}
                {category !== 'custom' && filteredGoogle.length > 0 && (
                  <div className="my-1 border-t border-border/40" />
                )}
              </>
            )}
            {category === 'custom' && filteredCustom.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/50 text-center py-3">
                No custom fonts yet. Use Upload above to add .woff2 / .woff / .ttf / .otf files.
              </p>
            ) : null}
            {category !== 'custom' && filteredGoogle.length === 0 && filteredCustom.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/50 text-center py-3">No matches.</p>
            ) : null}
            {category !== 'custom' && filteredGoogle.map((f) => {
              const selected = items.includes(f.name)
              return (
                <button
                  key={f.name}
                  onClick={() => toggle(f.name)}
                  className={`w-full flex items-center justify-between rounded px-2 py-1 text-left transition-colors ${
                    selected ? 'bg-[#f97316]/20' : 'hover:bg-white/5'
                  }`}
                >
                  <span
                    className="text-sm text-foreground"
                    style={{ fontFamily: `'${f.name}', system-ui` }}
                  >
                    {f.name}
                  </span>
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground/50">
                    {selected ? '✓' : FONT_CATEGORY_LABELS[f.category]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function LogoManager({
  brandId,
  primaryUrl,
  variants,
  onUpdate,
}: {
  brandId: string | null
  primaryUrl: string | null
  variants: LogoVariant[]
  onUpdate: (next: { primary: string | null; variants: LogoVariant[] }) => void
}) {
  const [uploading, setUploading] = useState<LogoVariantKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function uploadFile(file: File, kind: LogoVariantKind) {
    if (!brandId) { setError('Brand not loaded yet'); return }
    setError(null)
    setUploading(kind)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('brandId', brandId)
      fd.append('bucket', 'brand-assets')
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        setError(j.error || 'Upload failed')
        return
      }
      const data = await res.json() as { publicUrl: string | null }
      if (!data.publicUrl) { setError('Upload returned no URL'); return }

      const rest = variants.filter((v) => v.variant !== kind)
      const nextVariants = [...rest, { url: data.publicUrl, variant: kind }]
      const nextPrimary = kind === 'primary' ? data.publicUrl : primaryUrl
      onUpdate({ primary: nextPrimary, variants: nextVariants })
    } catch {
      setError('Upload failed')
    } finally {
      setUploading(null)
    }
  }

  function removeVariant(kind: LogoVariantKind) {
    const rest = variants.filter((v) => v.variant !== kind)
    const nextPrimary = kind === 'primary' ? null : primaryUrl
    onUpdate({ primary: nextPrimary, variants: rest })
  }

  const urlFor = (kind: LogoVariantKind): string | null => {
    if (kind === 'primary') {
      return variants.find((v) => v.variant === 'primary')?.url ?? primaryUrl ?? null
    }
    return variants.find((v) => v.variant === kind)?.url ?? null
  }

  return (
    <div>
      <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Brand Logo</span>
      <div className="grid grid-cols-3 gap-2">
        {LOGO_VARIANT_ORDER.map((kind) => {
          const url = urlFor(kind)
          const meta = LOGO_VARIANT_LABELS[kind]
          const isUploading = uploading === kind
          return (
            <label
              key={kind}
              className="relative flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-white/15 hover:border-[#f97316]/40 p-2 cursor-pointer group transition-colors"
              style={{ background: meta.swatch === 'transparent' ? 'rgba(255,255,255,0.02)' : meta.swatch }}
            >
              <div className="aspect-square w-full flex items-center justify-center overflow-hidden rounded">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={`${meta.label} logo`} className="max-w-full max-h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground/50">
                    {isUploading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4" />
                        <Upload className="w-3 h-3" />
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="text-center">
                <span className={`block text-[10px] font-medium ${meta.swatch === '#111827' ? 'text-white' : 'text-foreground'}`}>
                  {meta.label}
                </span>
                <span className={`block text-[9px] ${meta.swatch === '#111827' ? 'text-white/60' : 'text-muted-foreground/60'}`}>
                  {meta.hint}
                </span>
              </div>
              {url && !isUploading && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); removeVariant(kind) }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
                  title="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadFile(f, kind)
                  e.target.value = ''
                }}
              />
            </label>
          )
        })}
      </div>
      {error && <div className="mt-1.5 text-[10px] text-[#ef4444]">{error}</div>}
    </div>
  )
}

function AddProductCard({ brandId, onAdd }: { brandId: string | null; onAdd: (p: BrandDna['products'][0]) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetAndClose() {
    setName(''); setPrice(''); setCategory(''); setError(null)
    setImageFile(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setOpen(false)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setImageFile(f)
    setPreviewUrl(f ? URL.createObjectURL(f) : null)
    setError(null)
  }

  async function handleSubmit() {
    if (!name.trim() || uploading) return
    setError(null)

    let imageUrl: string | null = null
    if (imageFile) {
      if (!brandId) { setError('Brand not loaded yet'); return }
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append('file', imageFile)
        fd.append('brandId', brandId)
        fd.append('bucket', 'brand-assets')
        const res = await fetch('/api/media/upload', { method: 'POST', body: fd })
        if (!res.ok) {
          const j = await res.json().catch(() => ({})) as { error?: string }
          setError(j.error || 'Upload failed')
          setUploading(false)
          return
        }
        const data = await res.json() as { publicUrl: string | null }
        imageUrl = data.publicUrl
      } catch {
        setError('Upload failed')
        setUploading(false)
        return
      }
      setUploading(false)
    }

    onAdd({
      name: name.trim(),
      description: '',
      price: price.trim() || null,
      image_url: imageUrl,
      category: category.trim() || 'General',
    })
    resetAndClose()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="rounded-lg border-2 border-dashed border-white/10 hover:border-[#0d9488]/40 flex flex-col items-center justify-center gap-2 min-h-[180px] transition-colors group">
        <Plus className="w-5 h-5 text-muted-foreground/30 group-hover:text-[#0d9488] transition-colors" />
        <span className="text-[10px] text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">Add Product</span>
      </button>
    )
  }

  return (
    <div className="rounded-lg bg-white/5 border border-border/40 p-3 flex flex-col gap-2">
      <label className="aspect-square bg-white/5 rounded border border-dashed border-white/15 hover:border-[#0d9488]/40 flex items-center justify-center cursor-pointer overflow-hidden relative group/img">
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-[10px] text-white">
              Change image
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground/50 text-[10px]">
            <Upload className="w-4 h-4" />
            <span>Add image</span>
          </div>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name *" autoFocus
        className="w-full rounded bg-white/5 border border-border/40 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-[#0d9488] focus:outline-none" />
      <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (e.g. $29.99)"
        className="w-full rounded bg-white/5 border border-border/40 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-[#0d9488] focus:outline-none" />
      <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category"
        className="w-full rounded bg-white/5 border border-border/40 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-[#0d9488] focus:outline-none" />
      {error && <div className="text-[10px] text-[#ef4444]">{error}</div>}
      <div className="flex gap-1.5">
        <button onClick={handleSubmit} disabled={uploading || !name.trim()}
          className="rounded bg-[#0d9488] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[#0d9488]/80 disabled:opacity-50">
          {uploading ? 'Uploading...' : 'Add'}
        </button>
        <button onClick={resetAndClose} disabled={uploading}
          className="rounded px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50">Cancel</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Pill({ children, color = '#6366f1' }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: `${color}22`, color }}>
      {children}
    </span>
  )
}

function ColorSwatch({ hex, onRemove }: { hex: string; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 group">
      <div className="w-6 h-6 rounded-md border border-white/10 shrink-0" style={{ background: hex }} />
      <span className="text-xs font-metric text-muted-foreground uppercase tracking-wider">{hex}</span>
      <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-red-400">
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

function SectionHeader({
  icon: Icon, iconColor, title,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  iconColor: string
  title: string
}) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${iconColor}18` }}>
        <Icon className="w-3.5 h-3.5" style={{ color: iconColor }} />
      </div>
      <h3 className="font-heading font-semibold text-sm text-foreground">{title}</h3>
    </div>
  )
}

function AddColorInput({ onAdd }: { onAdd: (hex: string) => void }) {
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState('#')

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground mt-1">
        <Plus className="w-3 h-3" /> Add color
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <input value={hex} onChange={(e) => setHex(e.target.value)} placeholder="#000000" autoFocus
        className="w-20 rounded border border-border/40 bg-white/5 px-2 py-0.5 text-xs text-foreground focus:outline-none"
        onKeyDown={(e) => { if (e.key === 'Enter' && hex.match(/^#[0-9a-fA-F]{3,8}$/)) { onAdd(hex.toLowerCase()); setHex('#'); setOpen(false) } }} />
      <button onClick={() => { if (hex.match(/^#[0-9a-fA-F]{3,8}$/)) { onAdd(hex.toLowerCase()); setHex('#'); setOpen(false) } }}
        className="text-[10px] text-[#6366f1] hover:text-[#6366f1]/80">Add</button>
      <button onClick={() => { setOpen(false); setHex('#') }} className="text-[10px] text-muted-foreground">Cancel</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BrandDnaPage() {
  const supabase = createClient()
  const [brandId, setBrandId] = useState<string | null>(null)
  const [dna, setDna] = useState<BrandDna | null>(null)
  const [brandName, setBrandName] = useState('')
  const [brandDomain, setBrandDomain] = useState('')
  const [competitors, setCompetitors] = useState<Array<{ name: string; domain?: string; type?: string; why_competitor?: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [removingBg, setRemovingBg] = useState<string | null>(null)

  // Resolve brand ID via API (bypasses RLS), validates cached IDs
  useEffect(() => {
    async function init() {
      // Always fetch from API to get the canonical brand ID
      try {
        const res = await fetch('/api/brands/me')
        if (res.ok) {
          const data = await res.json()
          if (data.brandId) {
            setBrandId(data.brandId)
            localStorage.setItem('growth_os_brand_id', data.brandId)
            sessionStorage.setItem('onboarding_brand_id', data.brandId)
            return
          }
        }
      } catch { /* ignore */ }

      // Fallback to cached (only if API fails)
      const stored = sessionStorage.getItem('onboarding_brand_id') || localStorage.getItem('growth_os_brand_id')
      if (stored) setBrandId(stored)
    }
    init()
  }, [])

  // Fetch brand DNA
  useEffect(() => {
    if (!brandId) return
    async function load() {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/settings/brand-dna?brandId=${brandId}`)
        if (!res.ok) return
        const data = await res.json()
        setBrandName(data.name ?? '')
        setBrandDomain(data.domain ?? '')
        setDna(data.dna as BrandDna | null)
        if (data.competitors) setCompetitors(data.competitors)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [brandId])

  // Update helper — marks dirty and updates local state.
  // NOTE: setDirty MUST be called outside the setDna updater. React 19 does
  // not guarantee that setState calls invoked *inside* another setState's
  // updater function are committed — doing so would leave the Save button
  // hidden even though dna changed.
  const update = useCallback((updater: (d: BrandDna) => BrandDna) => {
    setDna((prev) => (prev ? updater(prev) : prev))
    setDirty(true)
  }, [])

  // Save to API
  const handleSave = useCallback(async () => {
    if (!brandId || !dna) return
    setIsSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings/brand-dna', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, dna }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: 'Brand DNA saved.' })
        setDirty(false)
      } else {
        setMessage({ type: 'error', text: 'Failed to save.' })
      }
    } finally {
      setIsSaving(false)
      setTimeout(() => setMessage(null), 4000)
    }
  }, [brandId, dna])

  async function handleRemoveBg(productName: string, imageUrl: string) {
    if (!brandId || removingBg) return
    setRemovingBg(productName)
    try {
      const res = await fetch('/api/products/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, productName, imageUrl }),
      })
      if (res.ok) {
        // Re-fetch DNA to get updated product data with transparent URL
        const dnaRes = await fetch(`/api/settings/brand-dna?brandId=${brandId}`)
        if (dnaRes.ok) {
          const dnaData = await dnaRes.json()
          setDna(dnaData.dna)
        }
      }
    } finally {
      setRemovingBg(null)
    }
  }

  async function handleApproveBg(productName: string, approved: boolean) {
    if (!brandId) return
    await fetch('/api/products/approve-bg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, productName, approved }),
    })
    // Re-fetch DNA
    const dnaRes = await fetch(`/api/settings/brand-dna?brandId=${brandId}`)
    if (dnaRes.ok) {
      const dnaData = await dnaRes.json()
      setDna(dnaData.dna)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
        ))}
      </div>
    )
  }

  if (!dna) {
    return (
      <div className="max-w-2xl">
        <Card className="glass-panel">
          <CardContent className="py-12 text-center">
            <Dna className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="font-heading font-semibold text-lg text-foreground mb-2">No Brand DNA Found</h2>
            <p className="text-sm text-muted-foreground mb-4">Run the onboarding extraction to analyze your brand website.</p>
            <Button onClick={() => window.location.href = '/onboarding/connect-store'} className="bg-[#6366f1] text-white hover:bg-[#6366f1]/80">
              Start Onboarding
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const avgConfidence = dna.extraction_confidence && Object.keys(dna.extraction_confidence).length > 0
    ? Math.round(Object.values(dna.extraction_confidence).reduce((a, b) => a + b, 0) / Object.values(dna.extraction_confidence).length)
    : 0

  return (
    <div className="max-w-5xl space-y-5">
      {/* Feedback */}
      {message && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          message.type === 'success' ? 'border-[#059669]/30 bg-[#059669]/10 text-[#059669]' : 'border-[#ef4444]/30 bg-[#ef4444]/10 text-[#ef4444]'
        }`}>{message.text}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading font-bold text-lg text-foreground">{brandName}</h2>
            {brandDomain && (
              <a href={`https://${brandDomain}`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                {brandDomain} <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {avgConfidence > 0 && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-muted-foreground">Extraction confidence</span>
              <span className="text-xs font-metric font-semibold text-[#6366f1]">{avgConfidence}%</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.location.href = '/onboarding/extraction'} className="gap-1.5 text-xs">
            <RefreshCw className="w-3 h-3" /> Re-scan
          </Button>
          {dirty && (
            <Button size="sm" onClick={handleSave} disabled={isSaving}
              className="gap-1.5 text-xs bg-[#6366f1] text-white hover:bg-[#5254cc]">
              {isSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Brand Voice */}
        <Card className="glass-panel">
          <CardContent className="pt-5 pb-5">
            <SectionHeader icon={Type} iconColor="#6366f1" title="Brand Voice" />
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(['formality', 'warmth', 'humor', 'confidence'] as const).map((key) => (
                <EditableMetric key={key} label={key} value={dna.brand_voice?.[key] || ''}
                  onSave={(v) => update((d) => ({ ...d, brand_voice: { ...d.brand_voice, [key]: v } }))} />
              ))}
            </div>
            <div className="mb-3">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1 px-1">Style Notes</span>
              <EditableText value={dna.brand_voice?.style_notes || ''} multiline
                onSave={(v) => update((d) => ({ ...d, brand_voice: { ...d.brand_voice, style_notes: v } }))} />
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2 px-1">Tone</span>
              <EditablePills items={dna.tone_adjectives || []} color="#6366f1"
                onUpdate={(items) => update((d) => ({ ...d, tone_adjectives: items }))} placeholder="Add tone..." />
            </div>
          </CardContent>
        </Card>

        {/* Visual Identity */}
        <Card className="glass-panel">
          <CardContent className="pt-5 pb-5">
            <SectionHeader icon={Palette} iconColor="#f97316" title="Visual Identity" />
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Primary</span>
                <div className="space-y-1.5">
                  {(dna.visual_identity?.primary_colors || []).map((c) => (
                    <ColorSwatch key={c} hex={c} onRemove={() => update((d) => ({
                      ...d, visual_identity: { ...d.visual_identity, primary_colors: d.visual_identity.primary_colors.filter((x) => x !== c) }
                    }))} />
                  ))}
                  <AddColorInput onAdd={(hex) => update((d) => ({
                    ...d, visual_identity: { ...d.visual_identity, primary_colors: [...d.visual_identity.primary_colors, hex] }
                  }))} />
                </div>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Secondary</span>
                <div className="space-y-1.5">
                  {(dna.visual_identity?.secondary_colors || []).map((c) => (
                    <ColorSwatch key={c} hex={c} onRemove={() => update((d) => ({
                      ...d, visual_identity: { ...d.visual_identity, secondary_colors: d.visual_identity.secondary_colors.filter((x) => x !== c) }
                    }))} />
                  ))}
                  <AddColorInput onAdd={(hex) => update((d) => ({
                    ...d, visual_identity: { ...d.visual_identity, secondary_colors: [...d.visual_identity.secondary_colors, hex] }
                  }))} />
                </div>
              </div>
            </div>
            <div className="mb-3">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Fonts</span>
              <FontPicker
                items={dna.visual_identity?.font_families ?? []}
                customFonts={dna.visual_identity?.custom_fonts ?? []}
                brandId={brandId}
                onUpdate={(items) => update((d) => ({ ...d, visual_identity: { ...d.visual_identity, font_families: items } }))}
                onCustomFontsChange={(next) => update((d) => ({ ...d, visual_identity: { ...d.visual_identity, custom_fonts: next } }))}
              />
            </div>
            <div className="mb-3">
              <LogoManager
                brandId={brandId}
                primaryUrl={dna.visual_identity?.logo_url ?? null}
                variants={dna.visual_identity?.logo_variants ?? []}
                onUpdate={({ primary, variants }) => update((d) => ({
                  ...d,
                  visual_identity: { ...d.visual_identity, logo_url: primary, logo_variants: variants },
                }))}
              />
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1 px-1">Aesthetic</span>
              <EditableText value={dna.visual_identity?.aesthetic || ''} multiline
                onSave={(v) => update((d) => ({ ...d, visual_identity: { ...d.visual_identity, aesthetic: v } }))} />
            </div>
          </CardContent>
        </Card>

        {/* Positioning */}
        <Card className="glass-panel">
          <CardContent className="pt-5 pb-5">
            <SectionHeader icon={Target} iconColor="#10b981" title="Positioning" />
            <div className="mb-3">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1 px-1">Statement</span>
              <EditableText value={dna.positioning?.statement || ''} multiline className="italic"
                onSave={(v) => update((d) => ({ ...d, positioning: { ...d.positioning, statement: v } }))} />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <EditableMetric label="Category" value={dna.positioning?.category || ''}
                onSave={(v) => update((d) => ({ ...d, positioning: { ...d.positioning, category: v } }))} />
              <EditableMetric label="Price Tier" value={dna.positioning?.price_positioning || ''}
                onSave={(v) => update((d) => ({ ...d, positioning: { ...d.positioning, price_positioning: v } }))} />
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1 px-1">Differentiator</span>
              <EditableText value={dna.positioning?.differentiator || ''} multiline
                onSave={(v) => update((d) => ({ ...d, positioning: { ...d.positioning, differentiator: v } }))} />
            </div>
          </CardContent>
        </Card>

        {/* Target Audience */}
        <Card className="glass-panel">
          <CardContent className="pt-5 pb-5">
            <SectionHeader icon={Users} iconColor="#8b5cf6" title="Target Audience" />
            <div className="grid grid-cols-3 gap-2 mb-3">
              <EditableMetric label="Age" value={dna.target_audience?.age_range || ''}
                onSave={(v) => update((d) => ({ ...d, target_audience: { ...d.target_audience, age_range: v } }))} />
              <EditableMetric label="Gender" value={dna.target_audience?.gender_skew || ''}
                onSave={(v) => update((d) => ({ ...d, target_audience: { ...d.target_audience, gender_skew: v } }))} />
              <EditableMetric label="Income" value={dna.target_audience?.income_bracket || ''}
                onSave={(v) => update((d) => ({ ...d, target_audience: { ...d.target_audience, income_bracket: v } }))} />
            </div>
            <div className="mb-3">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-1 px-1">Psychographic</span>
              <EditableText value={dna.target_audience?.psychographic || ''} multiline
                onSave={(v) => update((d) => ({ ...d, target_audience: { ...d.target_audience, psychographic: v } }))} />
            </div>
            <div className="mb-3">
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2 px-1">Interests</span>
              <EditablePills items={dna.target_audience?.interests || []} color="#8b5cf6"
                onUpdate={(items) => update((d) => ({ ...d, target_audience: { ...d.target_audience, interests: items } }))} />
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2 px-1">Pain Points</span>
              <EditablePills items={dna.target_audience?.pain_points || []} color="#ef4444"
                onUpdate={(items) => update((d) => ({ ...d, target_audience: { ...d.target_audience, pain_points: items } }))} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products */}
      <Card className="glass-panel">
        <CardContent className="pt-5 pb-5">
          <SectionHeader icon={Package} iconColor="#0d9488" title={`Products (${dna.products?.length || 0})`} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {(dna.products || []).map((product, idx) => {
              const displayImage = product.bg_approved && product.transparent_image_url
                ? product.transparent_image_url
                : product.image_url
              return (
              <div key={product.name + idx} className="rounded-lg bg-white/5 overflow-hidden flex flex-col group relative">
                {displayImage ? (
                  <div className="aspect-square bg-white/5 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={displayImage} alt={product.name} className={`absolute inset-0 w-full h-full ${product.bg_approved ? 'object-contain' : 'object-cover'}`} />
                  </div>
                ) : (
                  <div className="aspect-square bg-white/5 flex items-center justify-center">
                    <Package className="w-6 h-6 text-muted-foreground/20" />
                  </div>
                )}
                <div className="p-2.5 flex-1 flex flex-col">
                  <span className="text-xs font-medium text-foreground line-clamp-2 mb-0.5">{product.name}</span>
                  {product.price && <span className="text-[10px] font-metric text-muted-foreground mt-auto">{product.price}</span>}

                  {/* Background removal controls */}
                  {product.image_url && !product.bg_approved && !product.transparent_image_url && (
                    <button
                      onClick={() => handleRemoveBg(product.name, product.image_url!)}
                      disabled={removingBg === product.name}
                      className="mt-1.5 w-full text-[10px] text-[#6366f1] hover:text-[#6366f1]/80 disabled:opacity-50 text-center"
                    >
                      {removingBg === product.name ? 'Removing bg...' : 'Remove Background'}
                    </button>
                  )}

                  {/* Pending approval */}
                  {product.transparent_image_url && !product.bg_approved && (
                    <div className="mt-1.5 space-y-1">
                      <div className="aspect-square bg-[#1a1a2e] rounded overflow-hidden relative">
                        <img src={product.transparent_image_url} alt="Transparent" className="absolute inset-0 w-full h-full object-contain" />
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => handleApproveBg(product.name, true)}
                          className="flex-1 text-[9px] bg-[#10b981]/20 text-[#10b981] rounded py-0.5 hover:bg-[#10b981]/30">
                          Approve
                        </button>
                        <button onClick={() => handleApproveBg(product.name, false)}
                          className="flex-1 text-[9px] bg-[#ef4444]/20 text-[#ef4444] rounded py-0.5 hover:bg-[#ef4444]/30">
                          Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Approved badge */}
                  {product.bg_approved && (
                    <span className="mt-1 inline-block text-[9px] bg-[#10b981]/15 text-[#10b981] rounded-full px-2 py-0.5">
                      BG Removed ✓
                    </span>
                  )}
                </div>
                <button
                  onClick={() => update((d) => ({ ...d, products: d.products.filter((_, i) => i !== idx) }))}
                  aria-label={`Remove ${product.name}`}
                  title="Remove product"
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white/90 hover:text-white hover:bg-red-500 flex items-center justify-center shadow-md transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              )
            })}
            <AddProductCard brandId={brandId} onAdd={(p) => update((d) => ({ ...d, products: [...d.products, p] }))} />
          </div>
        </CardContent>
      </Card>

      {/* Key Themes + Trust Signals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="glass-panel">
          <CardContent className="pt-5 pb-5">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">Key Themes</h3>
            <EditablePills items={dna.key_themes || []} color="#0d9488"
              onUpdate={(items) => update((d) => ({ ...d, key_themes: items }))} placeholder="Add theme..." />
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="pt-5 pb-5">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">Trust Signals</h3>
            <EditablePills items={dna.trust_signals || []} color="#10b981"
              onUpdate={(items) => update((d) => ({ ...d, trust_signals: items }))} placeholder="Add signal..." />
          </CardContent>
        </Card>
      </div>

      {/* Brand Story */}
      <Card className="glass-panel">
        <CardContent className="pt-5 pb-5">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">Brand Story</h3>
          <EditableText value={dna.brand_story || ''} multiline
            onSave={(v) => update((d) => ({ ...d, brand_story: v }))} placeholder="Add your brand story..." />
        </CardContent>
      </Card>

      {/* Competitors */}
      {competitors.length > 0 && (
        <Card className="glass-panel">
          <CardContent className="pt-5 pb-5">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">
              Competitors ({competitors.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {competitors.map((c, i) => (
                <div key={i} className="rounded-lg bg-white/5 p-3 space-y-1">
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  {c.domain && <p className="text-[10px] font-metric text-muted-foreground">{c.domain}</p>}
                  {c.why_competitor && <p className="text-xs text-muted-foreground line-clamp-2">{c.why_competitor}</p>}
                  {c.type && (
                    <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full ${c.type === 'direct' ? 'bg-[#0d9488]/10 text-[#0d9488]' : 'bg-[#7c3aed]/10 text-[#7c3aed]'}`}>
                      {c.type === 'direct' ? 'Direct' : 'Market'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sticky save bar when dirty */}
      {dirty && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}
            className="gap-1.5 bg-[#6366f1] text-white hover:bg-[#5254cc] shadow-lg shadow-[#6366f1]/20">
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}
    </div>
  )
}
