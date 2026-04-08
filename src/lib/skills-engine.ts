import { loadSkill, type SkillDefinition } from '@/lib/skill-loader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillRunInput {
  brandId: string;
  skillId: string;
  triggeredBy: 'user' | 'mia' | 'schedule';
  parentRunId?: string;
  chainDepth?: number;
  additionalContext?: Record<string, unknown>;
}

export interface SkillRunResult {
  id: string;
  status: 'completed' | 'failed';
  output: Record<string, unknown>;
  creditsUsed: number;
  modelUsed: string;
  durationMs: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Model routing (stub — Task 1.5 will replace)
// ---------------------------------------------------------------------------

/** Map skill complexity to a model identifier. */
function routeModel(complexity: SkillDefinition['complexity']): string {
  // TODO: Replace with actual model routing from model-client.ts (Task 1.5)
  const modelMap: Record<string, string> = {
    free: 'gemini-2.0-flash',
    cheap: 'deepseek-v3',
    mid: 'claude-sonnet-4-20250514',
    premium: 'claude-opus-4-20250514',
  };
  return modelMap[complexity] ?? 'deepseek-v3';
}

// ---------------------------------------------------------------------------
// LLM call stub (Task 1.5 will replace)
// ---------------------------------------------------------------------------

interface LLMCallParams {
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

/** Placeholder for the actual LLM call — returns mock output. */
async function callLLM(_params: LLMCallParams): Promise<Record<string, unknown>> {
  // TODO: Replace with actual model call from model-client.ts (Task 1.5)
  return {
    _stub: true,
    message: 'This is a stub response. Replace with real LLM output in Task 1.5.',
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Quality check
// ---------------------------------------------------------------------------

function qualityCheck(output: Record<string, unknown>): { pass: boolean; reason?: string } {
  const json = JSON.stringify(output);
  if (json.length < 50) {
    return { pass: false, reason: 'Output too short (< 50 chars)' };
  }
  if (Object.keys(output).length === 0) {
    return { pass: false, reason: 'Output has no keys' };
  }
  return { pass: true };
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(
  skill: SkillDefinition,
  brandContext: Record<string, unknown>,
  additionalContext?: Record<string, unknown>,
): { systemPrompt: string; userPrompt: string } {
  const systemParts: string[] = [];

  systemParts.push(skill.sections.systemPrompt);

  if (skill.sections.workflow) {
    systemParts.push(`\n## Workflow\n${skill.sections.workflow}`);
  }
  if (skill.sections.outputFormat) {
    systemParts.push(`\n## Output Format\n${skill.sections.outputFormat}`);
  }

  const userParts: string[] = [];
  userParts.push(`## Brand Context\n${JSON.stringify(brandContext, null, 2)}`);
  if (additionalContext && Object.keys(additionalContext).length > 0) {
    userParts.push(`## Additional Context\n${JSON.stringify(additionalContext, null, 2)}`);
  }

  return {
    systemPrompt: systemParts.join('\n'),
    userPrompt: userParts.join('\n\n'),
  };
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

export async function runSkill(input: SkillRunInput): Promise<SkillRunResult> {
  const startTime = Date.now();

  // Lazy-import server Supabase client to avoid pulling cookie APIs at build time
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  // 1. Load skill definition
  let skill: SkillDefinition;
  try {
    skill = await loadSkill(input.skillId);
  } catch (err) {
    return {
      id: '',
      status: 'failed',
      output: {},
      creditsUsed: 0,
      modelUsed: 'none',
      durationMs: Date.now() - startTime,
      error: `Failed to load skill: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 2. Load brand context
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id, name, domain, product_context, brand_guidelines, focus_areas, plan')
    .eq('id', input.brandId)
    .single();

  if (brandError || !brand) {
    return {
      id: '',
      status: 'failed',
      output: {},
      creditsUsed: 0,
      modelUsed: 'none',
      durationMs: Date.now() - startTime,
      error: `Brand not found: ${brandError?.message ?? 'unknown error'}`,
    };
  }

  // 3. Check wallet balance (skip for free skills)
  const creditsRequired = skill.credits;
  if (creditsRequired > 0) {
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id, balance, free_credits, free_credits_expires_at, circuit_breaker')
      .eq('brand_id', input.brandId)
      .single();

    if (walletError || !wallet) {
      return {
        id: '',
        status: 'failed',
        output: {},
        creditsUsed: 0,
        modelUsed: 'none',
        durationMs: Date.now() - startTime,
        error: `Wallet not found for brand: ${walletError?.message ?? 'unknown error'}`,
      };
    }

    if (wallet.circuit_breaker) {
      return {
        id: '',
        status: 'failed',
        output: {},
        creditsUsed: 0,
        modelUsed: 'none',
        durationMs: Date.now() - startTime,
        error: 'Wallet circuit breaker is active — spending paused',
      };
    }

    // Determine available credits (balance + unexpired free credits)
    const freeCreditsAvailable =
      wallet.free_credits_expires_at && new Date(wallet.free_credits_expires_at) > new Date()
        ? (wallet.free_credits ?? 0)
        : 0;
    const totalAvailable = (wallet.balance ?? 0) + freeCreditsAvailable;

    if (totalAvailable < creditsRequired) {
      return {
        id: '',
        status: 'failed',
        output: {},
        creditsUsed: 0,
        modelUsed: 'none',
        durationMs: Date.now() - startTime,
        error: `Insufficient credits: need ${creditsRequired}, have ${totalAvailable}`,
      };
    }
  }

  // 4. Route to the appropriate model
  const model = routeModel(skill.complexity);

  // 5. Build prompt and call the LLM
  const { systemPrompt, userPrompt } = buildPrompt(
    skill,
    brand as Record<string, unknown>,
    input.additionalContext,
  );

  let output: Record<string, unknown>;
  try {
    output = await callLLM({ model, systemPrompt, userPrompt });
  } catch (err) {
    output = {};
    const durationMs = Date.now() - startTime;

    // Store failed run
    const { data: failedRun } = await supabase
      .from('skill_runs')
      .insert({
        brand_id: input.brandId,
        agent_id: skill.agent,
        skill_id: skill.id,
        model_used: model,
        model_tier: skill.complexity,
        credits_used: 0,
        input: input.additionalContext ?? {},
        output: {},
        status: 'failed',
        error_message: err instanceof Error ? err.message : String(err),
        triggered_by: input.triggeredBy,
        parent_run_id: input.parentRunId ?? null,
        chain_depth: input.chainDepth ?? 0,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    return {
      id: failedRun?.id ?? '',
      status: 'failed',
      output: {},
      creditsUsed: 0,
      modelUsed: model,
      durationMs,
      error: `LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 6. Quality check
  const qc = qualityCheck(output);
  const status = qc.pass ? 'completed' : 'failed';
  const durationMs = Date.now() - startTime;
  const creditsUsed = qc.pass ? creditsRequired : 0;

  // 7. Store skill_run record
  const { data: skillRun, error: runInsertError } = await supabase
    .from('skill_runs')
    .insert({
      brand_id: input.brandId,
      agent_id: skill.agent,
      skill_id: skill.id,
      model_used: model,
      model_tier: skill.complexity,
      credits_used: creditsUsed,
      input: input.additionalContext ?? {},
      output,
      status,
      error_message: qc.pass ? null : qc.reason,
      triggered_by: input.triggeredBy,
      parent_run_id: input.parentRunId ?? null,
      chain_depth: input.chainDepth ?? 0,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (runInsertError) {
    return {
      id: '',
      status: 'failed',
      output,
      creditsUsed: 0,
      modelUsed: model,
      durationMs,
      error: `Failed to store skill run: ${runInsertError.message}`,
    };
  }

  const runId = skillRun?.id ?? '';

  // 8-9. Deduct credits and record transaction (only if credits were consumed)
  if (creditsUsed > 0) {
    // Fetch the wallet again within the deduction flow
    const { data: wallet } = await supabase
      .from('wallets')
      .select('id, balance')
      .eq('brand_id', input.brandId)
      .single();

    if (wallet) {
      const newBalance = (wallet.balance ?? 0) - creditsUsed;

      await supabase
        .from('wallets')
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq('id', wallet.id);

      await supabase.from('wallet_transactions').insert({
        brand_id: input.brandId,
        wallet_id: wallet.id,
        type: 'debit',
        amount: creditsUsed,
        balance_after: newBalance,
        description: `Skill run: ${skill.name} (${skill.id})`,
        skill_run_id: runId,
      });
    }
  }

  // 10. Entity extraction
  // TODO: Extract entities from output and store in knowledge graph (Task TBD)

  // 11. Auto-chaining
  // TODO: Check skill.chainsTo and conditionally enqueue follow-up skill runs.
  //       Should respect max chain depth to avoid infinite loops.

  return {
    id: runId,
    status,
    output,
    creditsUsed,
    modelUsed: model,
    durationMs,
    error: qc.pass ? undefined : qc.reason,
  };
}
