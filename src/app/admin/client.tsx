'use client'

import { useState } from 'react'
import {
  Building2,
  Zap,
  CreditCard,
  DollarSign,
  AlertTriangle,
  Search,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'

interface Metrics {
  totalBrands: number
  totalSkillRuns: number
  totalCreditsUsed: number
  estimatedAiCostUsd: number
  totalAgencyBrands: number
}

interface Brand {
  id: string
  name: string
  domain: string | null
  plan: string
  created_at: string
  owner_id: string
}

interface AdminClientPageProps {
  metrics: Metrics
  brands: Brand[]
  recentErrors: Record<string, unknown>[]
}

function MetricCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function AdminClientPage({ metrics, brands, recentErrors }: AdminClientPageProps) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<keyof Brand>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(field: keyof Brand) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const filtered = brands
    .filter(
      (b) =>
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        (b.domain ?? '').toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const av = a[sortField] ?? ''
      const bv = b[sortField] ?? ''
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })

  function SortIcon({ field }: { field: keyof Brand }) {
    if (sortField !== field) return <span className="inline-block w-3" />
    return sortDir === 'asc' ? (
      <ChevronUp className="inline h-3 w-3" />
    ) : (
      <ChevronDown className="inline h-3 w-3" />
    )
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Super-admin view of all platform activity</p>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Brands"
          value={metrics.totalBrands.toLocaleString()}
          icon={Building2}
          sub={`${metrics.totalAgencyBrands} agency`}
        />
        <MetricCard
          label="Skill Runs"
          value={metrics.totalSkillRuns.toLocaleString()}
          icon={Zap}
        />
        <MetricCard
          label="Credits Used"
          value={metrics.totalCreditsUsed.toLocaleString()}
          icon={CreditCard}
        />
        <MetricCard
          label="Est. AI Cost"
          value={`$${metrics.estimatedAiCostUsd.toFixed(2)}`}
          icon={DollarSign}
          sub="at $0.001 / credit"
        />
      </div>

      {/* Recent Errors */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Recent Errors
        </h2>

        {recentErrors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No errors logged.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  {['severity', 'type', 'message', 'created_at'].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {col.replace('_', ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentErrors.map((err, i) => (
                  <tr key={(err.id as string) ?? i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          err.severity === 'critical'
                            ? 'bg-destructive/10 text-destructive'
                            : err.severity === 'error'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {(err.severity as string) ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(err.type as string) ?? '—'}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-foreground">
                      {(err.message as string) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {err.created_at
                        ? new Date(err.created_at as string).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Brand List */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Building2 className="h-5 w-5 text-primary" />
            Brands ({filtered.length})
          </h2>
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brands…"
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                {(
                  [
                    { label: 'Name', field: 'name' },
                    { label: 'Domain', field: 'domain' },
                    { label: 'Plan', field: 'plan' },
                    { label: 'Created', field: 'created_at' },
                  ] as { label: string; field: keyof Brand }[]
                ).map(({ label, field }) => (
                  <th
                    key={field}
                    onClick={() => toggleSort(field)}
                    className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors select-none"
                  >
                    {label} <SortIcon field={field} />
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No brands match your search.
                  </td>
                </tr>
              )}
              {filtered.map((brand) => (
                <tr key={brand.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{brand.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{brand.domain ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
                      {brand.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(brand.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/api/admin/brand/${brand.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      View detail
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
