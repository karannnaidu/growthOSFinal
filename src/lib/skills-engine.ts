import { loadSkill, type SkillDefinition } from '@/lib/skill-loader';
import { routeModel as routeModelFn, type Tier } from '@/lib/model-router';
import { callModel } from '@/lib/model-client';
import { fetchSkillData, type SkillDataContext } from '@/lib/mcp-client';

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
// Model routing — Task 1.5 implementation
// ---------------------------------------------------------------------------

/** Map skill complexity to a model identifier and provider. */
function routeModelForSkill(complexity: SkillDefinition['complexity']): { model: string; provider: string } {
  const route = routeModelFn(complexity as Tier);
  return { model: route.model, provider: route.provider };
}

// ---------------------------------------------------------------------------
// LLM call — Task 1.5 implementation
// ---------------------------------------------------------------------------

interface LLMCallParams {
  model: string;
  provider: string;
  systemPrompt: string;
  userPrompt: string;
}

/** Call the appropriate provider via model-client. */
async function callLLM(params: LLMCallParams): Promise<Record<string, unknown>> {
  const result = await callModel({
    model: params.model,
    provider: params.provider,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
  });

  // Attempt JSON parse; fall back to wrapping raw content
  try {
    return JSON.parse(result.content) as Record<string, unknown>;
  } catch {
    return { content: result.content, model: result.model, provider: result.provider };
  }
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
  liveData?: SkillDataContext,
  ragContext?: import('@/lib/knowledge/rag').RAGResult | null,
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
  if (liveData && Object.keys(liveData).length > 0) {
    userParts.push(`## Live Platform Data\n${JSON.stringify(liveData, null, 2)}`);
  }

  if (ragContext && (ragContext.nodes.length > 0 || ragContext.agencyPatterns.length > 0)) {
    const ragParts: string[] = ['## Knowledge Graph Context\n'];

    if (ragContext.nodes.length > 0) {
      ragParts.push('### Relevant Entities');
      for (const node of ragContext.nodes) {
        ragParts.push(`- **${node.name}** (${node.nodeType}) — ${node.summary || 'No summary'} [confidence: ${node.confidence}, relevance: ${node.similarity.toFixed(2)}]`);
        if (node.properties && Object.keys(node.properties).length > 0) {
          ragParts.push(`  Properties: ${JSON.stringify(node.properties)}`);
        }
      }
    }

    if (ragContext.edges.length > 0) {
      ragParts.push('\n### Relationships');
      for (const edge of ragContext.edges) {
        ragParts.push(`- ${edge.sourceId} →[${edge.edgeType}]→ ${edge.targetId} (weight: ${edge.weight})`);
      }
    }

    if (ragContext.snapshots.length > 0) {
      ragParts.push('\n### Historical Metrics');
      for (const snap of ragContext.snapshots) {
        ragParts.push(`- Node ${snap.nodeId}: ${JSON.stringify(snap.metrics)} (${snap.snapshotAt})`);
      }
    }

    if (ragContext.agencyPatterns.length > 0) {
      ragParts.push('\n### Agency Cross-Brand Patterns');
      for (const pat of ragContext.agencyPatterns) {
        ragParts.push(`- **${pat.name}** (${pat.patternType}) — ${JSON.stringify(pat.data)}`);
      }
    }

    userParts.push(ragParts.join('\n'));
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
  const { model, provider } = routeModelForSkill(skill.complexity);

  // 5. Fetch live platform data via MCP client (non-fatal if it fails)
  let liveData: SkillDataContext = {};
  if (skill.mcpTools && skill.mcpTools.length > 0) {
    try {
      liveData = await fetchSkillData(input.brandId, skill.mcpTools);
    } catch (err) {
      console.warn('[SkillsEngine] fetchSkillData failed (continuing without live data):', err);
    }
  }

  // 5.5. Fetch knowledge graph context via RAG (non-fatal)
  let ragContext: import('@/lib/knowledge/rag').RAGResult | null = null;
  if (skill.knowledge?.semanticQuery) {
    try {
      const { ragQuery } = await import('@/lib/knowledge/rag');
      ragContext = await ragQuery({
        brandId: input.brandId,
        query: skill.knowledge.semanticQuery,
        nodeTypes: skill.knowledge.needs,
        limit: 15,
        traverseDepth: skill.knowledge.traverseDepth ?? 1,
        includeAgencyPatterns: skill.knowledge.includeAgencyPatterns ?? false,
      });
    } catch (err) {
      console.warn('[SkillsEngine] ragQuery failed (continuing without knowledge context):', err);
    }
  }

  // 6. Build prompt and call the LLM
  const { systemPrompt, userPrompt } = buildPrompt(
    skill,
    brand as Record<string, unknown>,
    input.additionalContext,
    liveData,
    ragContext,
  );

  let output: Record<string, unknown>;
  try {
    output = await callLLM({ model, provider, systemPrompt, userPrompt });
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

  // 10. Entity extraction — fire-and-forget, non-fatal
  if (status === 'completed' && runId) {
    import('@/lib/knowledge/extract')
      .then(({ extractEntities }) =>
        extractEntities(input.brandId, input.skillId, runId, output),
      )
      .catch((err) => {
        console.warn('[SkillsEngine] Entity extraction failed (non-fatal):', err);
      });
  }

  // 11. Auto-chaining via Mia orchestration engine
  if (status === 'completed' && runId) {
    // Fire-and-forget: orchestration is non-blocking and non-fatal
    import('@/lib/mia-orchestrator')
      .then(({ miaOrchestrate }) =>
        miaOrchestrate(input.brandId, runId, input.skillId, output),
      )
      .catch((err) => {
        console.warn('[SkillsEngine] Mia orchestration failed (non-fatal):', err);
      });
  }

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
