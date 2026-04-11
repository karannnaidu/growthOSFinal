'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Cpu, CheckCircle2, RefreshCw, Save } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Preset = 'autopilot' | 'budget' | 'quality' | 'byok'

interface PresetConfig {
  id: Preset
  label: string
  description: string
  costRange: string
  color: string
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const PRESETS: PresetConfig[] = [
  {
    id: 'autopilot',
    label: 'Autopilot',
    description:
      'Balanced mix of speed and quality. Growth OS selects the best model for each task automatically.',
    costRange: '~1–5 credits / run',
    color: '#6366f1',
  },
  {
    id: 'budget',
    label: 'Budget',
    description:
      'Uses lighter, faster models to minimize credit usage. Great for high-volume automations.',
    costRange: '~0.5–2 credits / run',
    color: '#059669',
  },
  {
    id: 'quality',
    label: 'Quality',
    description:
      'Always uses the highest-capability models. Best results, higher credit spend.',
    costRange: '~5–15 credits / run',
    color: '#7c3aed',
  },
  {
    id: 'byok',
    label: 'BYOK',
    description:
      'Bring your own API key. Use your OpenAI / Anthropic key and pay provider directly.',
    costRange: 'Your cost',
    color: '#f97316',
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AIModelSettingsPage() {
  const supabase = createClient()

  const [brandId, setBrandId] = useState<string | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<Preset>('autopilot')
  const [byokKey, setByokKey] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Resolve brand
  useEffect(() => {
    async function init() {
      const stored = sessionStorage.getItem('onboarding_brand_id') || localStorage.getItem('growth_os_brand_id')
      if (stored) { setBrandId(stored); return }
      try {
        const res = await fetch('/api/brands/me')
        if (res.ok) {
          const data = await res.json()
          if (data.brandId) {
            setBrandId(data.brandId)
            localStorage.setItem('growth_os_brand_id', data.brandId)
          }
        }
      } catch { /* ignore */ }
    }
    init()
  }, [])

  async function handleSave() {
    if (!brandId) return
    setIsSaving(true)
    setMessage(null)
    try {
      const body: Record<string, unknown> = { brandId, preset: selectedPreset }
      if (selectedPreset === 'byok' && byokKey) body.apiKey = byokKey
      const res = await fetch('/api/settings/ai-preset', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: 'AI model preset saved.' })
      } else {
        const err = await res.json() as { error?: string }
        setMessage({ type: 'error', text: err.error ?? 'Failed to save.' })
      }
    } finally {
      setIsSaving(false)
      setTimeout(() => setMessage(null), 4000)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Feedback */}
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-[#059669]/30 bg-[#059669]/10 text-[#059669]'
              : 'border-[#ef4444]/30 bg-[#ef4444]/10 text-[#ef4444]'
          }`}
        >
          {message.text}
        </div>
      )}

      <Card className="glass-panel">
        <CardHeader className="border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6366f1]/15">
              <Cpu className="h-4 w-4 text-[#6366f1]" />
            </div>
            <CardTitle>AI Model Preset</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose how Growth OS selects AI models for your agents. This affects quality, speed, and credit usage.
          </p>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {PRESETS.map((preset) => {
                  const isSelected = selectedPreset === preset.id
                  return (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedPreset(preset.id)}
                      className={`w-full flex items-start gap-4 rounded-xl border p-4 text-left transition-all ${
                        isSelected
                          ? `border-[${preset.color}]/40 bg-[${preset.color}]/08`
                          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]'
                      }`}
                      style={
                        isSelected
                          ? {
                              borderColor: `${preset.color}66`,
                              backgroundColor: `${preset.color}10`,
                            }
                          : undefined
                      }
                    >
                      {/* Radio indicator */}
                      <div className="mt-0.5 shrink-0">
                        {isSelected ? (
                          <CheckCircle2
                            className="h-5 w-5"
                            style={{ color: preset.color }}
                          />
                        ) : (
                          <div className="h-5 w-5 rounded-full border-2 border-white/[0.20]" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{preset.label}</p>
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: `${preset.color}20`,
                              color: preset.color,
                            }}
                          >
                            {preset.costRange}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* BYOK key field */}
              {selectedPreset === 'byok' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    API Key (OpenAI or Anthropic)
                  </label>
                  <Input
                    type="password"
                    value={byokKey}
                    onChange={(e) => setByokKey(e.target.value)}
                    placeholder="sk-... or sk-ant-..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Stored encrypted. We never log or share your key.
                  </p>
                </div>
              )}

              {/* Save */}
              <div className="pt-2">
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-[#6366f1] text-white hover:bg-[#6366f1]/80"
                >
                  {isSaving ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {isSaving ? 'Saving...' : 'Save Preset'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
