'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Coins,
  Zap,
  RefreshCw,
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BalanceData {
  total: number
  free_credits: number
  balance: number
  /** @deprecated Use free_credits. Kept for backwards compatibility. */
  freeCredits?: number
  freeCreditsExpiresAt: string | null
  autoRecharge: boolean
  autoRechargeThreshold: number | null
  autoRechargeAmount: number | null
  creditsUsedToday: number
  creditsUsedThisMonth: number
}

interface Transaction {
  id: string
  type: 'deposit' | 'usage' | 'refund' | string
  credits: number
  amount_cents: number | null
  description: string | null
  stripe_payment_intent_id: string | null
  created_at: string
}

interface TransactionsData {
  transactions: Transaction[]
  page: number
  limit: number
  total: number
}

// ---------------------------------------------------------------------------
// Credit pack definitions (must match backend CREDIT_PACKS)
// ---------------------------------------------------------------------------

const CREDIT_PACKS = [
  { credits: 500,  priceInCents: 1500, label: '500 Credits',   price: '$15' },
  { credits: 1000, priceInCents: 2500, label: '1,000 Credits', price: '$25' },
  { credits: 2500, priceInCents: 5000, label: '2,500 Credits', price: '$50' },
  { credits: 5000, priceInCents: 8000, label: '5,000 Credits', price: '$80' },
]

const AUTO_RECHARGE_AMOUNTS = [500, 1000, 2500] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function estimateDaysRemaining(balance: number, usedThisMonth: number): string {
  const daysInMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0,
  ).getDate()
  const dayOfMonth = new Date().getDate()
  const daysElapsed = Math.max(1, dayOfMonth)
  const dailyRate = usedThisMonth / daysElapsed
  if (dailyRate === 0) return 'N/A'
  const days = Math.floor(balance / dailyRate)
  if (days > 999) return '999+ days'
  return `~${days} day${days !== 1 ? 's' : ''}`
}

// ---------------------------------------------------------------------------
// Transaction badge
// ---------------------------------------------------------------------------

