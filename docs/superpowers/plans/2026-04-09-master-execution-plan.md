# Growth OS v2 — Master Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Complete Growth OS from functional backend to production-ready product — fix the knowledge pipeline, rebuild all UI to match designs, and build the data-driven creative intelligence engine.

**Architecture:** Three sequential plans that build on each other. Plan 1 fixes backend plumbing. Plan 2 rebuilds all frontend. Plan 3 adds the crown jewel creative intelligence feature.

**Tech Stack:** Next.js 16, Tailwind v4, shadcn/ui, Supabase (pgvector), fal.ai (flux/schnell + minimax-video), Google AI (Gemini text-embedding-004), multi-model AI router

---

## Execution Order

| Plan | Name | Tasks | Depends On | What It Fixes |
|------|------|-------|------------|---------------|
| **1** | Creative Pipeline Foundation | 8 tasks | Nothing | ✅ **COMPLETE** — Knowledge graph loop fixed, embeddings, fal.ai, schema |
| **2** | Design Gap UI Rebuild | 16 tasks | Plan 1 | ✅ **COMPLETE** — UI matches designs, all pages built, interactions wired |
| **3** | Creative Intelligence Engine | 7 tasks | Plans 1+2 | No cohort-driven creative generation, no video, no feedback loop |

**Total: 31 tasks**

---

# ============================================================
# PLAN 1: Creative Pipeline Foundation ✅ COMPLETE
# ============================================================

**Spec:** `docs/superpowers/specs/2026-04-09-creative-pipeline-foundation.md`
**Status:** ✅ All 8 tasks complete — committed and pushed.

**Goal:** Fix the 9 critical gaps that break the knowledge graph → skills → creative pipeline loop.

**Why first:** Nothing else works correctly until skills can read the knowledge graph and fal.ai can generate images. The Design Gap plan (Plan 2) depends on fal.ai for agent images. The Creative Intelligence Engine (Plan 3) depends on a working knowledge loop.

---

### Plan 1 — Task 1: Fix Schema Constraints

**Files:**
- Create: `supabase/migrations/001-fix-constraints.sql`
- Modify: `src/lib/knowledge/extract.ts`

- [x] **Step 1: Create migration SQL**

```sql
-- supabase/migrations/001-fix-constraints.sql

-- Fix knowledge_nodes node_type constraint
ALTER TABLE knowledge_nodes DROP CONSTRAINT IF EXISTS valid_node_type;
ALTER TABLE knowledge_nodes ADD CONSTRAINT valid_node_type CHECK (node_type IN (
  'product', 'audience', 'campaign', 'content', 'competitor',
  'insight', 'metric', 'experiment', 'creative', 'keyword',
  'email_flow', 'channel', 'persona', 'product_image',
  'competitor_creative', 'ad_creative', 'video_asset',
  'landing_page', 'review_theme', 'price_point',
  'brand_guidelines', 'brand_asset', 'top_content'
));

-- Fix knowledge_edges edge_type constraint
ALTER TABLE knowledge_edges DROP CONSTRAINT IF EXISTS valid_edge_type;
ALTER TABLE knowledge_edges ADD CONSTRAINT valid_edge_type CHECK (edge_type IN (
  'targets', 'uses_creative', 'competes_with', 'inspired_by',
  'performs_on', 'belongs_to', 'generated_by', 'reviewed_by',
  'derived_from', 'part_of', 'sends_to', 'has_variant',
  'supersedes', 'similar_to', 'mentions'
));
```

- [x] **Step 2: Run migration against live Supabase**

```bash
cd growth-os && npx supabase db query --linked -f supabase/migrations/001-fix-constraints.sql
```

- [x] **Step 3: Update VALID_NODE_TYPES in extract.ts**

In `src/lib/knowledge/extract.ts`, replace the `VALID_NODE_TYPES` Set (around line 49-55):

```typescript
const VALID_NODE_TYPES = new Set([
  'product', 'audience', 'campaign', 'content', 'competitor',
  'insight', 'metric', 'experiment', 'creative', 'keyword',
  'email_flow', 'channel', 'persona', 'product_image',
  'competitor_creative', 'ad_creative', 'video_asset',
  'landing_page', 'review_theme', 'price_point',
  'brand_guidelines', 'brand_asset', 'top_content',
]);
```

- [x] **Step 4: Update VALID_EDGE_TYPES in extract.ts**

Replace the `VALID_EDGE_TYPES` Set (around line 57-62):

```typescript
const VALID_EDGE_TYPES = new Set([
  'targets', 'uses_creative', 'competes_with', 'inspired_by',
  'performs_on', 'belongs_to', 'generated_by', 'reviewed_by',
  'derived_from', 'part_of', 'sends_to', 'has_variant',
  'supersedes', 'similar_to', 'mentions',
]);
```

- [x] **Step 5: Update the EXTRACTION_SYSTEM_PROMPT to include new types**

Update the prompt string in `extract.ts` that lists valid types for the LLM. Find the line that says `"node_type": "one of: product|audience|..."` and replace with the full list including `creative|brand_guidelines|brand_asset|top_content|product_image|competitor_creative`.

