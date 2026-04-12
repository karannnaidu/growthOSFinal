// ---------------------------------------------------------------------------
// Mia Orchestration Engine — Task 3.1
//
// Mia is Growth OS's marketing manager AI. After a skill completes she:
//   1. Checks safety guardrails (chain depth, daily credit cap, hourly rate, wallet).
//   2. Calls Claude Sonnet to decide whether to auto-run follow-up skills,
//      flag for review, or skip.
//   3. Executes the decision — running follow-up skills sequentially or
//      creating a notification for human review.
//   4. Always creates an activity notification for the brand.
//
// Server-side only — uses Next.js server Supabase client.
// ---------------------------------------------------------------------------

import { loadSkill, type SkillDefinition } from '@/lib/skill-loader';
import { callModel } from '@/lib/model-client';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OrchestrationResult {
  decision: 'auto_run' | 'needs_review' | 'skip';
  followUpSkills: string[];
  notifications: Array<{ type: string; title: string; body: string }>;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface GuardrailCheck {
  allowed: boolean;
  reason?: string;
}

interface MiaDecision {
  decision: 'auto_run' | 'needs_review' | 'skip';
  followUpSkills: string[];
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Claude Sonnet provider / model used for all Mia decisions. */
const MIA_MODEL = 'claude-sonnet-4-6';
const MIA_PROVIDER = 'anthropic';

/** Max number of auto-chained skill runs in a single chain. */
const MAX_CHAIN_DEPTH = 5;

/** Max Mia-triggered credits consumed per brand per day. */
const DAILY_CREDIT_CAP = 50;

/** Max Mia-triggered skill runs per brand per hour. */
const HOURLY_RUN_LIMIT = 20;

/** If a batch of follow-up skills would cost more than this, require approval. */
const APPROVAL_GATE_CREDITS = 10;

// ---------------------------------------------------------------------------
// Decision prompt
// ---------------------------------------------------------------------------

const MIA_DECISION_SYSTEM_PROMPT = `You are Mia, the marketing manager AI for a D2C brand.

A skill just completed. Based on its output, decide what should happen next.

Rules:
- Only suggest skills from the available follow-up skills list.
- If the output reveals urgent issues (poor performance, anomalies, errors), mark as needs_review.
- If the output is routine and follow-ups are natural next steps, use auto_run.
- If the output is complete and no follow-up is needed, use skip.
- Be conservative — don't chain unnecessarily. Quality over quantity.
- Never suggest more than 2 follow-up skills at a time.

Respond ONLY with valid JSON (no markdown fences):
{
  "decision": "auto_run" | "needs_review" | "skip",
  "followUpSkills": ["skill-id-1"],
  "reasoning": "Brief explanation (1–2 sentences)"
}`;

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

async function checkGuardrails(brandId: string, chainDepth: number): Promise<GuardrailCheck> {
  // 1. Chain depth
  if (chainDepth >= MAX_CHAIN_DEPTH) {
    return { allowed: false, reason: `Max chain depth (${MAX_CHAIN_DEPTH}) reached` };
  }

  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = createServiceClient();

  // 2. Daily credit cap — sum credits used by mia-triggered runs today
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const { data: dailyData, error: dailyError } = await supabase
    .from('skill_runs')
    .select('credits_used')
    .eq('brand_id', brandId)
    .eq('triggered_by', 'mia')
    .gte('created_at', `${today}T00:00:00.000Z`);

  if (!dailyError && dailyData) {
    const dailyTotal = dailyData.reduce((sum, row) => sum + (row.credits_used ?? 0), 0);
    if (dailyTotal >= DAILY_CREDIT_CAP) {
      return { allowed: false, reason: `Daily credit cap (${DAILY_CREDIT_CAP}) reached (used: ${dailyTotal})` };
    }
  }

  // 3. Hourly run rate limit
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: hourlyData, error: hourlyError } = await supabase
    .from('skill_runs')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('triggered_by', 'mia')
    .gte('created_at', oneHourAgo);

  if (!hourlyError) {
    // When using head: true the count is on the response, not in data
    const hourlyCount = (hourlyData as unknown as { count?: number } | null)?.count ?? 0;
    if (hourlyCount >= HOURLY_RUN_LIMIT) {
      return { allowed: false, reason: `Hourly run limit (${HOURLY_RUN_LIMIT}) reached` };
    }
  }

  // 4. Wallet balance — must have at least 1 credit to continue
  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('balance, free_credits, free_credits_expires_at, circuit_breaker')
    .eq('brand_id', brandId)
    .single();

  if (!walletError && wallet) {
    if (wallet.circuit_breaker) {
      return { allowed: false, reason: 'Wallet circuit breaker is active' };
    }

    const freeCreditsAvailable =
      wallet.free_credits_expires_at && new Date(wallet.free_credits_expires_at) > new Date()
        ? (wallet.free_credits ?? 0)
        : 0;
    const totalAvailable = (wallet.balance ?? 0) + freeCreditsAvailable;

    if (totalAvailable < 1) {
      return { allowed: false, reason: 'Insufficient wallet balance for further auto-runs' };
    }
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Approval gate
// ---------------------------------------------------------------------------

/**
 * Returns true if the combined credit cost of the follow-up skills is within
 * the auto-run approval threshold. If it exceeds the threshold a human review
 * notification should be created instead.
 */
function checkApprovalGate(followUpSkills: SkillDefinition[]): boolean {
  const totalCredits = followUpSkills.reduce((sum, s) => sum + (s.credits ?? 0), 0);
  return totalCredits <= APPROVAL_GATE_CREDITS;
}

// ---------------------------------------------------------------------------
// Notification helper
// ---------------------------------------------------------------------------

async function createNotification(
  brandId: string,
  notification: {
    type: 'needs_review' | 'auto_completed' | 'insight' | 'alert';
    title: string;
    body: string;
    agentId?: string;
    skillRunId?: string;
    actionUrl?: string;
  },
): Promise<void> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = createServiceClient();

    await supabase.from('notifications').insert({
      brand_id: brandId,
      agent_id: notification.agentId ?? null,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      action_url: notification.actionUrl ?? null,
      skill_run_id: notification.skillRunId ?? null,
    });
  } catch (err) {
    // Notification failures are non-fatal
    console.warn('[Mia] Failed to create notification:', err);
  }
}

// ---------------------------------------------------------------------------
// LLM decision call
// ---------------------------------------------------------------------------

async function getMiaDecision(
  skillId: string,
  output: Record<string, unknown>,
  chainsTo: string[],
  brandContext: { id: string; name?: string },
): Promise<MiaDecision> {
  const userPrompt = [
    `## Completed Skill\nSkill ID: ${skillId}`,
    `## Skill Output\n${JSON.stringify(output, null, 2)}`,
    `## Available Follow-Up Skills\n${chainsTo.length > 0 ? chainsTo.join(', ') : 'None'}`,
    `## Brand Context\nBrand ID: ${brandContext.id}${brandContext.name ? `\nBrand Name: ${brandContext.name}` : ''}`,
  ].join('\n\n');

  let rawContent: string;
  try {
    const result = await callModel({
      model: MIA_MODEL,
      provider: MIA_PROVIDER,
      systemPrompt: MIA_DECISION_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 512,
      temperature: 0.3,
    });
    rawContent = result.content;
  } catch (err) {
    console.warn('[Mia] LLM decision call failed, defaulting to needs_review:', err);
    return {
      decision: 'needs_review',
      followUpSkills: [],
      reasoning: 'Decision call failed — defaulting to human review.',
    };
  }

  // Strip markdown fences if present
  const cleaned = rawContent
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<MiaDecision>;

    const decision: 'auto_run' | 'needs_review' | 'skip' =
      parsed.decision === 'auto_run' || parsed.decision === 'needs_review' || parsed.decision === 'skip'
        ? parsed.decision
        : 'needs_review';

    // Only keep follow-up skills that are in the allowed chains_to list
    const followUpSkills = Array.isArray(parsed.followUpSkills)
      ? parsed.followUpSkills.filter((s): s is string => typeof s === 'string' && chainsTo.includes(s))
      : [];

    return {
      decision,
      followUpSkills,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    console.warn('[Mia] Failed to parse decision JSON, defaulting to needs_review. Raw:', rawContent);
    return {
      decision: 'needs_review',
      followUpSkills: [],
      reasoning: 'Could not parse Mia decision — defaulting to human review.',
    };
  }
}

// ---------------------------------------------------------------------------
// Main orchestration function
// ---------------------------------------------------------------------------

/**
 * Called by skills-engine after a successful skill run.
 *
 * @param brandId    - The brand this run belongs to.
 * @param skillRunId - The DB id of the completed skill_run record.
 * @param skillId    - The skill that just ran.
 * @param output     - The output produced by the skill.
 */
export async function miaOrchestrate(
  brandId: string,
  skillRunId: string,
  skillId: string,
  output: Record<string, unknown>,
): Promise<OrchestrationResult> {
  const notifications: Array<{ type: string; title: string; body: string }> = [];

  // 1. Load skill definition to get chains_to and chain depth
  let skill: SkillDefinition;
  try {
    skill = await loadSkill(skillId);
  } catch (err) {
    console.warn('[Mia] Could not load skill definition, skipping orchestration:', err);
    return { decision: 'skip', followUpSkills: [], notifications: [], reasoning: 'Skill definition not found.' };
  }

  // 2. Determine current chain depth from the triggering skill run record
  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = createServiceClient();

  const { data: runRecord } = await supabase
    .from('skill_runs')
    .select('chain_depth')
    .eq('id', skillRunId)
    .single();

  const chainDepth: number = runRecord?.chain_depth ?? 0;

  // 3. Guardrails check
  const guardrail = await checkGuardrails(brandId, chainDepth);
  if (!guardrail.allowed) {
    const reason = guardrail.reason ?? 'Guardrail blocked further auto-chaining';
    await createNotification(brandId, {
      type: 'insight',
      title: 'Auto-chain paused',
      body: reason,
      skillRunId,
    });
    notifications.push({ type: 'insight', title: 'Auto-chain paused', body: reason });
    return { decision: 'skip', followUpSkills: [], notifications, reasoning: reason };
  }

  // If there are no follow-up options, skip without calling the LLM
  if (skill.chainsTo.length === 0) {
    return { decision: 'skip', followUpSkills: [], notifications: [], reasoning: 'No follow-up skills defined for this skill.' };
  }

  // 4. Load brand context (name only — we don't want to pass PII to the LLM unnecessarily)
  const { data: brand } = await supabase
    .from('brands')
    .select('id, name')
    .eq('id', brandId)
    .single();

  // 5. Ask Mia to decide
  const decision = await getMiaDecision(
    skillId,
    output,
    skill.chainsTo,
    brand ?? { id: brandId },
  );

  // 6. Execute the decision
  if (decision.decision === 'auto_run' && decision.followUpSkills.length > 0) {
    // Load definitions for the follow-up skills to check credits
    const followUpDefs: SkillDefinition[] = [];
    for (const fSkillId of decision.followUpSkills) {
      try {
        const fSkill = await loadSkill(fSkillId);
        followUpDefs.push(fSkill);
      } catch {
        // Skip any skill we can't load
        console.warn(`[Mia] Could not load follow-up skill "${fSkillId}", skipping.`);
      }
    }

    // Approval gate — if total cost is too high, downgrade to needs_review
    if (!checkApprovalGate(followUpDefs)) {
      const totalCost = followUpDefs.reduce((s, d) => s + (d.credits ?? 0), 0);
      const body = `Mia wants to auto-run ${followUpDefs.map((d) => d.name).join(', ')} (${totalCost} credits total) but this exceeds the approval threshold. Please review and approve.`;

      await createNotification(brandId, {
        type: 'needs_review',
        title: 'Approval required for auto-chain',
        body,
        skillRunId,
      });

      notifications.push({ type: 'needs_review', title: 'Approval required for auto-chain', body });

      return {
        decision: 'needs_review',
        followUpSkills: decision.followUpSkills,
        notifications,
        reasoning: `${decision.reasoning} — approval required (${totalCost} credits exceeds ${APPROVAL_GATE_CREDITS}-credit gate).`,
      };
    }

    // Lazy-import runSkill here to avoid circular dependency at module load time
    const { runSkill } = await import('@/lib/skills-engine');

    // Run follow-up skills sequentially to avoid wallet race conditions
    const ranSkills: string[] = [];
    for (const fSkillId of decision.followUpSkills) {
      try {
        await runSkill({
          brandId,
          skillId: fSkillId,
          triggeredBy: 'mia',
          parentRunId: skillRunId,
          chainDepth: chainDepth + 1,
        });
        ranSkills.push(fSkillId);
      } catch (err) {
        console.warn(`[Mia] Failed to run follow-up skill "${fSkillId}":`, err);
      }
    }

    if (ranSkills.length > 0) {
      const body = `Mia auto-ran: ${ranSkills.join(', ')}. Reasoning: ${decision.reasoning}`;
      await createNotification(brandId, {
        type: 'auto_completed',
        title: 'Mia auto-chained skills',
        body,
        skillRunId,
      });
      notifications.push({ type: 'auto_completed', title: 'Mia auto-chained skills', body });
    }

    return {
      decision: 'auto_run',
      followUpSkills: ranSkills,
      notifications,
      reasoning: decision.reasoning,
    };
  }

  if (decision.decision === 'needs_review') {
    const body = `Mia flagged this run for your review. Reasoning: ${decision.reasoning}`;
    await createNotification(brandId, {
      type: 'needs_review',
      title: `Review needed: ${skill.name}`,
      body,
      skillRunId,
    });
    notifications.push({ type: 'needs_review', title: `Review needed: ${skill.name}`, body });

    return {
      decision: 'needs_review',
      followUpSkills: [],
      notifications,
      reasoning: decision.reasoning,
    };
  }

  // decision === 'skip' or no valid follow-ups
  return {
    decision: 'skip',
    followUpSkills: [],
    notifications,
    reasoning: decision.reasoning,
  };
}
