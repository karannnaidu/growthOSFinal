# Creative Pipeline Foundation — Fix the Knowledge Loop

> **Purpose:** Fix 9 critical gaps that break the creative intelligence pipeline. Without these fixes, skills have no knowledge graph context, embeddings don't exist, node types are rejected by the database, and fal.ai doesn't work. This is prerequisite infrastructure for the Data-Driven Creative Intelligence Engine.
> **Created:** 2026-04-09
> **Depends on:** Original 10-phase build (complete), must be done BEFORE the Design Gap plan and Creative Intelligence Engine
> **Scope:** Backend/infrastructure only — no UI changes

---

## The Problem

The knowledge graph is built incrementally (entities extracted after each skill run), but:
1. Skills never receive knowledge graph context at prompt time — `ragQuery()` exists but is never called
2. All extracted nodes have `embedding: null` — RAG vector search returns nothing
3. Several node/edge types used by skills are missing from DB constraints — inserts silently fail
4. fal.ai client doesn't exist — image-brief skill can't generate images
5. Brand guidelines output never persists to the dedicated table
6. Product images aren't in the knowledge graph — creative skills can't reference them

**Result:** Every creative skill runs in isolation with zero knowledge of what worked before. The "intelligence" in "creative intelligence" is completely absent.

---

## Fix 1: Schema Constraint Updates

**Problem:** Skills produce node types and edge types that the database CHECK constraints reject silently.

### 1.1 Add missing node types to `knowledge_nodes`

Current CHECK constraint is missing types that skills produce. Run this SQL:

```sql
ALTER TABLE knowledge_nodes DROP CONSTRAINT IF EXISTS valid_node_type;
ALTER TABLE knowledge_nodes ADD CONSTRAINT valid_node_type CHECK (node_type IN (
  'product', 'audience', 'campaign', 'content', 'competitor',
  'insight', 'metric', 'experiment', 'creative', 'keyword',
  'email_flow', 'channel', 'persona', 'product_image',
  'competitor_creative', 'ad_creative', 'video_asset',
  'landing_page', 'review_theme', 'price_point',
  'brand_guidelines', 'brand_asset', 'top_content'
));
```

Added: `brand_guidelines`, `brand_asset`, `top_content` (plus confirming `creative`, `competitor_creative`, `product_image` are present).

### 1.2 Add missing edge types to `knowledge_edges`

```sql
ALTER TABLE knowledge_edges DROP CONSTRAINT IF EXISTS valid_edge_type;
ALTER TABLE knowledge_edges ADD CONSTRAINT valid_edge_type CHECK (edge_type IN (
  'targets', 'uses_creative', 'competes_with', 'inspired_by',
  'performs_on', 'belongs_to', 'generated_by', 'reviewed_by',
  'derived_from', 'part_of', 'sends_to', 'has_variant',
  'supersedes', 'similar_to', 'mentions'
));
```

Added: `reviewed_by` (used by persona-creative-review).

### 1.3 Update `extractEntities` valid type sets

Update `src/lib/knowledge/extract.ts` to match the expanded constraints:
- Add `'brand_guidelines'`, `'brand_asset'`, `'top_content'`, `'creative'`, `'competitor_creative'`, `'product_image'` to `VALID_NODE_TYPES`
- Add `'reviewed_by'` to `VALID_EDGE_TYPES`

Save SQL as `supabase/migrations/001-fix-constraints.sql` and run against live DB.

---

## Fix 2: Wire RAG into Skills Engine

**Problem:** `ragQuery()` in `src/lib/knowledge/rag.ts` is fully implemented but never called. Skills have a `knowledge` field in their frontmatter that specifies what graph context they need — but the engine ignores it.

### What to change in `src/lib/skills-engine.ts`

After step 5 (fetch live platform data via MCP) and before step 6 (build prompt), add a new step:

```
Step 5.5: Fetch knowledge graph context
  - Read skill.knowledge from the skill definition
  - If skill.knowledge exists:
    - Call ragQuery({
        brandId,
        query: skill.knowledge.semanticQuery,
        nodeTypes: skill.knowledge.needs,
        limit: 15,
        traverseDepth: skill.knowledge.traverseDepth ?? 1,
        includeAgencyPatterns: skill.knowledge.includeAgencyPatterns ?? false,
      })
    - Include the RAG results in the prompt as "## Knowledge Graph Context"
```

### Prompt injection format

Add a new section to the user prompt, between brand context and live data:

```
## Knowledge Graph Context

### Relevant Nodes
{for each node: name (type) — summary, confidence: X.XX}
{properties as compact JSON}

### Related Edges
{source → edge_type → target, weight: X.XX}

### Historical Snapshots
{node name: latest metrics JSON}

### Agency Patterns (if applicable)
{pattern name: description, confidence: X.XX}
```

This gives skills access to:
- Past ad creatives and their performance metrics
- Persona profiles built from real customer data
- Competitor intelligence findings
- Historical metrics trends
- Cross-brand agency learnings