Do the same for edge types — add `reviewed_by|uses_creative|inspired_by|performs_on|generated_by|has_variant|supersedes|mentions` to the allowed list.

- [x] **Step 6: Build passes**

```bash
npm run build
```

- [x] **Step 7: Commit**

```bash
git add supabase/migrations/ src/lib/knowledge/extract.ts
git commit -m "fix: expand knowledge graph schema constraints and extraction type sets"
```

---

### Plan 1 — Task 2: Inline Embedding Generation

**Files:**
- Modify: `src/lib/knowledge/extract.ts`
- Modify: `src/lib/knowledge/rag.ts` (export `embedText`)

- [x] **Step 1: Ensure embedText is exported from rag.ts**

Check `src/lib/knowledge/rag.ts` for the `embedText` function. If it's not exported, add `export` keyword. The function should have this signature:

```typescript
export async function embedText(text: string): Promise<number[]>
```

It calls `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent` with `GOOGLE_AI_KEY` and returns a 768-dim float array.

- [x] **Step 2: Add embedding generation to extractEntities**

In `src/lib/knowledge/extract.ts`, import `embedText`:

```typescript
import { embedText } from '@/lib/knowledge/rag';
```

Find the section where nodes are inserted into `knowledge_nodes` (the `supabase.from('knowledge_nodes').insert(...)` call). Before each insert, generate the embedding:

```typescript
// For each extracted node, generate embedding before insert
for (const node of validNodes) {
  let embedding: number[] | null = null;
  try {
    const textForEmbedding = `${node.name}. ${node.summary || ''}. ${JSON.stringify(node.properties || {})}`;
    embedding = await embedText(textForEmbedding);
  } catch (err) {
    console.warn(`[extract] Embedding generation failed for "${node.name}":`, err);
    // Continue with null embedding — backfill job will catch it
  }

  await supabase.from('knowledge_nodes').insert({
    brand_id: brandId,
    node_type: node.node_type,
    name: node.name,
    summary: node.summary || null,
    properties: node.properties || {},
    confidence: node.confidence ?? 0.7,
    source_skill: skillId,
    source_run_id: skillRunId,
    embedding,
    is_active: true,
  });
}
```

Note: This replaces any existing batch insert with per-node inserts to include embeddings. If the current code uses a batch insert, refactor to iterate.

- [x] **Step 3: Build passes**

```bash
npm run build
```

- [x] **Step 4: Commit**

```bash
git add src/lib/knowledge/extract.ts src/lib/knowledge/rag.ts
git commit -m "feat: generate embeddings inline during entity extraction"
```

---

### Plan 1 — Task 3: Wire RAG into Skills Engine

**Files:**
- Modify: `src/lib/skills-engine.ts`

- [x] **Step 1: Add RAG query step to runSkill**

In `src/lib/skills-engine.ts`, after step 5 (fetchSkillData / MCP) around line 228, and before step 6 (buildPrompt) around line 231, add:

```typescript
  // 5.5. Fetch knowledge graph context via RAG (non-fatal if it fails)
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
```

- [x] **Step 2: Update buildPrompt to accept RAG context**

Update the `buildPrompt` function signature:

```typescript
function buildPrompt(
  skill: SkillDefinition,
  brandContext: Record<string, unknown>,
  additionalContext?: Record<string, unknown>,
  liveData?: SkillDataContext,
  ragContext?: import('@/lib/knowledge/rag').RAGResult | null,
): { systemPrompt: string; userPrompt: string }
```

Add RAG context to the user prompt, after live data and before closing:

```typescript
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
```

- [x] **Step 3: Pass ragContext in the buildPrompt call**

Update the `buildPrompt` call around line 231:

```typescript
  const { systemPrompt, userPrompt } = buildPrompt(
    skill,
    brand as Record<string, unknown>,
    input.additionalContext,
    liveData,
    ragContext,
  );
```

- [x] **Step 4: Build passes**

```bash
npm run build
```

- [x] **Step 5: Commit**

```bash
git add src/lib/skills-engine.ts
git commit -m "feat: wire RAG knowledge graph context into skills engine prompt builder"
```

---

### Plan 1 — Task 4: fal.ai Client

**Files:**
- Create: `src/lib/fal-client.ts`
- Modify: `.env.local.example`

- [x] **Step 1: Create fal.ai client**

