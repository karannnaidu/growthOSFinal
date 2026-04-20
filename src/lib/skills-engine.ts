import { loadSkill, type SkillDefinition } from '@/lib/skill-loader';
import { routeModel as routeModelFn, type Tier } from '@/lib/model-router';
import { callModel } from '@/lib/model-client';
import { fetchSkillData, type SkillDataContext } from '@/lib/mcp-client';
import { preFlightCheck, postFlightDecision, createBlockedDecision, type PreFlightResult } from '@/lib/mia-intelligence';

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
  status: 'completed' | 'failed' | 'blocked';
  output: Record<string, unknown>;
  creditsUsed: number;
  modelUsed: string;
  durationMs: number;
  error?: string;
}

export interface SkillProgressEvent {
  agent: string
  skill: string
  step: 'starting' | 'loading_context' | 'pre_flight' | 'fetching_data' | 'analyzing' | 'quality_check' | 'storing' | 'post_flight' | 'complete' | 'error'
  message: string
  progress: number
  output?: Record<string, unknown>
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

  // Strip markdown code fences and attempt JSON parse
  let text = result.content.trim();
  // Remove ```json ... ``` or ``` ... ``` wrapping
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) text = fenceMatch[1]!.trim();

  try {
    return JSON.parse(text) as Record<string, unknown>;
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

export async function runSkill(input: SkillRunInput, onProgress?: (event: SkillProgressEvent) => void): Promise<SkillRunResult> {
  const startTime = Date.now();

  // Use service client to bypass RLS recursive policy on brands
  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = createServiceClient();

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

  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'starting', message: `Starting ${skill.name}...`, progress: 5 })

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

  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'loading_context', message: 'Loading brand context...', progress: 10 })

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

  // 4.5 Pre-flight intelligence check
  let preFlightResult: PreFlightResult | null = null
  try {
    preFlightResult = await preFlightCheck(input.brandId, skill.agent, skill.mcpTools, skill.requires)

    if (preFlightResult.blocked) {
      await createBlockedDecision(input.brandId, skill.agent, skill.id, preFlightResult.missingPlatforms)
      return {
        id: '',
        status: 'failed',
        output: {},
        creditsUsed: 0,
        modelUsed: 'none',
        durationMs: Date.now() - startTime,
        error: `Blocked: missing connections (${preFlightResult.missingPlatforms.join(', ')})`,
      }
    }
  } catch (err) {
    console.warn('[SkillsEngine] Pre-flight check failed (continuing):', err)
  }

  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'pre_flight', message: preFlightResult?.dataGapsNote || 'Pre-flight checks passed', progress: 15 })

  // 5. Tool-level resolution — classify each declared tool's data source.
  //    Hard-block if ANY declared tool has no resolvable data.
  const { resolveDeclaredTools, computeBlockage } = await import('@/lib/skills-engine/preflight');
  type ToolResolution = import('@/lib/skills-engine/preflight').ToolResolution;

  let liveData: SkillDataContext = {};
  let toolResolutions: Record<string, ToolResolution> = {};
  if (skill.mcpTools && skill.mcpTools.length > 0) {
    try {
      const { resolutions } = await resolveDeclaredTools(input.brandId, skill.mcpTools);
      toolResolutions = resolutions;

      const blockage = computeBlockage(resolutions);
      if (blockage) {
        const durationMs = Date.now() - startTime;

        onProgress?.({ agent: skill.agent, skill: skill.id, step: 'pre_flight', message: blockage.blockedReason, progress: 0 })

        const { data: blockedRun, error: blockedInsertErr } = await supabase
          .from('skill_runs')
          .insert({
            brand_id: input.brandId,
            agent_id: skill.agent,
            skill_id: skill.id,
            status: 'blocked',
            blocked_reason: blockage.blockedReason,
            missing_platforms: blockage.missingPlatforms,
            data_source_summary: toolResolutions,
            triggered_by: input.triggeredBy,
            parent_run_id: input.parentRunId ?? null,
            chain_depth: input.chainDepth ?? 0,
            credits_used: 0,
            // model_used is NOT NULL in the schema even for blocked runs.
            model_used: 'none',
            input: input.additionalContext ?? {},
            output: {},
            duration_ms: durationMs,
            completed_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (blockedInsertErr) {
          console.warn('[SkillsEngine] blocked-row insert failed:', blockedInsertErr.message);
        }

        return {
          id: blockedRun?.id ?? '',
          status: 'blocked',
          output: {},
          creditsUsed: 0,
          modelUsed: 'none',
          durationMs,
          error: blockage.blockedReason,
        };
      }

      // All tools resolved — fetch the platform-grouped SkillDataContext the
      // prompt builder expects. fetchSkillData handles the per-tool unwrapping
      // (shopify → products[], meta → data[], etc.) that we don't want to
      // duplicate here.
      try {
        liveData = await fetchSkillData(input.brandId, skill.mcpTools);
      } catch (err) {
        console.warn('[SkillsEngine] fetchSkillData failed (continuing without live data):', err);
      }
    } catch (err) {
      console.warn('[SkillsEngine] resolveDeclaredTools failed (continuing without live data):', err);
    }
  }

  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'fetching_data', message: 'Platform data loaded', progress: 25 })

  // 5.5. Fetch knowledge graph context via RAG (non-fatal — records diagnostics)
  let ragContext: import('@/lib/knowledge/rag').RAGResult | null = null;
  const diagnostics: import('@/lib/knowledge/diagnostics').SkillRunDiagnostics = {};
  if (skill.knowledge?.semanticQuery) {
    const ragStart = Date.now();
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
      diagnostics.rag = { status: 'ok', latency_ms: Date.now() - ragStart };
    } catch (err) {
      console.warn('[SkillsEngine] ragQuery failed (continuing without knowledge context):', err);
      diagnostics.rag = {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        latency_ms: Date.now() - ragStart,
      };
    }
  }

  // 5.6. AI-visibility-probe specific: pre-fetch engine probes so the LLM
  // synthesizes from real data. Runs only for skill.id === 'ai-visibility-probe'.
  if (skill.id === 'ai-visibility-probe') {
    try {
      const { probeAll } = await import('@/lib/ai-engines');
      const { openaiSearch } = await import('@/lib/ai-engines/openai-search');
      const { perplexitySearch } = await import('@/lib/ai-engines/perplexity');
      const { geminiSearch } = await import('@/lib/ai-engines/gemini-search');

      // Resolve latest brand_dna for canonical name + competitors.
      const { data: dnaNode } = await supabase.from('knowledge_nodes')
        .select('properties, name')
        .eq('brand_id', input.brandId)
        .eq('node_type', 'brand_dna')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const dnaProps = (dnaNode?.properties as Record<string, unknown> | undefined) ?? {};
      const brandCanonicalName = (dnaProps.canonical_name as string | undefined) ?? 'Brand';
      const competitorNames = Array.isArray(dnaProps.competitors)
        ? (dnaProps.competitors as string[])
        : [];

      // Fetch high-priority queries (fallback to medium if low-count).
      const { data: queryNodes } = await supabase.from('knowledge_nodes')
        .select('name, properties')
        .eq('brand_id', input.brandId)
        .eq('node_type', 'ai_query')
        .eq('is_active', true)
        .limit(40);
      const queries = (queryNodes ?? [])
        .filter(n => (n.properties as Record<string, unknown>)?.priority !== 'low')
        .slice(0, 20)
        .map(n => n.name as string);

      const engines = {
        chatgpt: openaiSearch,
        perplexity: perplexitySearch,
        gemini: geminiSearch,
      };
      const probeResults: Array<{ query: string; engines: Record<string, unknown> }> = [];
      for (const q of queries) {
        const r = await probeAll({ query: q, brandCanonicalName, competitorNames }, engines);
        probeResults.push({ query: q, engines: r });
      }

      input = {
        ...input,
        additionalContext: {
          ...(input.additionalContext ?? {}),
          _probe_results: probeResults,
        },
      };

      // Record per-engine coverage in diagnostics.
      const engineOk: Record<string, 'ok' | 'failed'> = {
        chatgpt: 'ok',
        perplexity: 'ok',
        gemini: 'ok',
      };
      for (const r of probeResults) {
        for (const [eng, per] of Object.entries(r.engines)) {
          const errored = (per as { error?: string }).error;
          if (errored) engineOk[eng] = 'failed';
        }
      }
      diagnostics.coverage = engineOk;
    } catch (err) {
      console.warn('[SkillsEngine] ai-visibility-probe pre-fetch failed:', err);
      diagnostics.coverage = { chatgpt: 'failed', perplexity: 'failed', gemini: 'failed' };
    }
  }

  // Inject pre-flight intelligence + data-source caveats into context.
  {
    const enrichedContext: Record<string, unknown> = { ...(input.additionalContext ?? {}) }

    if (preFlightResult) {
      if (preFlightResult.instruction) {
        enrichedContext._mia_instruction = preFlightResult.instruction
      }
      if (Object.keys(preFlightResult.supplementaryData).length > 0) {
        enrichedContext._supplementary_data = preFlightResult.supplementaryData
      }
      if (preFlightResult.dataGapsNote) {
        enrichedContext._data_gaps = preFlightResult.dataGapsNote
      }
    }

    // Inject tool-resolution metadata so the LLM can caveat lower-confidence claims.
    const lowConfidence = Object.values(toolResolutions).filter((r) => r.confidence !== 'high')
    if (lowConfidence.length > 0) {
      enrichedContext._data_caveats = lowConfidence
        .map(
          (r) =>
            `Data for ${r.tool} is from ${r.source ?? 'unknown'} (${r.confidence} confidence, isComplete=${r.isComplete}). Caveat any quantitative claims that depend on this tool.`,
        )
        .join('\n')
    }
    if (Object.keys(toolResolutions).length > 0) {
      enrichedContext._data_source_summary = toolResolutions
    }

    input = { ...input, additionalContext: enrichedContext }
  }

  // 6. Build prompt and call the LLM
  const { systemPrompt, userPrompt } = buildPrompt(
    skill,
    brand as Record<string, unknown>,
    input.additionalContext,
    liveData,
    ragContext,
  );

  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'analyzing', message: `Analyzing with ${model}...`, progress: 35 })

  let output: Record<string, unknown>;
  try {
    output = await callLLM({ model, provider, systemPrompt, userPrompt });
  } catch (err) {
    output = {};
    const durationMs = Date.now() - startTime;

    onProgress?.({ agent: skill.agent, skill: skill.id, step: 'error', message: `LLM call failed: ${err instanceof Error ? err.message : String(err)}`, progress: 0 })

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

  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'quality_check', message: 'Checking output quality...', progress: 80 })

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
      data_source_summary: toolResolutions,
      diagnostics: Object.keys(diagnostics).length > 0 ? diagnostics : null,
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

  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'storing', message: 'Saving results...', progress: 90 })

  const runId = skillRun?.id ?? '';

  // 8.5. Entity extraction + postRun hook (with real runId). Both non-fatal.
  // We persist any new diagnostics via an UPDATE since the INSERT is done.
  let extractDiagSet = false;
  if (status === 'completed' && runId) {
    try {
      const { extractEntities } = await import('@/lib/knowledge/extract');
      const extractResult = await extractEntities(input.brandId, input.skillId, runId, output);
      diagnostics.extract = extractResult.error
        ? { status: 'failed', error: extractResult.error }
        : {
            status: extractResult.unexpectedNodeTypes.length > 0 ? 'partial' : 'ok',
            nodes_created: extractResult.nodesCreated,
            unexpected_node_types: extractResult.unexpectedNodeTypes.length > 0
              ? extractResult.unexpectedNodeTypes
              : undefined,
          };
      extractDiagSet = true;
    } catch (err) {
      diagnostics.extract = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
      extractDiagSet = true;
    }

    try {
      const { loadPostRun } = await import('@/lib/post-run');
      const postRun = await loadPostRun(input.skillId);
      if (postRun) {
        const { createServiceClient } = await import('@/lib/supabase/service');
        await postRun({
          brandId: input.brandId, skillId: input.skillId, runId,
          output, supabase: createServiceClient(), liveData: liveData as unknown as Record<string, unknown>,
        });
        diagnostics.postRun = { status: 'ok' };
        extractDiagSet = true;
      }
    } catch (err) {
      diagnostics.postRun = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
      extractDiagSet = true;
    }

    if (extractDiagSet && Object.keys(diagnostics).length > 0) {
      await supabase.from('skill_runs')
        .update({ diagnostics })
        .eq('id', runId);
    }
  }

  // 8-9. Deduct credits and record transaction (only if credits were consumed)
  if (creditsUsed > 0) {
    const { data: wallet } = await supabase
      .from('wallets')
      .select('id, balance, free_credits, free_credits_expires_at')
      .eq('brand_id', input.brandId)
      .single();

    if (wallet) {
      const now = new Date();
      const freeExpired =
        wallet.free_credits_expires_at &&
        new Date(wallet.free_credits_expires_at) < now;
      const availableFree = freeExpired ? 0 : (wallet.free_credits ?? 0);

      const fromFree = Math.min(availableFree, creditsUsed);
      const fromBalance = creditsUsed - fromFree;

      const newFreeCredits = availableFree - fromFree;
      const newBalance = (wallet.balance ?? 0) - fromBalance;

      await supabase
        .from('wallets')
        .update({
          free_credits: freeExpired ? wallet.free_credits : newFreeCredits,
          balance: newBalance,
          updated_at: now.toISOString(),
        })
        .eq('id', wallet.id);

      await supabase.from('wallet_transactions').insert({
        brand_id: input.brandId,
        wallet_id: wallet.id,
        type: 'debit',
        amount: creditsUsed,
        balance_after: newBalance,
        description: `Skill run: ${skill.name} (${skill.id})`,
        skill_run_id: runId,
        metadata: { from_free: fromFree, from_balance: fromBalance },
      });
    }
  }

  // 11. Post-flight intelligence — Mia decides follow-ups
  //     MUST await so the mia_decision node is saved before Vercel kills the function.
  if (status === 'completed' && runId) {
    try {
      await postFlightDecision({
        brandId: input.brandId,
        agentId: skill.agent,
        skillId: skill.id,
        skillRunId: runId,
        output,
        chainsTo: skill.chainsTo,
        dataGapsNote: preFlightResult?.dataGapsNote ?? null,
      })
    } catch (err) {
      console.warn('[SkillsEngine] Post-flight decision failed (non-fatal):', err)
    }
  }

  // Post-execution: persist brand guidelines for brand-voice-extractor
  if (skill.id === 'brand-voice-extractor' && status === 'completed') {
    import('@/lib/supabase/server').then(async ({ createClient: createSC }) => {
      try {
        const sb = await createSC();
        await sb.from('brand_guidelines').upsert({
          brand_id: input.brandId,
          voice_tone: output.voice_tone ?? {},
          target_audience: output.target_audience ?? {},
          positioning: (output.positioning as string) ?? null,
          do_say: Array.isArray(output.do_say) ? output.do_say : [],
          dont_say: Array.isArray(output.dont_say) ? output.dont_say : [],
          colors: output.colors ?? {},
          brand_story: (output.brand_story as string) ?? null,
          competitor_positioning: (output.competitor_positioning as string) ?? null,
        }, { onConflict: 'brand_id' });
        await sb.from('brands').update({ brand_guidelines: output }).eq('id', input.brandId);
      } catch (err) {
        console.warn('[SkillsEngine] brand guidelines persist failed:', err);
      }
    }).catch(console.warn);
  }

  // Post-execution: bridge top content after health-check
  if (skill.id === 'health-check' && status === 'completed') {
    import('@/lib/knowledge/bridges').then(async ({ bridgeTopContent }) => {
      await bridgeTopContent(input.brandId).catch(console.warn);
    }).catch(console.warn);
  }

  // Post-execution: launch campaign on Meta for campaign-launcher skill
  if (skill.id === 'campaign-launcher' && status === 'completed') {
    try {
      const { loadMetaCredential, createMetaCampaign, createMetaAdSet, createMetaAd } = await import('@/lib/meta-ads')
      const { OPTIMIZATION_GOAL_MAP } = await import('@/lib/meta-ads')

      const credential = await loadMetaCredential(input.brandId)
      const ctx = input.additionalContext ?? {}
      const campaignName = (ctx.campaign_name ?? output.campaign_name ?? 'Growth OS Campaign') as string
      const objective = (ctx.objective ?? output.objective ?? 'conversion') as string
      const dailyBudget = Number(ctx.daily_budget ?? output.daily_budget ?? 50)
      const launchMode = (ctx.launch_mode ?? output.launch_mode ?? 'live') as string
      const metaStatus = launchMode === 'draft' ? 'PAUSED' as const : 'ACTIVE' as const
      const creatives = (ctx.creatives ?? output.creatives ?? []) as Array<{
        headline: string; body: string; cta: string; image_url?: string
      }>
      const audienceTiers = (ctx.audience_tiers ?? output.audience_tiers ?? []) as Array<{
        name: string; targeting: Record<string, unknown>
      }>
      const linkUrl = (ctx.link_url ?? output.link_url ?? '') as string

      // 1. Create CBO campaign
      const campaign = await createMetaCampaign({
        credential,
        name: campaignName,
        objective: objective as 'awareness' | 'conversion' | 'retention',
        dailyBudget,
        status: metaStatus,
      })

      // 2. Create ad sets per audience tier
      const adSetIds: string[] = []
      const optimizationGoal = OPTIMIZATION_GOAL_MAP[objective] ?? 'OFFSITE_CONVERSIONS'

      for (const tier of audienceTiers) {
        const adSet = await createMetaAdSet({
          credential,
          campaignId: campaign.id,
          name: `${campaignName} — ${tier.name}`,
          optimizationGoal,
          billingEvent: 'IMPRESSIONS',
          targeting: tier.targeting as any,
          status: metaStatus,
        })
        adSetIds.push(adSet.id)
      }

      // 3. Create ads (each creative in each ad set)
      const adIds: string[] = []
      for (const adSetId of adSetIds) {
        for (let i = 0; i < creatives.length; i++) {
          const c = creatives[i]!
          const ad = await createMetaAd({
            credential,
            adSetId,
            name: `${campaignName} — Variant ${String.fromCharCode(65 + i)}`,
            creative: {
              primaryText: c.body,
              headline: c.headline,
              linkUrl,
              ctaType: c.cta || 'SHOP_NOW',
              imageUrl: c.image_url,
            },
            status: metaStatus,
          })
          adIds.push(ad.id)
        }
      }

      // 4. Insert into campaigns table
      const learningEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      await supabase.from('campaigns').insert({
        brand_id: input.brandId,
        name: campaignName,
        objective,
        status: launchMode === 'draft' ? 'paused' : 'active',
        platform: 'meta',
        daily_budget: dailyBudget,
        launch_mode: launchMode,
        meta_campaign_id: campaign.id,
        meta_adset_ids: adSetIds,
        meta_ad_ids: adIds,
        targeting: audienceTiers,
        creatives,
        audience_tiers: audienceTiers,
        learning_ends_at: learningEndsAt,
        launcher_run_id: runId,
        launched_at: new Date().toISOString(),
      })

      // 5. Notify user
      await supabase.from('notifications').insert({
        brand_id: input.brandId,
        type: 'auto_completed',
        agent_id: 'max',
        title: launchMode === 'draft'
          ? `Draft campaign "${campaignName}" saved on Meta`
          : `Campaign "${campaignName}" is live on Meta`,
        body: `${adIds.length} ads across ${adSetIds.length} audience tiers. Daily budget: $${dailyBudget}. ${launchMode === 'live' ? 'Learning period: 3 days.' : 'Activate from Meta Ads Manager when ready.'}`,
        read: false,
      })

    } catch (err) {
      console.error('[SkillsEngine] campaign-launcher post-execution failed:', err)
      await supabase.from('campaigns').insert({
        brand_id: input.brandId,
        name: (input.additionalContext?.campaign_name ?? output.campaign_name ?? 'Failed Campaign') as string,
        objective: (input.additionalContext?.objective ?? output.objective ?? 'conversion') as string,
        status: 'failed',
        platform: 'meta',
        daily_budget: Number(input.additionalContext?.daily_budget ?? output.daily_budget ?? 0),
        optimization_log: [{ error: err instanceof Error ? err.message : String(err), at: new Date().toISOString() }],
        launcher_run_id: runId,
      })
      await supabase.from('notifications').insert({
        brand_id: input.brandId,
        type: 'alert',
        agent_id: 'max',
        title: 'Campaign launch failed',
        body: err instanceof Error ? err.message : 'Unknown error launching campaign on Meta.',
        read: false,
      })
    }
  }

  // Post-execution: write ad performance benchmarks to brand_metrics_history
  if (skill.id === 'ad-performance-analyzer' && status === 'completed') {
    try {
      const phase = output.phase as string
      const today = new Date().toISOString().split('T')[0]

      // Build metrics from LLM output
      const adMetrics: Record<string, unknown> = {
        ad_roas: (output.baseline_comparison as Record<string, { current?: number }>)?.roas?.current ?? null,
        ad_cac: (output.baseline_comparison as Record<string, { current?: number }>)?.cac?.current ?? null,
        ad_ctr: (output.baseline_comparison as Record<string, { current?: number }>)?.ctr?.current ?? null,
        ad_account_maturity: output.account_maturity ?? null,
        ad_account_currency: output.account_currency ?? null,
        ad_total_lifetime_spend: output.total_lifetime_spend ?? null,
        ad_phase: phase,
      }

      // GOS vs external comparison
      const gosVsExt = output.gos_vs_external as Record<string, Record<string, unknown>> | undefined
      if (gosVsExt) {
        adMetrics.ad_gos_roas = gosVsExt.growth_os?.roas ?? null
        adMetrics.ad_gos_cac = gosVsExt.growth_os?.cac ?? null
        adMetrics.ad_ext_roas = gosVsExt.external?.roas ?? null
        adMetrics.ad_ext_cac = gosVsExt.external?.cac ?? null
      }

      // Check existing data for this brand
      const { data: existingRows } = await supabase
        .from('brand_metrics_history')
        .select('date, metrics')
        .eq('brand_id', input.brandId)
        .order('date', { ascending: false })
        .limit(30)

      // Find if baseline already captured in any existing row
      const baselineRow = (existingRows ?? []).find(r =>
        (r.metrics as Record<string, unknown>)?.ad_baseline_roas != null
      )

      if (phase === 'baseline_capture' && !baselineRow) {
        // First run: capture baseline
        const baseline = output.baseline_comparison as Record<string, { baseline?: number }> | undefined
        if (baseline) {
          adMetrics.ad_baseline_roas = baseline.roas?.baseline ?? null
          adMetrics.ad_baseline_cac = baseline.cac?.baseline ?? null
          adMetrics.ad_baseline_ctr = baseline.ctr?.baseline ?? null
          adMetrics.ad_baseline_captured_at = today
        }
      } else if (baselineRow) {
        // Preserve existing baseline in every row
        const bm = baselineRow.metrics as Record<string, unknown>
        adMetrics.ad_baseline_roas = bm.ad_baseline_roas
        adMetrics.ad_baseline_cac = bm.ad_baseline_cac
        adMetrics.ad_baseline_ctr = bm.ad_baseline_ctr
        adMetrics.ad_baseline_captured_at = bm.ad_baseline_captured_at
      }

      // Monthly benchmark: save last month's data on first run of new month
      const currentMonth = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' }).toLowerCase().replace(' ', '_')
      const monthKey = `ad_monthly_roas_${currentMonth}`
      const hasMonthly = (existingRows ?? []).some(r =>
        (r.metrics as Record<string, unknown>)?.[monthKey] != null
      )
      if (!hasMonthly && existingRows && existingRows.length > 0) {
        const lastRow = existingRows.find(r => {
          const m = r.metrics as Record<string, unknown>
          return m?.ad_roas != null && r.date !== today
        })
        if (lastRow) {
          const lm = lastRow.metrics as Record<string, unknown>
          adMetrics[monthKey] = lm.ad_roas
          adMetrics[`ad_monthly_cac_${currentMonth}`] = lm.ad_cac
          adMetrics[`ad_monthly_ctr_${currentMonth}`] = lm.ad_ctr
        }
      }

      // Upsert: merge with any existing metrics for today
      const { data: todayRow } = await supabase
        .from('brand_metrics_history')
        .select('metrics')
        .eq('brand_id', input.brandId)
        .eq('date', today)
        .single()

      const mergedMetrics = { ...(todayRow?.metrics as Record<string, unknown> ?? {}), ...adMetrics }

      await supabase.from('brand_metrics_history').upsert({
        brand_id: input.brandId,
        date: today,
        metrics: mergedMetrics,
        source: 'ad-performance-analyzer',
      }, { onConflict: 'brand_id,date' })

    } catch (err) {
      console.warn('[SkillsEngine] ad-performance-analyzer benchmark persist failed:', err)
    }
  }

  onProgress?.({ agent: skill.agent, skill: skill.id, step: 'complete', message: `${skill.name} complete`, progress: 100, output })

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
