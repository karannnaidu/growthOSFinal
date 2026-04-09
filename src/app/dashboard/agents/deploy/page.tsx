'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Palette, ArrowLeft, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AGENTS, AGENT_COLORS } from '@/lib/agents-data'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillOption {
  id: string
  name: string
  agent: string
}

type Tier = 'free' | 'cheap' | 'mid' | 'premium'

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'cheap', label: 'Cheap' },
  { value: 'mid', label: 'Mid' },
  { value: 'premium', label: 'Premium' },
]

const COLOR_PALETTE = [
  '#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EF4444', '#14B8A6', '#F97316', '#06B6D4',
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DeployAgentPage() {
  const router = useRouter()
  const supabase = createClient()

  // Plan gate
  const [planAllowed, setPlanAllowed] = useState<boolean | null>(null)
  const [brandId, setBrandId] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [roleDescription, setRoleDescription] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [customSkillMarkdown, setCustomSkillMarkdown] = useState('')
  const [tier, setTier] = useState<Tier>('free')
  const [creditsPerRun, setCreditsPerRun] = useState(1)
  const [schedule, setSchedule] = useState('')
  const [autoApprove, setAutoApprove] = useState(false)
  const [agentColor, setAgentColor] = useState(COLOR_PALETTE[0])

  // Data
  const [availableSkills, setAvailableSkills] = useState<SkillOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      setIsLoading(true)

      // Resolve user + brand
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not authenticated'); setIsLoading(false); return }

      let bid: string | null = null
      const { data: ownedBrand } = await supabase
        .from('brands').select('id, plan').eq('owner_id', user.id).limit(1).single()

      if (ownedBrand) {
        bid = ownedBrand.id as string
        const plan = (ownedBrand as { plan?: string }).plan ?? 'starter'
        setPlanAllowed(plan === 'growth' || plan === 'agency')
      } else {
        const { data: member } = await supabase
          .from('brand_members').select('brand_id').eq('user_id', user.id).limit(1).single()
        if (member) {
          bid = member.brand_id as string
          const { data: brand } = await supabase
            .from('brands').select('plan').eq('id', bid).single()
          const plan = (brand as { plan?: string } | null)?.plan ?? 'starter'
          setPlanAllowed(plan === 'growth' || plan === 'agency')
        }
      }

      if (!bid) { setError('No brand found'); setIsLoading(false); return }
      setBrandId(bid)

      // Load skills
      try {
        const res = await fetch('/api/skills')
        if (res.ok) {
          const json = await res.json() as { success: boolean; data?: SkillOption[] }
          setAvailableSkills((json.data ?? []).map(s => ({ id: s.id, name: s.name, agent: s.agent })))
        }
      } catch {
        // non-fatal
      }

      setIsLoading(false)
    }

    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleSkill(skillId: string) {
    setSelectedSkills(prev =>
      prev.includes(skillId) ? prev.filter(s => s !== skillId) : [...prev, skillId]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!brandId || !name.trim()) return

    setIsSubmitting(true)
    setError(null)

    try {
      // Create brand_agents record
      const { data: agentRow, error: agentErr } = await supabase
        .from('brand_agents')
        .insert({
          brand_id: brandId,
          agent_id: name.toLowerCase().replace(/\s+/g, '-'),
          display_name: name.trim(),
          role_description: roleDescription.trim(),
          base_skills: selectedSkills,
          complexity_tier: tier,
          credits_per_run: creditsPerRun,
          schedule: schedule.trim() || null,
          auto_approve: autoApprove,
          color: agentColor,
          is_active: true,
        })
        .select('id')
        .single()

      if (agentErr) throw new Error(agentErr.message)

      // Optionally create custom_skills record
      if (customSkillMarkdown.trim() && agentRow?.id) {
        await supabase.from('custom_skills').insert({
          brand_id: brandId,
          brand_agent_id: agentRow.id,
          name: `${name.trim()} Custom Skill`,
          markdown: customSkillMarkdown.trim(),
          is_active: true,
        })
      }

      router.push('/dashboard/agents')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create agent')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Plan gate
  if (planAllowed === false) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Link
          href="/dashboard/agents"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Agents
        </Link>

        <div className="glass-panel rounded-xl p-10 text-center max-w-lg mx-auto space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/10">
            <Lock className="h-7 w-7 text-indigo-400" />
          </div>
          <h2 className="text-xl font-heading font-bold text-foreground">
            Upgrade to Deploy Custom Agents
          </h2>
          <p className="text-sm text-muted-foreground">
            Custom agent deployment is available on the Growth and Agency plans.
            Upgrade your plan to create custom agents with tailored skills and schedules.
          </p>
          <Button
            onClick={() => router.push('/dashboard/billing')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            View Plans
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back nav */}
      <Link
        href="/dashboard/agents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Agents
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-heading font-bold text-foreground">Deploy Custom Agent</h1>
        <p className="text-sm text-muted-foreground">
          Create a custom agent with tailored skills, schedules, and approval settings.
        </p>
      </div>

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="glass-panel rounded-xl p-6 max-w-2xl space-y-6">
        {/* Agent Name */}
        <div className="space-y-1.5">
          <label htmlFor="agent-name" className="text-sm font-heading font-medium text-foreground">
            Agent Name
          </label>
          <Input
            id="agent-name"
            placeholder="e.g. Campaign Strategist"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        {/* Role Description */}
        <div className="space-y-1.5">
          <label htmlFor="role-desc" className="text-sm font-heading font-medium text-foreground">
            Role Description
          </label>
          <Input
            id="role-desc"
            placeholder="Describe what this agent does..."
            value={roleDescription}
            onChange={(e) => setRoleDescription(e.target.value)}
          />
        </div>

        {/* Agent Color */}
        <div className="space-y-1.5">
          <label className="text-sm font-heading font-medium text-foreground flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5" />
            Agent Color
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setAgentColor(color)}
                className={cn(
                  'h-8 w-8 rounded-full border-2 transition-all',
                  agentColor === color ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                )}
                style={{ background: color }}
                aria-label={`Select color ${color}`}
              />
            ))}
            {/* Preview */}
            <div
              className="ml-3 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: `radial-gradient(circle at 35% 35%, ${agentColor}cc, ${agentColor}55)` }}
            >
              {name[0]?.toUpperCase() ?? '?'}
            </div>
          </div>
        </div>

        {/* Base Skills Multi-Select */}
        <div className="space-y-1.5">
          <label className="text-sm font-heading font-medium text-foreground">
            Base Skills
          </label>
          <p className="text-xs text-muted-foreground">Select skills this agent can run.</p>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.1] bg-white/[0.02] p-2 space-y-1">
            {availableSkills.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">No skills available</p>
            ) : (
              availableSkills.map((skill) => (
                <label
                  key={skill.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors text-xs',
                    selectedSkills.includes(skill.id)
                      ? 'bg-indigo-500/10 text-foreground'
                      : 'text-muted-foreground hover:bg-white/[0.04]'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedSkills.includes(skill.id)}
                    onChange={() => toggleSkill(skill.id)}
                    className="accent-indigo-500"
                  />
                  <span>{skill.name}</span>
                  <span className="ml-auto text-[10px] opacity-60">{skill.agent}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Custom Skill Markdown */}
        <div className="space-y-1.5">
          <label htmlFor="custom-skill" className="text-sm font-heading font-medium text-foreground">
            Custom Skill Definition (Markdown)
          </label>
          <p className="text-xs text-muted-foreground">
            Optional: define a new skill in markdown for this agent.
          </p>
          <textarea
            id="custom-skill"
            rows={6}
            placeholder="# My Custom Skill&#10;&#10;## System Prompt&#10;You are an expert at..."
            value={customSkillMarkdown}
            onChange={(e) => setCustomSkillMarkdown(e.target.value)}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 font-mono resize-y dark:bg-input/30"
          />
        </div>

        {/* Tier + Credits */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="tier" className="text-sm font-heading font-medium text-foreground">
              Complexity Tier
            </label>
            <select
              id="tier"
              value={tier}
              onChange={(e) => setTier(e.target.value as Tier)}
              className="h-8 w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TIER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="credits" className="text-sm font-heading font-medium text-foreground">
              Credits per Run
            </label>
            <Input
              id="credits"
              type="number"
              min={0}
              value={creditsPerRun}
              onChange={(e) => setCreditsPerRun(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Schedule */}
        <div className="space-y-1.5">
          <label htmlFor="schedule" className="text-sm font-heading font-medium text-foreground">
            Schedule (Cron Expression)
          </label>
          <p className="text-xs text-muted-foreground">
            Optional. e.g. <code className="text-[10px] bg-white/[0.06] rounded px-1">0 9 * * 1</code> for every Monday at 9 AM.
          </p>
          <Input
            id="schedule"
            placeholder="0 9 * * 1"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
          />
        </div>

        {/* Auto-approve toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={autoApprove}
            onClick={() => setAutoApprove(!autoApprove)}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors',
              autoApprove ? 'bg-indigo-500' : 'bg-white/[0.15]'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-0.5',
                autoApprove ? 'translate-x-4.5 ml-px' : 'translate-x-0.5'
              )}
            />
          </button>
          <label className="text-sm text-foreground cursor-pointer" onClick={() => setAutoApprove(!autoApprove)}>
            Auto-approve outputs
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Deploying...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1.5" />
                Deploy Agent
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push('/dashboard/agents')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