### Graceful degradation

If RAG returns no results (empty graph, brand just onboarded), the section is omitted from the prompt. The skill still runs — it just doesn't have historical context. Over time, as skills run and extract entities, the graph fills up and subsequent runs get richer context.

---

## Fix 3: Inline Embedding Generation

**Problem:** `extractEntities()` creates knowledge nodes with `embedding: null`. RAG's vector similarity search returns nothing because there's nothing to match against.

### What to change in `src/lib/knowledge/extract.ts`

After creating a node (before the Supabase insert), generate the embedding:

```typescript
import { embedText } from '@/lib/knowledge/rag'

// For each node to insert:
const embedding = await embedText(
  `${node.name}. ${node.summary || ''}. ${JSON.stringify(node.properties)}`
)
// Include embedding in the insert: { ...node, embedding }
```

`embedText()` already exists in `rag.ts` — it calls Gemini text-embedding-004 and returns a 768-dim float array.

### Rate limit handling

Gemini text-embedding-004 has 1500 RPD on free tier. A typical skill run extracts 3-10 nodes. At 50 skill runs/day, that's ~500 embedding calls — well within limits.

If the embedding call fails (rate limit, network error), insert the node with `embedding: null` and log a warning. A backfill job can catch these later.

### Backfill existing null embeddings

Create a one-time script `scripts/backfill-embeddings.ts` that:
1. Queries all `knowledge_nodes` where `embedding IS NULL`
2. Generates embeddings in batches of 10 (with 100ms delay between batches)
3. Updates each row

Also add a cron-callable API route `POST /api/cron/backfill-embeddings` that does the same, callable from Vercel Cron on a schedule (e.g., hourly) to catch any missed nodes.

---

## Fix 4: fal.ai Client

**Problem:** `src/lib/fal-client.ts` doesn't exist. The image-brief skill describes calling fal.ai in its Post-Execution section, but there's no code.

### Create `src/lib/fal-client.ts`

```typescript
export interface ImageGenerationOptions {
  prompt: string
  negativePrompt?: string
  width?: number       // default 1024
  height?: number      // default 1024
  model?: string       // default 'fal-ai/flux/schnell'
  num_images?: number  // default 1
  seed?: number
}

export interface VideoGenerationOptions {
  prompt: string
  duration?: number     // seconds, default 5
  width?: number
  height?: number
  model?: string        // default 'fal-ai/minimax-video/video-01-live'
}

export interface GeneratedMedia {
  url: string
  width: number
  height: number
  content_type: string  // 'image/png' or 'video/mp4'
}

// Image generation
export async function generateImage(options: ImageGenerationOptions): Promise<GeneratedMedia[]>

// Video generation
export async function generateVideo(options: VideoGenerationOptions): Promise<GeneratedMedia>

// Download generated media and upload to Supabase Storage
export async function persistToStorage(
  mediaUrl: string,
  brandId: string,
  bucket: 'brand-assets' | 'generated-assets' | 'competitor-assets',
  subPath: string
): Promise<{ storagePath: string; publicUrl: string }>

// Create a knowledge node for generated media
export async function createMediaNode(
  brandId: string,
  nodeType: 'ad_creative' | 'video_asset' | 'brand_asset',
  name: string,
  storagePath: string,
  bucket: string,
  mediaType: string,
  sourceSkill: string,
  sourceRunId: string,
  properties?: Record<string, any>
): Promise<string>  // returns node ID
```

### BYOK support

Check `byok_keys` table for a brand-specific fal.ai key before falling back to the platform key:

```typescript
async function getFalKey(brandId: string): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('byok_keys')
    .select('vault_secret_id')
    .eq('brand_id', brandId)
    .eq('provider', 'fal')
    .single()

  if (data?.vault_secret_id) {
    // Decrypt via Supabase Vault
    const { data: secret } = await supabase.rpc('get_decrypted_secret', { secret_id: data.vault_secret_id })
    if (secret) return secret
  }

  // Fall back to platform key
  const key = process.env.FAL_AI_KEY
  if (!key) throw new Error('FAL_AI_KEY not configured')
  return key
}
```

### Wire into skills engine

After a skill with `chainsTo` including `image-brief` completes, or when `image-brief` itself completes, the Post-Execution hook should:
1. Parse the output for fal.ai-ready prompts
2. Call `generateImage()` for each prompt
3. Call `persistToStorage()` to save to `generated-assets` bucket
4. Call `createMediaNode()` to add to knowledge graph with embedding

This is implemented as a post-execution hook in `skills-engine.ts`, not inside the skill itself.

### Env var

Add `FAL_AI_KEY=` to `.env.local.example`.

---

## Fix 5: Brand Guidelines Pipeline

**Problem:** `brand-voice-extractor` skill produces structured brand guidelines output, but it's never written to the `brand_guidelines` table or promoted to a knowledge node.

### What to change

In the post-skill-run handler (after `extractEntities`), add a check:

