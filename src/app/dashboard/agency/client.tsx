'use client'

import { useState } from 'react'
import { Building2, Plus, TrendingUp, CreditCard, Globe, ChevronDown } from 'lucide-react'

interface SubBrand {
  id: string
  name: string
  domain: string | null
  plan: string
  createdAt: string
  balance: number
}

interface AgencyClientPageProps {
  agencyBrand: { id: string; name: string }
  subBrands: SubBrand[]
  patterns: Record<string, unknown>[]
}

export function AgencyClientPage({ agencyBrand, subBrands, patterns }: AgencyClientPageProps) {
  const [showAddBrand, setShowAddBrand] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [newBrandDomain, setNewBrandDomain] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [brands, setBrands] = useState<SubBrand[]>(subBrands)
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null)
  const [showSwitcher, setShowSwitcher] = useState(false)

  async function handleAddBrand(e: React.FormEvent) {
    e.preventDefault()
    if (!newBrandName.trim()) return
    setAdding(true)
    setAddError(null)

    try {
      const res = await fetch('/api/agency/brands/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyBrandId: agencyBrand.id,
          name: newBrandName.trim(),
          domain: newBrandDomain.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error ?? 'Failed to create brand')
        return
      }
      const b = data.brand
      setBrands((prev) => [
        ...prev,
        {
          id: b.id,
          name: b.name,
          domain: b.domain ?? null,
          plan: b.plan ?? 'starter',
          createdAt: b.created_at,
          balance: 0,
        },
      ])
      setNewBrandName('')
      setNewBrandDomain('')
      setShowAddBrand(false)
    } catch {
      setAddError('Network error')
    } finally {
      setAdding(false)
    }
  }

  async function handleSwitchBrand(brandId: string) {
    setSwitchingTo(brandId)
    setShowSwitcher(false)
    try {
      const res = await fetch('/api/agency/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      })
      if (res.ok) {
        setActiveBrandId(brandId)
      }
    } finally {
      setSwitchingTo(null)
    }
  }

  const activeBrand = brands.find((b) => b.id === activeBrandId)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Agency Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Managing <span className="font-medium">{agencyBrand.name}</span> — {brands.length} brand
            {brands.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Brand Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowSwitcher((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Building2 className="h-4 w-4" />
            {activeBrand ? activeBrand.name : 'Switch Brand'}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>

          {showSwitcher && (
            <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-card shadow-lg">
              <div className="p-1">
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Sub-brands
                </div>
                {brands.length === 0 && (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">No brands yet</p>
                )}
                {brands.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleSwitchBrand(b.id)}
                    disabled={switchingTo === b.id}
                    className={`w-full text-left flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors ${
                      activeBrandId === b.id ? 'bg-accent font-medium' : ''
                    }`}
                  >
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    {b.name}
                    {switchingTo === b.id && (
                      <span className="ml-auto text-xs text-muted-foreground">switching…</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sub-brand Cards Grid */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Sub-brands</h2>
          <button
            onClick={() => setShowAddBrand((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Brand
          </button>
        </div>

        {/* Add Brand Form */}
        {showAddBrand && (
          <div className="mb-4 rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">New Sub-brand</h3>
            <form onSubmit={handleAddBrand} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Brand Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  placeholder="Acme Co."
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Domain (optional)
                </label>
                <input
                  type="text"
                  value={newBrandDomain}
                  onChange={(e) => setNewBrandDomain(e.target.value)}
                  placeholder="acme.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {addError && <p className="text-xs text-destructive">{addError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={adding}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {adding ? 'Creating…' : 'Create Brand'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddBrand(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {brands.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <Building2 className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No sub-brands yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click &ldquo;Add Brand&rdquo; to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((brand) => (
              <div
                key={brand.id}
                className={`rounded-xl border bg-card p-4 transition-all hover:shadow-md ${
                  activeBrandId === brand.id ? 'border-primary ring-1 ring-primary/20' : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{brand.name}</p>
                      {brand.domain && (
                        <p className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Globe className="h-2.5 w-2.5" />
                          {brand.domain}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
                    {brand.plan}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CreditCard className="h-3 w-3" />
                    {brand.balance.toLocaleString()} credits
                  </span>
                  <button
                    onClick={() => handleSwitchBrand(brand.id)}
                    disabled={switchingTo === brand.id || activeBrandId === brand.id}
                    className="rounded px-2 py-0.5 bg-accent hover:bg-accent/80 text-accent-foreground disabled:opacity-50 transition-colors"
                  >
                    {activeBrandId === brand.id ? 'Active' : switchingTo === brand.id ? '…' : 'Switch'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Cross-brand Patterns */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Cross-brand Patterns</h2>
        </div>

        {patterns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-2 text-sm text-muted-foreground">No patterns detected yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Patterns emerge as Mia analyzes data across your sub-brands.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {patterns.map((pattern) => (
              <div
                key={pattern.id as string}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {(pattern.title as string) ?? 'Pattern'}
                    </p>
                    {(pattern.description as string | undefined) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {pattern.description as string}
                      </p>
                    )}
                  </div>
                  {(pattern.confidence as number | undefined) && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {Math.round((pattern.confidence as number) * 100)}% confidence
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