```typescript
// src/lib/fal-client.ts

export interface ImageGenerationOptions {
  prompt: string
  negativePrompt?: string
  width?: number
  height?: number
  model?: string
  num_images?: number
  seed?: number
  brandId?: string // for BYOK key lookup
}

export interface VideoGenerationOptions {
  prompt: string
  duration?: number
  width?: number
  height?: number
  model?: string
  brandId?: string
}

export interface GeneratedMedia {
  url: string
  width: number
  height: number
  content_type: string
}

async function getFalKey(brandId?: string): Promise<string> {
  // Check BYOK first if brandId provided
  if (brandId) {
    try {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data } = await supabase
        .from('byok_keys')
        .select('vault_secret_id')
        .eq('brand_id', brandId)
        .eq('provider', 'fal')
        .single()
      if (data?.vault_secret_id) {
        // In production, decrypt via Supabase Vault RPC
        // For now, fall through to platform key
      }
    } catch {
      // BYOK lookup failed, fall through
    }
  }
  const key = process.env.FAL_AI_KEY
  if (!key) throw new Error('FAL_AI_KEY not configured')
  return key
}

export async function generateImage(options: ImageGenerationOptions): Promise<GeneratedMedia[]> {
  const key = await getFalKey(options.brandId)
  const model = options.model ?? 'fal-ai/flux/schnell'

  const response = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: options.prompt,
      negative_prompt: options.negativePrompt,
      image_size: { width: options.width ?? 1024, height: options.height ?? 1024 },
      num_images: options.num_images ?? 1,
      seed: options.seed,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`fal.ai error ${response.status}: ${err}`)
  }

  const data = await response.json()
  return (data.images || []).map((img: any) => ({
    url: img.url,
    width: img.width ?? options.width ?? 1024,
    height: img.height ?? options.height ?? 1024,
    content_type: img.content_type || 'image/png',
  }))
}

export async function generateVideo(options: VideoGenerationOptions): Promise<GeneratedMedia> {
  const key = await getFalKey(options.brandId)
  const model = options.model ?? 'fal-ai/minimax-video/video-01-live'

  const response = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: options.prompt,
      duration: options.duration ?? 5,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`fal.ai video error ${response.status}: ${err}`)
  }

  const data = await response.json()
  const video = data.video || data
  return {
    url: video.url,
    width: video.width ?? 1280,
    height: video.height ?? 720,
    content_type: 'video/mp4',
  }
}

export async function generateAgentPortrait(
  agentId: string,
  description: string,
  accentColor: string
): Promise<GeneratedMedia> {
  const prompt = `Futuristic AI agent portrait, ${description}, accent glow color ${accentColor}, dark background, high-tech, professional, cinematic lighting, digital art, 4k quality`
  const results = await generateImage({ prompt, width: 512, height: 512 })
  if (!results.length) throw new Error('No image generated')
  return results[0]
}

export async function persistToStorage(
  mediaUrl: string,
  brandId: string,
  bucket: 'brand-assets' | 'generated-assets' | 'competitor-assets',
  subPath: string,
): Promise<{ storagePath: string; publicUrl: string }> {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const response = await fetch(mediaUrl)
  if (!response.ok) throw new Error(`Failed to download media: ${response.status}`)
  const blob = await response.blob()
  const buffer = Buffer.from(await blob.arrayBuffer())

  const storagePath = `${brandId}/${subPath}`
  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType: blob.type || 'image/png',
      upsert: true,
    })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(storagePath)

  return { storagePath, publicUrl: urlData.publicUrl }
}

export async function createMediaNode(
  brandId: string,
  nodeType: 'ad_creative' | 'video_asset' | 'brand_asset',
  name: string,
  storagePath: string,
  bucket: string,
  mediaType: string,
  sourceSkill: string,
  sourceRunId: string,
  properties?: Record<string, any>,
): Promise<string> {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { embedText } = await import('@/lib/knowledge/rag')

  let embedding: number[] | null = null
  try {
    embedding = await embedText(`${name}. ${nodeType}. ${JSON.stringify(properties || {})}`)
  } catch {
    // Continue without embedding
  }

  const { data, error } = await supabase
    .from('knowledge_nodes')
    .insert({
      brand_id: brandId,
      node_type: nodeType,
      name,
      summary: `Generated ${nodeType} from ${sourceSkill}`,
      properties: properties || {},
      storage_path: storagePath,
      storage_bucket: bucket,
      media_type: mediaType,
      source_skill: sourceSkill,
      source_run_id: sourceRunId,
      embedding,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create media node: ${error.message}`)
  return data.id
}
```

- [x] **Step 2: Add FAL_AI_KEY to env example**

Add to `.env.local.example`:
```
FAL_AI_KEY=
```

- [x] **Step 3: Build passes**

```bash
npm run build
```

- [x] **Step 4: Commit**

```bash
git add src/lib/fal-client.ts .env.local.example
git commit -m "feat: add fal.ai client with image/video generation, storage persistence, BYOK support"
```

---

### Plan 1 — Task 5: Wire fal.ai Post-Execution Hook

**Files:**
- Modify: `src/lib/skills-engine.ts`

- [x] **Step 1: Add image-brief post-execution hook**

After the entity extraction fire-and-forget (around the end of `runSkill`), add a new post-execution hook for image-brief:

```typescript
  // 11. Post-execution: fal.ai image generation for image-brief skill
  if (skill.id === 'image-brief' && result.status === 'completed') {
    import('@/lib/fal-client').then(async ({ generateImage, persistToStorage, createMediaNode }) => {
      try {
        const briefs = Array.isArray(output.briefs) ? output.briefs : [output];
        for (const brief of briefs.slice(0, 4)) {
          const prompt = brief.prompt || brief.description || JSON.stringify(brief);
          const images = await generateImage({
            prompt,
            negativePrompt: brief.negative_prompt,
            width: brief.width ?? 1024,
            height: brief.height ?? 1024,
            brandId: input.brandId,
          });
          for (const img of images) {
            const filename = `ad-creatives/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
            const { storagePath } = await persistToStorage(img.url, input.brandId, 'generated-assets', filename);
            await createMediaNode(
              input.brandId,
              'ad_creative',
              brief.name || `Creative from ${skill.id}`,
              storagePath,
              'generated-assets',
              'image/png',
              skill.id,
              result.id,
              { prompt, dimensions: `${img.width}x${img.height}` },
            );
          }
        }
      } catch (err) {
        console.warn('[SkillsEngine] fal.ai post-execution failed:', err);
      }
    }).catch(console.warn);
  }
```

- [x] **Step 2: Build passes**

```bash
npm run build
```

- [x] **Step 3: Commit**

```bash
git add src/lib/skills-engine.ts
git commit -m "feat: add fal.ai post-execution hook for image-brief skill"
```

---

### Plan 1 — Task 6: Brand Guidelines Pipeline

**Files:**
- Modify: `src/lib/skills-engine.ts`

- [x] **Step 1: Add brand-voice-extractor post-execution hook**

After the fal.ai hook (or alongside it), add:

```typescript
  // 12. Post-execution: persist brand guidelines for brand-voice-extractor
  if (skill.id === 'brand-voice-extractor' && result.status === 'completed') {
    import('@/lib/supabase/server').then(async ({ createClient: createSC }) => {
      try {
        const sb = await createSC();
        const guidelinesFields = {
          brand_id: input.brandId,
          voice_tone: output.voice_tone ?? {},
          target_audience: output.target_audience ?? {},
          positioning: (output.positioning as string) ?? null,
          do_say: Array.isArray(output.do_say) ? output.do_say : [],
          dont_say: Array.isArray(output.dont_say) ? output.dont_say : [],
          colors: output.colors ?? {},
          brand_story: (output.brand_story as string) ?? null,
          competitor_positioning: (output.competitor_positioning as string) ?? null,
        };
        await sb.from('brand_guidelines').upsert(guidelinesFields, { onConflict: 'brand_id' });
        await sb.from('brands').update({ brand_guidelines: output }).eq('id', input.brandId);
      } catch (err) {
        console.warn('[SkillsEngine] brand guidelines persist failed:', err);
      }
    }).catch(console.warn);
  }
```

- [x] **Step 2: Build passes and commit**

```bash
npm run build
git add src/lib/skills-engine.ts
git commit -m "feat: persist brand-voice-extractor output to brand_guidelines table"
```

---

### Plan 1 — Task 7: Product Images + Top Content Bridges

**Files:**
- Modify: `src/lib/shopify.ts`
- Create: `src/lib/knowledge/bridges.ts`

- [x] **Step 1: Add product image knowledge nodes to Shopify sync**

In `src/lib/shopify.ts`, in the `pullShopifyProducts` function, after upserting products into the `products` table, add:

```typescript
  // Create product_image knowledge nodes
  const { embedText } = await import('@/lib/knowledge/rag');
  for (const product of products) {
    const images = (product.images as any[]) || [];
    for (const image of images.slice(0, 3)) {
      let embedding: number[] | null = null;
      try {
        embedding = await embedText(`Product image: ${product.title}. ${(product.body_html || '').slice(0, 200)}`);
      } catch { /* continue without embedding */ }

      await supabase.from('knowledge_nodes').upsert({
        brand_id: brandId,
        node_type: 'product_image',
        name: `${product.title} — Image ${images.indexOf(image) + 1}`,
        summary: `Product photo for ${product.title}`,
        properties: {
          product_title: product.title,
          shopify_product_id: String(product.id),
          image_url: image.src,
          alt: image.alt || product.title,
        },
        media_url: image.src,
        media_type: 'image/jpeg',
        source_skill: 'shopify-sync',
        embedding,
        is_active: true,
      }, { onConflict: 'brand_id,name' });
    }
  }
```

- [x] **Step 2: Create top content bridge**

```typescript
// src/lib/knowledge/bridges.ts

import { createClient } from '@/lib/supabase/server';
import { embedText } from '@/lib/knowledge/rag';

export async function bridgeTopContent(brandId: string): Promise<number> {
  const supabase = await createClient();
  const { data: topContent } = await supabase
    .from('top_content')
    .select('*')
    .eq('brand_id', brandId);

  if (!topContent?.length) return 0;

  let created = 0;
  for (const item of topContent) {
    let embedding: number[] | null = null;
    try {
      embedding = await embedText(
        `${item.content_type} content: ${item.title || 'Untitled'}. Performance: ${JSON.stringify(item.performance_metrics || {})}`
      );
    } catch { /* continue */ }

    const { error } = await supabase.from('knowledge_nodes').upsert({
      brand_id: brandId,
      node_type: 'top_content',
      name: item.title || `Top ${item.content_type} #${item.rank || created + 1}`,
      summary: `High-performing ${item.content_type} content`,
      properties: {
        content_type: item.content_type,
        content: item.content,
        performance_metrics: item.performance_metrics,
        tags: item.tags,
        rank: item.rank,
      },
      tags: item.tags || [],
      embedding,
      is_active: true,
    }, { onConflict: 'brand_id,name' });

    if (!error) created++;
  }

  return created;
}
```

- [x] **Step 3: Wire bridgeTopContent into call sites**

Add to `src/app/api/cron/daily/route.ts` after the daily skills run:
```typescript
// Bridge top_content to knowledge graph
const { bridgeTopContent } = await import('@/lib/knowledge/bridges');
for (const brand of activeBrands) {
  await bridgeTopContent(brand.id).catch(console.warn);
}
```

Add to `src/lib/skills-engine.ts` as a post-execution hook for health-check:
```typescript
if (skill.id === 'health-check' && result.status === 'completed') {
  import('@/lib/knowledge/bridges').then(async ({ bridgeTopContent }) => {
    await bridgeTopContent(input.brandId).catch(console.warn);
  }).catch(console.warn);
}
```

- [x] **Step 4: Build passes and commit**

```bash
npm run build
git add src/lib/shopify.ts src/lib/knowledge/bridges.ts src/app/api/cron/daily/route.ts src/lib/skills-engine.ts
git commit -m "feat: bridge product images and top content into knowledge graph"
```

---

### Plan 1 — Task 8: Embedding Backfill + Cron Route

**Files:**
- Create: `scripts/backfill-embeddings.ts`
- Create: `src/app/api/cron/backfill-embeddings/route.ts`
- Modify: `vercel.json`

- [x] **Step 1: Create backfill script**

```typescript
// scripts/backfill-embeddings.ts
// Run: npx tsx scripts/backfill-embeddings.ts
// Requires GOOGLE_AI_KEY and SUPABASE env vars

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: nodes, error } = await supabase
    .from('knowledge_nodes')
    .select('id, name, summary, properties')
    .is('embedding', null)
    .limit(100);

  if (error || !nodes?.length) {
    console.log('No nodes to backfill');
    return;
  }

  console.log(`Backfilling ${nodes.length} nodes...`);
  let success = 0;

  for (const node of nodes) {
    const text = `${node.name}. ${node.summary || ''}. ${JSON.stringify(node.properties || {})}`;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GOOGLE_AI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text }] },
          }),
        }
      );
      const data = await res.json();
      const embedding = data?.embedding?.values;
      if (embedding) {
        await supabase
          .from('knowledge_nodes')
          .update({ embedding })
          .eq('id', node.id);
        success++;
        console.log(`  [${success}/${nodes.length}] ${node.name}`);
      }
    } catch (err) {
      console.warn(`  Failed: ${node.name}`, err);
    }
    // Rate limit: 100ms between calls
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`Done: ${success}/${nodes.length} embeddings generated`);
}

