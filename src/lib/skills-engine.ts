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

export async function runSkill(input: SkillRunInput): Promise<SkillRunResult> {
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

  // Inject pre-flight intelligence into context
  if (preFlightResult) {
    const enrichedContext = { ...(input.additionalContext ?? {}) }
    if (preFlightResult.instruction) {
      enrichedContext._mia_instruction = preFlightResult.instruction
    }
    if (Object.keys(preFlightResult.supplementaryData).length > 0) {
      enrichedContext._supplementary_data = preFlightResult.supplementaryData
    }
    if (preFlightResult.dataGapsNote) {
      enrichedContext._data_gaps = preFlightResult.dataGapsNote
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

  // Post-execution: fal.ai image generation for image-brief skill
  if (skill.id === 'image-brief' && status === 'completed') {
    import('@/lib/fal-client').then(async ({ generateImage, persistToStorage, createMediaNode }) => {
      try {
        const briefs = Array.isArray(output.briefs) ? output.briefs : [output];
        for (const briefRaw of briefs.slice(0, 4)) {
          const brief = briefRaw as Record<string, unknown>;
          const prompt = (brief.prompt || brief.description || JSON.stringify(brief)) as string;
          const images = await generateImage({
            prompt,
            negativePrompt: brief.negative_prompt as string | undefined,
            width: (brief.width as number | undefined) ?? 1024,
            height: (brief.height as number | undefined) ?? 1024,
            brandId: input.brandId,
          });
          for (const img of images) {
            const filename = `ad-creatives/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
            const { storagePath } = await persistToStorage(img.url, input.brandId, 'generated-assets', filename);
            await createMediaNode(
              input.brandId, 'ad_creative',
              (brief.name as string | undefined) || `Creative from image-brief`,
              storagePath, 'generated-assets', 'image/png',
              skill.id, runId,
              { prompt, dimensions: `${img.width}x${img.height}` },
            );
          }
        }
      } catch (err) {
        console.warn('[SkillsEngine] fal.ai post-execution failed:', err);
      }
    }).catch(console.warn);
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

  // Post-execution: persist competitor ad creatives with thumbnails
  if ((skill.id === 'competitor-scan' || skill.id === 'competitor-creative-library') && status === 'completed') {
    try {
      const competitorAds = liveData.competitor?.ads as Array<{ competitor: string; ads: Array<{
        id: string; page_name: string; ad_creative_body: string | null;
        media_type: string; thumbnail_url: string | null; ad_snapshot_url: string | null;
        estimated_days_active: number; ad_creative_link_title: string | null;
      }> }> | undefined

      if (competitorAds) {
        for (const group of competitorAds) {
          for (const ad of (group.ads ?? []).slice(0, 25)) {
            // Upsert competitor_creative node with actual thumbnail URL
            await supabase.from('knowledge_nodes').upsert({
              brand_id: input.brandId,
              node_type: 'competitor_creative',
              name: `${group.competitor}: ${ad.ad_creative_link_title || ad.id}`,
              summary: ad.ad_creative_body?.slice(0, 300) ?? null,
              properties: {
                competitor_name: group.competitor,
                ad_id: ad.id,
                ad_creative_body: ad.ad_creative_body,
                ad_creative_link_title: ad.ad_creative_link_title,
                media_type: ad.media_type,
                thumbnail_url: ad.thumbnail_url,
                ad_snapshot_url: ad.ad_snapshot_url,
                estimated_days_active: ad.estimated_days_active,
                format: ad.media_type === 'video' ? 'video' : ad.media_type === 'image' ? 'static_image' : 'unknown',
                messaging_approach: 'unknown',
                estimated_performance: ad.estimated_days_active >= 14 ? 'high' : ad.estimated_days_active >= 7 ? 'medium' : 'low',
              },
              source_skill: skill.id,
              source_run_id: runId,
              confidence: ad.estimated_days_active >= 14 ? 0.9 : 0.7,
              is_active: true,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'brand_id,name', ignoreDuplicates: false })
          }
        }
      }
    } catch (err) {
      console.warn('[SkillsEngine] competitor creative persist failed:', err)
    }
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