function TransactionBadge({ type }: { type: string }) {
  if (type === 'deposit') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-[#059669]/15 text-[#059669]">
        <ArrowDownCircle className="h-3 w-3" />
        Deposit
      </span>
    )
  }
  if (type === 'usage') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-[#f59e0b]/15 text-[#f59e0b]">
        <Zap className="h-3 w-3" />
        Usage
      </span>
    )
  }
  if (type === 'refund') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-[#ef4444]/15 text-[#ef4444]">
        <RotateCcw className="h-3 w-3" />
        Refund
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-white/[0.06] text-muted-foreground">
      {type}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const supabase = createClient()

  const [brandId, setBrandId] = useState<string | null>(null)
  const [balance, setBalance] = useState<BalanceData | null>(null)
  const [transactions, setTransactions] = useState<TransactionsData | null>(null)
  const [isLoadingBalance, setIsLoadingBalance] = useState(true)
  const [isLoadingTx, setIsLoadingTx] = useState(true)
  const [txPage, setTxPage] = useState(1)
  const [topping, setTopping] = useState<number | null>(null)
  const [autoRechargeLoading, setAutoRechargeLoading] = useState(false)
  const [localAutoRecharge, setLocalAutoRecharge] = useState(false)
  const [localThreshold, setLocalThreshold] = useState<number>(200)
  const [localAmount, setLocalAmount] = useState<number>(1000)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 1. Resolve brand via API (bypasses RLS)
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

  // 2. Fetch balance
  const fetchBalance = useCallback(async (bid: string) => {
    setIsLoadingBalance(true)
    try {
      const res = await fetch(`/api/billing/balance?brandId=${bid}`)
      if (res.ok) {
        const data = await res.json() as BalanceData
        setBalance(data)
        setLocalAutoRecharge(data.autoRecharge)
        setLocalThreshold(data.autoRechargeThreshold ?? 200)
        setLocalAmount(data.autoRechargeAmount ?? 1000)
      }
    } finally {
      setIsLoadingBalance(false)
    }
  }, [])

  // 3. Fetch transactions
  const fetchTransactions = useCallback(async (bid: string, page: number) => {
    setIsLoadingTx(true)
    try {
      const res = await fetch(`/api/billing/transactions?brandId=${bid}&page=${page}&limit=10`)
      if (res.ok) {
        const data = await res.json() as TransactionsData
        setTransactions(data)
      }
    } finally {
      setIsLoadingTx(false)
    }
  }, [])

  useEffect(() => {
    if (!brandId) return
    fetchBalance(brandId)
    fetchTransactions(brandId, txPage)
  }, [brandId, txPage, fetchBalance, fetchTransactions])

  // Check for success/cancel query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      setSuccessMsg('Payment successful! Credits will be added shortly.')
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/billing')
      if (brandId) fetchBalance(brandId)
    } else if (params.get('canceled') === 'true') {
      window.history.replaceState({}, '', '/dashboard/billing')
    }
  }, [brandId, fetchBalance])

  // 4. Top-up handler
  async function handleTopUp(credits: number) {
    if (!brandId) return
    setTopping(credits)
    try {
      const res = await fetch('/api/billing/top-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, credits }),
      })
      if (res.ok) {
        const { checkoutUrl } = await res.json() as { checkoutUrl: string }
        window.location.href = checkoutUrl
      }
    } finally {
      setTopping(null)
    }
  }

  // 5. Auto-recharge handler
  async function handleAutoRechargeToggle() {
    if (!brandId) return
    const newValue = !localAutoRecharge
    setAutoRechargeLoading(true)
    try {
      const res = await fetch('/api/billing/auto-recharge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          autoRecharge: newValue,
          threshold: localThreshold,
          amount: localAmount,
        }),
      })
      if (res.ok) {
        setLocalAutoRecharge(newValue)
      }
    } finally {
      setAutoRechargeLoading(false)
    }
  }

  async function handleSaveAutoRecharge() {
    if (!brandId) return
    setAutoRechargeLoading(true)
    try {
      const res = await fetch('/api/billing/auto-recharge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          autoRecharge: localAutoRecharge,
          threshold: localThreshold,
          amount: localAmount,
        }),
      })
      if (res.ok) {
        setSuccessMsg('Auto-recharge settings saved.')
        setTimeout(() => setSuccessMsg(null), 3000)
      }
    } finally {
      setAutoRechargeLoading(false)
    }
  }

  const totalCredits = balance?.total ?? 0
  const usedThisMonth = balance?.creditsUsedThisMonth ?? 0
  // Usage % = credits used vs total pool (remaining + used). Don't inflate denominator.
  const totalPool = totalCredits + usedThisMonth // total that was available at start of month
  const usagePercent = totalPool > 0 ? Math.min(100, Math.round((usedThisMonth / totalPool) * 100)) : 0
  const totalPages = transactions ? Math.ceil(transactions.total / transactions.limit) : 1

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your credits and payment settings</p>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="rounded-lg border border-[#059669]/30 bg-[#059669]/10 px-4 py-3 text-sm text-[#059669]">
          {successMsg}
        </div>
      )}

      {/* ── Row 1: Balance + Usage stats ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Credit Balance Card */}
        <Card className="glass-panel glow-penny lg:col-span-2">
          <CardHeader className="border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#059669]/15">
                <Coins className="h-4 w-4 text-[#059669]" />
              </div>
              <CardTitle>Credit Balance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            {isLoadingBalance ? (
              <div className="space-y-3">
                <div className="h-12 w-40 animate-pulse rounded-lg bg-white/[0.06]" />
                <div className="h-3 w-full animate-pulse rounded bg-white/[0.06]" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p
                    className="text-5xl font-metric font-bold leading-none"
                    style={{ color: '#059669' }}
                  >
                    {totalCredits.toLocaleString()}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">total credits available</p>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{usedThisMonth.toLocaleString()} used this month</span>
                    <span>{usagePercent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full bg-[#059669] transition-all duration-500"
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Paid credits: </span>
                    <span className="font-medium text-foreground">
                      {(balance?.balance ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="h-3 w-px bg-white/[0.12]" />
                  <div>
                    <span className="text-muted-foreground">Free credits: </span>
                    <span className="font-medium text-foreground">
                      {(balance?.free_credits ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="h-3 w-px bg-white/[0.12]" />
                  <div>
                    <span className="text-muted-foreground">Est. days left: </span>
                    <span className="font-medium text-foreground">
                      {estimateDaysRemaining(totalCredits, usedThisMonth)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage Stats */}
        <div className="space-y-4">
          <Card className="glass-panel">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#6366f1]/15">
                  <Zap className="h-4 w-4 text-[#6366f1]" />
                </div>
                <div>
                  <p className="text-2xl font-metric font-semibold text-[#6366f1]">
                    {isLoadingBalance ? '—' : (balance?.creditsUsedToday ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Credits today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-panel">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0d9488]/15">
                  <TrendingUp className="h-4 w-4 text-[#0d9488]" />
                </div>
                <div>
                  <p className="text-2xl font-metric font-semibold text-[#0d9488]">
                    {isLoadingBalance ? '—' : usedThisMonth.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Credits this month</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Row 2: Top-Up Packs ── */}
      <Card className="glass-panel">
        <CardHeader className="border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6366f1]/15">
              <ArrowUpCircle className="h-4 w-4 text-[#6366f1]" />
            </div>
            <CardTitle>Top Up Credits</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CREDIT_PACKS.map((pack) => (
              <button
                key={pack.credits}
                onClick={() => handleTopUp(pack.credits)}
                disabled={topping !== null}
                className="group relative flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-left transition-all hover:border-[#6366f1]/40 hover:bg-[#6366f1]/05 disabled:opacity-60 disabled:pointer-events-none"
              >
                {topping === pack.credits && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60">
                    <RefreshCw className="h-4 w-4 animate-spin text-[#6366f1]" />
                  </div>
                )}
                <p className="text-xl font-metric font-bold text-foreground">
                  {pack.credits.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">credits</p>
                <p className="mt-auto text-sm font-semibold text-[#6366f1]">{pack.price}</p>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Credits never expire. Payments processed securely via Stripe.
          </p>
        </CardContent>
      </Card>

      {/* ── Row 3: Auto-Recharge ── */}
      <Card className="glass-panel">
        <CardHeader className="border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#059669]/15">
                <RefreshCw className="h-4 w-4 text-[#059669]" />
              </div>
              <CardTitle>Auto-Recharge</CardTitle>
            </div>
            {/* Toggle */}
            <button
              role="switch"
              aria-checked={localAutoRecharge}
              onClick={handleAutoRechargeToggle}
              disabled={autoRechargeLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                localAutoRecharge ? 'bg-[#059669]' : 'bg-white/[0.12]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  localAutoRecharge ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="mb-4 text-sm text-muted-foreground">
            Automatically top up when your balance falls below a threshold.
          </p>
          <div
            className={`space-y-4 transition-opacity ${
              localAutoRecharge ? 'opacity-100' : 'opacity-40 pointer-events-none'
            }`}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Threshold */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Recharge when balance drops below
                </label>
                <div className="flex flex-wrap gap-2">
                  {[100, 200, 500].map((t) => (
                    <button
                      key={t}
                      onClick={() => setLocalThreshold(t)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        localThreshold === t
                          ? 'border-[#059669]/50 bg-[#059669]/15 text-[#059669]'
                          : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t.toLocaleString()} cr
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Add credits</label>
                <div className="flex flex-wrap gap-2">
                  {AUTO_RECHARGE_AMOUNTS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setLocalAmount(a)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        localAmount === a
                          ? 'border-[#059669]/50 bg-[#059669]/15 text-[#059669]'
                          : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {a.toLocaleString()} cr
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button
              onClick={handleSaveAutoRecharge}
              disabled={autoRechargeLoading}
              size="sm"
              className="bg-[#059669] text-white hover:bg-[#059669]/80"
            >
              {autoRechargeLoading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Row 4: Transaction History ── */}
      <Card className="glass-panel">
        <CardHeader className="border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06]">
              <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle>Transaction History</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-2 px-0">
          {isLoadingTx ? (
            <div className="space-y-2 px-4 py-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-white/[0.04]" />
              ))}
            </div>
          ) : !transactions?.transactions.length ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No transactions yet
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Credits</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground hidden sm:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <TransactionBadge type={tx.type} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                          {tx.description ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-metric font-semibold">
                          <span
                            className={
                              tx.type === 'usage'
                                ? 'text-[#f59e0b]'
                                : tx.type === 'refund'
                                ? 'text-[#ef4444]'
                                : 'text-[#059669]'
                            }
                          >
                            {tx.type === 'usage' ? '−' : '+'}
                            {Math.abs(tx.credits).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground hidden sm:table-cell">
                          <span>{formatDate(tx.created_at)}</span>
                          <br />
                          <span className="text-[10px]">{formatTime(tx.created_at)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    Page {transactions.page} of {totalPages} ({transactions.total} total)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      disabled={txPage <= 1}
                      onClick={() => setTxPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      disabled={txPage >= totalPages}
                      onClick={() => setTxPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