main().catch(console.error);
```

- [x] **Step 2: Create cron-callable backfill route**

```typescript
// src/app/api/cron/backfill-embeddings/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { embedText } = await import('@/lib/knowledge/rag');

  const { data: nodes } = await supabase
    .from('knowledge_nodes')
    .select('id, name, summary, properties')
    .is('embedding', null)
    .limit(50);

  if (!nodes?.length) {
    return NextResponse.json({ message: 'No nodes to backfill', count: 0 });
  }

  let success = 0;
  for (const node of nodes) {
    try {
      const text = `${node.name}. ${node.summary || ''}. ${JSON.stringify(node.properties || {})}`;
      const embedding = await embedText(text);
      await supabase.from('knowledge_nodes').update({ embedding }).eq('id', node.id);
      success++;
    } catch { /* skip */ }
  }

  return NextResponse.json({ message: `Backfilled ${success}/${nodes.length}`, count: success });
}
```

- [x] **Step 3: Add to vercel.json cron**

Add to the `crons` array in `vercel.json`:
```json
{ "path": "/api/cron/backfill-embeddings", "schedule": "0 * * * *" }
```

- [x] **Step 4: Build passes and commit**

```bash
npm run build
git add scripts/backfill-embeddings.ts src/app/api/cron/backfill-embeddings/ vercel.json
git commit -m "feat: add embedding backfill script and hourly cron route"
```

- [x] **Step 5: Push all Plan 1 work**

```bash
git push
```

---

# ============================================================
# PLAN 2: Design Gap UI Rebuild ✅ COMPLETE
# ============================================================

**Spec:** `docs/superpowers/specs/2026-04-09-design-gap-prd.md`
**Detailed Plan:** `docs/superpowers/plans/2026-04-09-design-gap-plan.md`
**Status:** ✅ All 16 tasks complete — committed and pushed.

**Goal:** Rebuild all UI to match `stitch_new_project/` designs, wire every interaction to real backend, add missing pages.

**This plan is already fully written** at the path above with 16 tasks. All completed:

| Task | Name |
|------|------|
| 1 | Integration Audit — Fix All Broken Wiring |
| 2 | fal.ai Client + Agent Images |
| 3 | Sidebar Rebuild |
| 4 | Top Bar Updates |
| 5 | Dashboard Rebuild — Morning Brief + Metrics + Agent Chains |
| 6 | Chat Rebuild — 3-Panel Layout |
| 7 | Agent Directory Rebuild |
| 8 | Agent Detail Pages Rebuild |
| 9 | Agent Skills Page (NEW) |
| 10 | Deploy Custom Agent Page (NEW) |
| 11 | Campaign Creation Flow (NEW) |
| 12 | Pitch Deck Pages (NEW) |
| 13 | Production Pages — Auth, Skill Run Detail, Knowledge Browser |
| 14 | Legal, Support, Error Pages |
| 15 | Landing Page + Onboarding Design Match |
| 16 | Final Integration Test + Push |

**Note:** Plan 2 Task 2 (fal.ai + Agent Images) overlaps with Plan 1 Task 4 (fal.ai client). Since Plan 1 creates `fal-client.ts`, Plan 2 Task 2 should skip the client creation and focus only on downloading CDN images and generating missing agent portraits.

---

# ============================================================
# PLAN 3: Creative Intelligence Engine (Execute Third)
# ============================================================

**Spec:** `docs/superpowers/specs/2026-04-09-creative-intelligence-engine.md`

## Spec Summary

### What This Builds

The crown jewel of Growth OS — a data-driven creative generation system that uses the knowledge graph to produce images and videos informed by what actually works for the brand. Not generic AI creative, but intelligence-backed creative grounded in:

1. **Performance data** — which ads had the highest CTR/ROAS (from `knowledge_nodes` of type `ad_creative`, `top_content` with `performance_metrics`)
2. **Cohort analysis** — Atlas's persona profiles built from real Shopify customer data (from `persona` knowledge nodes)
3. **Brand guidelines** — voice tone, colors, do/don't say (from `brand_guidelines` table + knowledge node)
4. **Competitor intelligence** — what competitors are running (from `competitor_creative` knowledge nodes)
5. **Feedback loop** — each generated creative gets scored by personas, and scores feed back into future generation

### The Creative Intelligence Loop

```
1. Brand connects → Shopify products + images enter knowledge graph
2. Scout runs health-check → findings enter knowledge graph
3. Atlas builds personas from customer data → personas enter knowledge graph
4. Echo scans competitors → competitor creatives enter knowledge graph
5. Brand runs "New Campaign" →
   a. System queries knowledge graph: best-performing creatives, personas, brand guidelines, competitor intel
   b. Aria generates copy INFORMED BY this context (not generic)
   c. Atlas's personas review with DATA-BACKED feedback
   d. User approves → fal.ai generates images using brand colors, product photos, winning ad styles
   e. fal.ai generates video variants
   f. Output enters knowledge graph with performance_metrics = {} (to be filled after running)