```typescript
if (skillId === 'brand-voice-extractor' && result.status === 'completed') {
  // Write to brand_guidelines table
  await supabase.from('brand_guidelines').upsert({
    brand_id: brandId,
    voice_tone: result.output.voice_tone,
    target_audience: result.output.target_audience,
    positioning: result.output.positioning,
    do_say: result.output.do_say,
    dont_say: result.output.dont_say,
    colors: result.output.colors,
    brand_story: result.output.brand_story,
    competitor_positioning: result.output.competitor_positioning,
  }, { onConflict: 'brand_id' })

  // Also update brands.brand_guidelines JSONB for quick access
  await supabase.from('brands').update({
    brand_guidelines: result.output,
  }).eq('id', brandId)
}
```

This ensures both the dedicated table and the JSONB column stay in sync, and the entity extractor creates a `brand_guidelines` knowledge node (now that the type is valid per Fix 1).

---

## Fix 6: Product Images → Knowledge Nodes

**Problem:** When Shopify products are synced, their image URLs are stored in `products.images` JSONB but never promoted to `brand_asset` knowledge nodes. The `image-brief` skill requests `product_image` nodes but finds none.

### What to change in `src/lib/shopify.ts`

In `pullShopifyProducts()`, after upserting products, also create knowledge nodes for product images:

```typescript
for (const product of products) {
  // Create product node (already done)

  // Create brand_asset nodes for product images
  const images = product.images || []
  for (const image of images.slice(0, 3)) { // max 3 images per product
    const embedding = await embedText(`Product image for ${product.title}. ${product.description || ''}`)

    await supabase.from('knowledge_nodes').upsert({
      brand_id: brandId,
      node_type: 'product_image',
      name: `${product.title} — Image`,
      summary: `Product photo for ${product.title}`,
      properties: {
        product_title: product.title,
        shopify_id: product.id?.toString(),
        image_url: image.src,
        alt: image.alt || product.title,
      },
      media_url: image.src,
      media_type: 'image/jpeg',
      source_skill: 'shopify-sync',
      embedding,
      is_active: true,
    }, { onConflict: 'brand_id,name' })

    // Edge: product_image belongs_to product
    // (create edge linking to the product knowledge node)
  }
}
```

This runs during onboarding (initial Shopify sync) and on Shopify webhook product updates.

---

## Fix 7: Top Content → Knowledge Graph Bridge

**Problem:** The `top_content` table stores high-performing content pieces, but skills reference `top_content` as a knowledge node type. There's no bridge writing `top_content` rows into the knowledge graph.

### Create a bridge function

```typescript
// src/lib/knowledge/bridges.ts

export async function bridgeTopContent(brandId: string): Promise<number> {
  const supabase = await createClient()

  const { data: topContent } = await supabase
    .from('top_content')
    .select('*')
    .eq('brand_id', brandId)

  if (!topContent?.length) return 0

  let created = 0
  for (const item of topContent) {
    const embedding = await embedText(
      `${item.content_type} content: ${item.title}. Performance: ${JSON.stringify(item.performance_metrics)}`
    )

    await supabase.from('knowledge_nodes').upsert({
      brand_id: brandId,
      node_type: 'top_content',
      name: item.title || `Top ${item.content_type}`,
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
    }, { onConflict: 'brand_id,name' })
    created++
  }

  return created
}
```

Call this:
- After health-check skill (which may populate top_content)
- On a daily schedule (part of the daily cron)
- On demand from the knowledge graph browser

---

## Execution Order

These fixes must be applied in order:

1. **Fix 1** (schema constraints) — must be first, or all subsequent inserts fail
2. **Fix 3** (inline embeddings) — must be before Fix 2, so new nodes are searchable
3. **Fix 2** (wire RAG into skills engine) — the core fix
4. **Fix 5** (brand guidelines pipeline) — feeds into RAG context
5. **Fix 6** (product images → nodes) — enriches the graph
6. **Fix 7** (top content bridge) — enriches the graph
7. **Fix 4** (fal.ai client) — enables image/video generation
8. **Backfill** — run backfill-embeddings for any existing null-embedding nodes

After all fixes: every skill run enriches the knowledge graph, every subsequent run gets richer context from RAG, and the creative pipeline has a working feedback loop.

---

## Success Criteria

1. Running `health-check` → `ad-copy` chain: the ad-copy skill receives knowledge graph context including the health-check insights
2. Running `ad-copy` twice: the second run knows about the first run's output (via extracted nodes + RAG)
3. Running `persona-creative-review`: creates `reviewed_by` edges that persist (no constraint violation)
4. Running `brand-voice-extractor`: output persists to both `brand_guidelines` table and knowledge graph
5. Running `image-brief`: fal.ai generates actual images, stored in Supabase Storage, knowledge nodes created
6. All extracted nodes have non-null embeddings
7. Product images appear as knowledge nodes after Shopify sync
8. Top content appears as knowledge nodes