6. After ads run → performance data flows back (via Meta/Google API)
7. Next campaign run → knowledge graph has REAL performance data → even smarter generation
```

### New Components

#### `src/lib/creative-intelligence.ts` — Core Engine

```typescript
export interface CreativeContext {
  topPerformingCreatives: Array<{ name: string; metrics: any; style: string }>
  personas: Array<{ name: string; demographics: any; preferences: any }>
  brandGuidelines: { voiceTone: any; colors: any; doSay: string[]; dontSay: string[] }
  competitorCreatives: Array<{ name: string; style: string; performance: any }>
  productImages: Array<{ name: string; url: string; productTitle: string }>
}

// Gather all intelligence from knowledge graph for creative generation
export async function gatherCreativeContext(brandId: string): Promise<CreativeContext>

// Generate an AI-informed creative brief (text prompt for fal.ai)
export async function generateIntelligentBrief(
  brandId: string,
  campaignGoal: string,
  targetAudience: string,
  context: CreativeContext
): Promise<CreativeBrief>
// See Spec 3 for full `CreativeBrief` interface with `imagePrompts` (array of objects), `videoPrompts`, `copyVariants`, `reasoning`.

// Score a generated creative against brand guidelines and persona preferences
export async function scoreCreative(
  brandId: string,
  creative: { imageUrl: string; copyText: string },
  context: CreativeContext
): Promise<CreativeScore>
// See Spec 3 for full `CreativeScore` interface with `overallScore`, `brandGuidelineMatch`, `personaScores`, `strengths`, `improvements`, `predictedPerformance`.
```

#### `src/app/dashboard/creative/page.tsx` — Creative Studio (NEW PAGE)

The main creative intelligence interface:

- **Gallery view** — browse all generated creatives (images + videos) for the brand
  - Filter: by campaign, by date, by performance score
  - Each card: thumbnail, campaign name, persona score, performance metrics (if available)
  - Click to expand: full image, copy text, persona feedback, download

- **Generate new** — "New Creative" button → opens generation flow:
  1. Select campaign goal (awareness/conversion/retention)
  2. Select target personas (from Atlas's persona nodes)
  3. System shows: "Based on your best-performing creatives and brand guidelines, here's what I recommend..."
  4. Shows knowledge graph context: top 3 performing ad styles, brand color palette, persona preferences
  5. User can adjust or approve
  6. Generate: produces 4 image variants + 2 video variants via fal.ai
  7. Persona review: automatic scoring by Atlas personas
  8. Results displayed with scores and feedback

- **Performance dashboard** — shows how generated creatives perform over time
  - Creative performance trend (generated vs manual)
  - Best-performing creative style patterns
  - Persona accuracy (did the predicted best variant actually perform best?)

#### `src/app/api/creative/generate/route.ts` — Generation API

```typescript
// POST /api/creative/generate
// Request: { brandId, campaignGoal, targetPersonas?, customPrompt? }
// 1. gatherCreativeContext(brandId)
// 2. generateIntelligentBrief(brandId, goal, audience, context)
// 3. generateImage() × 4 variants via fal.ai
// 4. generateVideo() × 2 variants via fal.ai
// 5. persistToStorage() for each
// 6. createMediaNode() for each
// 7. scoreCreative() for each via persona review
// 8. Return all variants with scores
```

#### `src/app/api/creative/gallery/route.ts` — Gallery API

```typescript
// GET /api/creative/gallery?brandId=X&page=1&limit=20
// Query knowledge_nodes where node_type IN ('ad_creative', 'video_asset')
// Join with knowledge_snapshots for performance data
// Return sorted by created_at DESC
```

### Video Generation

fal.ai supports video models. The creative intelligence engine uses:
- `fal-ai/minimax-video/video-01-live` for short-form video (5-10s)
- Prompts are informed by: brand aesthetic, top-performing video styles, product imagery
- Videos are stored in `generated-assets` bucket as `.mp4`
- Knowledge nodes created with `node_type: 'video_asset'`

### Performance Feedback Loop

When ad performance data comes in (via Meta Ads API / Google Ads API through the existing MCP client):
1. Match the ad creative to a `knowledge_node` (by name or metadata)
2. Create a `knowledge_snapshot` with real performance metrics (impressions, CTR, ROAS, CPC)
3. Next time `gatherCreativeContext()` runs, it sees the REAL performance data
4. The generation model learns: "Creatives with style X perform 3x better than style Y for this brand"

This is implemented as a post-hook in the daily cron route — after Meta/Google data is fetched, update creative node snapshots.

---

## Plan 3 Tasks

### Plan 3 — Task 1: Creative Intelligence Core

**Files:**
- Create: `src/lib/creative-intelligence.ts`

- [ ] **Step 1: Create the creative intelligence module**

Implement `gatherCreativeContext()`:
- Query knowledge graph for `ad_creative` nodes with snapshots (performance data), sorted by performance
- Query `persona` nodes
- Load `brand_guidelines` from the dedicated table
- Query `competitor_creative` nodes
- Query `product_image` nodes
- Return structured `CreativeContext`

Implement `generateIntelligentBrief()`:
- Call Claude Sonnet with the creative context + campaign goal
- System prompt instructs: "You are Aria's creative intelligence engine. Use the provided performance data, persona profiles, brand guidelines, and competitor intel to generate image and video prompts that are informed by what works for this brand."
- Return structured prompts for fal.ai

Implement `scoreCreative()`:
- Call the `persona-creative-review` skill logic inline
- Score each creative against each persona
- Return aggregate score + per-persona feedback

- [ ] **Step 2: Build passes and commit**

```bash
npm run build
git add src/lib/creative-intelligence.ts
git commit -m "feat: add creative intelligence engine with knowledge-informed generation"
```

---

### Plan 3 — Task 2: Creative Generation API

**Files:**
- Create: `src/app/api/creative/generate/route.ts`
- Create: `src/app/api/creative/gallery/route.ts`

- [ ] **Step 1: Create generation endpoint**

`POST /api/creative/generate`:
1. Auth + brand access check
2. Parse `{ brandId, campaignGoal, targetPersonas, customPrompt }`
3. Call `gatherCreativeContext(brandId)`
4. Call `generateIntelligentBrief(brandId, campaignGoal, targetPersonas, context)`
5. Call `generateImage()` × 4 variants
6. Call `generateVideo()` × 2 variants (if campaign goal supports video)
7. Persist all to storage + create media nodes
8. Call `scoreCreative()` for each variant
9. Return `{ images: [...], videos: [...], reasoning, scores }`

- [ ] **Step 2: Create gallery endpoint**

`GET /api/creative/gallery?brandId=X&page=1&limit=20`:
1. Auth + brand access check
2. Query `knowledge_nodes` where `node_type IN ('ad_creative', 'video_asset')` and `brand_id = brandId`
3. Left join `knowledge_snapshots` for latest performance data per node
4. Return paginated results with media_url, properties, performance metrics

- [ ] **Step 3: Create score and feedback endpoints**

`POST /api/creative/score`:
1. Auth + brand access check
2. Parse `{ brandId, creativeNodeId }`
3. Load creative from knowledge_nodes
4. Call `scoreCreative()` with full context
5. Return `{ score: CreativeScore }`

`POST /api/creative/feedback`:
1. Auth + brand access check
2. Parse `{ brandId, creativeNodeId, metrics: { ctr, roas, impressions, conversions } }`
3. Create `knowledge_snapshot` for the creative node with the provided metrics
4. Return `{ success: true }`

- [ ] **Step 4: Build passes and commit**

```bash
npm run build
git add src/app/api/creative/
git commit -m "feat: add creative generation, gallery, score, and feedback API endpoints"
```

---

### Plan 3 — Task 3: Creative Studio Page

**Files:**
- Create: `src/app/dashboard/creative/page.tsx`

- [ ] **Step 1: Create the Creative Studio page**

Client component with three tabs: Gallery, Generate, Performance.

**Gallery tab:** Grid of creative cards fetched from `/api/creative/gallery`. Each card: thumbnail (Image or video poster), campaign name, persona score badge, performance metrics if available. Click to expand with full details.

**Generate tab:** Multi-step generation flow:
1. Campaign goal radio cards (Awareness/Conversion/Retention)
2. Target persona selector (multi-select from available personas)
3. "Knowledge Context Preview" — shows what data will inform generation (top creatives, brand colors, persona preferences)
4. Optional custom prompt override
5. "Generate" button → shows progress → displays results with scores

**Performance tab:** Simple stats cards showing: total creatives generated, average persona score, top-performing style patterns. Data from knowledge_snapshots.

- [ ] **Step 2: Build passes and commit**

```bash
npm run build
git add src/app/dashboard/creative/
git commit -m "feat: add Creative Studio page with gallery, generation, and performance tabs"
```

---

### Plan 3 — Task 4: Video Generation Support

**Files:**
- Modify: `src/lib/fal-client.ts` (already has `generateVideo` from Plan 1)
- Modify: `src/lib/creative-intelligence.ts`

- [ ] **Step 1: Enhance video prompt generation**

In `generateIntelligentBrief()`, add video-specific prompt generation. Video prompts should include:
- Scene description (based on product + brand aesthetic)
- Motion direction (based on what worked in past video content)
- Duration (5s for awareness, 10s for conversion)
- Style reference (from top-performing video content in knowledge graph)

- [ ] **Step 2: Add video preview support to Creative Studio**

Update the Creative Studio page to handle video results: show video player for `.mp4` files, play on hover in gallery view.

- [ ] **Step 3: Build passes and commit**

```bash
npm run build
git add src/lib/creative-intelligence.ts src/app/dashboard/creative/
git commit -m "feat: add video generation support to creative intelligence engine"
```

---

### Plan 3 — Task 5: Performance Feedback Loop

**Files:**
- Modify: `src/app/api/cron/daily/route.ts`
- Create: `src/lib/creative-feedback.ts`

- [ ] **Step 1: Create feedback loop module**

```typescript
// src/lib/creative-feedback.ts

export async function updateCreativePerformance(brandId: string): Promise<number> {
  // 1. Get all ad_creative/video_asset knowledge nodes for this brand
  // 2. For each that has a Meta/Google ad ID in properties:
  //    a. Fetch latest performance from Meta/Google API (via mcp-client)
  //    b. Create/update knowledge_snapshot with real metrics (impressions, CTR, ROAS, CPC)
  // 3. Return count of updated creatives
}
```

- [ ] **Step 2: Wire into daily cron**

In `src/app/api/cron/daily/route.ts`, after running daily skills, add:

```typescript
// Update creative performance from ad platforms
const { updateCreativePerformance } = await import('@/lib/creative-feedback');
for (const brand of activeBrands) {
  await updateCreativePerformance(brand.id).catch(console.warn);
}
```

- [ ] **Step 3: Build passes and commit**

```bash
npm run build
git add src/lib/creative-feedback.ts src/app/api/cron/daily/route.ts
git commit -m "feat: add creative performance feedback loop via daily cron"
```

---

### Plan 3 — Task 6: Sidebar + Navigation Integration

**Files:**
- Modify: `src/components/dashboard/sidebar.tsx`

- [ ] **Step 1: Add Creative Studio to sidebar**

Add a nav item for the Creative Studio between "Agent Skills" and "Billing & Usage":

```typescript
{ label: 'Creative Studio', href: '/dashboard/creative', icon: Palette },
```

Import `Palette` from `lucide-react`.

- [ ] **Step 2: Build passes and commit**

```bash
npm run build
git add src/components/dashboard/sidebar.tsx
git commit -m "feat: add Creative Studio to dashboard sidebar navigation"
```

---

### Plan 3 — Task 7: Final Integration + Push

- [ ] **Step 1: Full build verification**

```bash
npm run build
```

- [ ] **Step 2: Verify all creative routes in build output**

Expected new routes:
- `/api/creative/generate`
- `/api/creative/gallery`
- `/dashboard/creative`

- [ ] **Step 3: Push everything**

```bash
git push
```

---

## Summary

| Plan | Tasks | What It Delivers |
|------|-------|-----------------|
| **1** | 8 | Working knowledge graph loop, RAG in skills, fal.ai client, embeddings, brand guidelines pipeline |
| **2** | 16 | All UI matching designs, agent images, new pages (skills, campaigns, deck), every button wired |
| **3** | 7 | Data-driven creative generation, video support, performance feedback loop, Creative Studio page |
| **Total** | **31** | Production-ready Growth OS with intelligent creative generation |
