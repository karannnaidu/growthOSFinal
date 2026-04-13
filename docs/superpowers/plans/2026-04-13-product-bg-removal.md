# Product Background Removal + Creative Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add background removal for product images so creative generation produces clean, professional D2C ad creatives with real products.

**Architecture:** "Remove Background" button on Brand DNA page calls fal.ai birefnet for transparent PNGs, stored in Supabase Storage. Creative generation uses transparent versions when available via img2img, falls back to original with a warning.

**Tech Stack:** fal.ai birefnet/v2 (bg removal), Supabase Storage, existing Brand DNA settings page, existing creative generation pipeline.

---

### Task 1: Add removeBackground to fal-client.ts

**Files:**
- Modify: `src/lib/fal-client.ts`

- [ ] **Step 1: Add the removeBackground function**

Add this function after the existing `describeImage` function in `src/lib/fal-client.ts`:

```typescript
/**
 * Remove background from an image using fal.ai BiRefNet.
 * Returns the URL of the transparent PNG.
 */
export async function removeBackground(imageUrl: string, brandId?: string): Promise<string> {
  const apiKey = await getFalKey(brandId);

  const res = await fetch('https://fal.run/fal-ai/birefnet/v2', {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image_url: imageUrl }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`fal.ai background removal error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { image?: { url: string } };
  if (!data.image?.url) {
    throw new Error('fal.ai background removal returned no image');
  }

  return data.image.url;
}
```

- [ ] **Step 2: Verify types pass**

```bash
npx tsc --noEmit --pretty false 2>&1 | head -5
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/fal-client.ts
git commit -m "feat: add removeBackground function using fal.ai birefnet"
```

---

### Task 2: Create remove-bg API endpoint

**Files:**
- Create: `src/app/api/products/remove-bg/route.ts`

- [ ] **Step 1: Create the directory and route**

```bash
mkdir -p src/app/api/products/remove-bg
```

- [ ] **Step 2: Write the endpoint**

Create `src/app/api/products/remove-bg/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { removeBackground } from '@/lib/fal-client'

export const maxDuration = 60

// POST /api/products/remove-bg
// Body: { brandId, productName, imageUrl }
// Returns: { transparentUrl, storagePath }
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId: string; productName: string; imageUrl: string }
  try {
    body = await request.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, productName, imageUrl } = body
  if (!brandId || !productName || !imageUrl) {
    return NextResponse.json({ error: 'brandId, productName, and imageUrl required' }, { status: 400 })
  }

  // Verify brand access
  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id').eq('id', brandId).single()
  if (!brand || brand.owner_id !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  try {
    // 1. Remove background via fal.ai
    const transparentFalUrl = await removeBackground(imageUrl, brandId)

    // 2. Download the transparent PNG and upload to Supabase Storage
    const imgRes = await fetch(transparentFalUrl)
    if (!imgRes.ok) throw new Error('Failed to download transparent image')
    const buffer = Buffer.from(await imgRes.arrayBuffer())

    const safeName = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const storagePath = `${brandId}/products/${safeName}-transparent.png`

    const { error: uploadErr } = await admin.storage
      .from('generated-assets')
      .upload(storagePath, buffer, { contentType: 'image/png', upsert: true })

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)

    const { data: urlData } = admin.storage.from('generated-assets').getPublicUrl(storagePath)
    const transparentUrl = urlData?.publicUrl ?? ''

    // 3. Update the product in brand_guidelines
    const { data: brandRow } = await admin.from('brands')
      .select('brand_guidelines')
      .eq('id', brandId)
      .single()

    if (brandRow?.brand_guidelines) {
      const dna = brandRow.brand_guidelines as Record<string, unknown>
      const products = (dna.products as Array<Record<string, unknown>>) ?? []
      const updated = products.map(p => {
        if (p.name === productName) {
          return { ...p, transparent_image_url: transparentUrl, bg_removed_at: new Date().toISOString(), bg_approved: false }
        }
        return p
      })
      await admin.from('brands').update({ brand_guidelines: { ...dna, products: updated } }).eq('id', brandId)
    }

    // 4. Also update the product knowledge node if it exists
    await admin.from('knowledge_nodes')
      .update({
        properties: admin.rpc ? undefined : undefined, // Can't do JSON merge in Supabase easily
      })
      .eq('brand_id', brandId)
      .eq('node_type', 'product')
      .eq('name', productName)
    // Simpler: just do a select + update
    const { data: node } = await admin.from('knowledge_nodes')
      .select('id, properties')
      .eq('brand_id', brandId)
      .eq('node_type', 'product')
      .eq('name', productName)
      .eq('is_active', true)
      .single()

    if (node) {
      await admin.from('knowledge_nodes').update({
        properties: { ...(node.properties as Record<string, unknown>), transparent_image_url: transparentUrl, bg_removed_at: new Date().toISOString(), bg_approved: false },
      }).eq('id', node.id)
    }

    return NextResponse.json({ transparentUrl, storagePath })
  } catch (err) {
    console.error('[remove-bg] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Background removal failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create approve-bg endpoint in same directory**

Create `src/app/api/products/approve-bg/route.ts`:

```bash
mkdir -p src/app/api/products/approve-bg
```

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// POST /api/products/approve-bg
// Body: { brandId, productName, approved }
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { brandId: string; productName: string; approved: boolean }
  try {
    body = await request.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { brandId, productName, approved } = body
  if (!brandId || !productName || approved === undefined) {
    return NextResponse.json({ error: 'brandId, productName, and approved required' }, { status: 400 })
  }

  const admin = createServiceClient()
  const { data: brand } = await admin.from('brands').select('id, owner_id, brand_guidelines').eq('id', brandId).single()
  if (!brand || brand.owner_id !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Update product in brand_guidelines
  const dna = brand.brand_guidelines as Record<string, unknown>
  const products = (dna?.products as Array<Record<string, unknown>>) ?? []
  const updated = products.map(p => {
    if (p.name === productName) {
      if (approved) {
        return { ...p, bg_approved: true }
      } else {
        // Rejected — remove transparent URL
        const { transparent_image_url, bg_removed_at, bg_approved, ...rest } = p as Record<string, unknown>
        return rest
      }
    }
    return p
  })

  await admin.from('brands').update({ brand_guidelines: { ...dna, products: updated } }).eq('id', brandId)

  // Also update knowledge node
  const { data: node } = await admin.from('knowledge_nodes')
    .select('id, properties')
    .eq('brand_id', brandId)
    .eq('node_type', 'product')
    .eq('name', productName)
    .eq('is_active', true)
    .single()

  if (node) {
    const nodeProps = node.properties as Record<string, unknown>
    if (approved) {
      await admin.from('knowledge_nodes').update({
        properties: { ...nodeProps, bg_approved: true },
      }).eq('id', node.id)
    } else {
      const { transparent_image_url, bg_removed_at, bg_approved, ...rest } = nodeProps
      await admin.from('knowledge_nodes').update({ properties: rest }).eq('id', node.id)
    }
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Verify types pass**

```bash
npx tsc --noEmit --pretty false 2>&1 | head -5
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/products/
git commit -m "feat: remove-bg and approve-bg API endpoints for product images"
```

---

### Task 3: Add Background Removal UI to Brand DNA Settings Page

**Files:**
- Modify: `src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Add product background removal state and handlers**

In the Brand DNA settings page, find the Products section (the `<Card>` with `SectionHeader icon={Package}`). Each product card needs:
- State for tracking which product is being processed
- "Remove Background" button (or status indicator if already done)
- Approval preview when transparent version exists but not approved

Add these state variables near the other state declarations:

```typescript
const [removingBg, setRemovingBg] = useState<string | null>(null) // product name being processed
const [bgPreviews, setBgPreviews] = useState<Record<string, string>>({}) // productName -> transparent URL preview
```

Add these handler functions:

```typescript
async function handleRemoveBg(productName: string, imageUrl: string) {
  if (!brandId || removingBg) return
  setRemovingBg(productName)
  try {
    const res = await fetch('/api/products/remove-bg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, productName, imageUrl }),
    })
    if (res.ok) {
      const data = await res.json()
      setBgPreviews(prev => ({ ...prev, [productName]: data.transparentUrl }))
      // Re-fetch DNA to get updated product data
      const dnaRes = await fetch(`/api/settings/brand-dna?brandId=${brandId}`)
      if (dnaRes.ok) {
        const dnaData = await dnaRes.json()
        setDna(dnaData.dna)
      }
    }
  } finally {
    setRemovingBg(null)
  }
}

async function handleApproveBg(productName: string, approved: boolean) {
  if (!brandId) return
  await fetch('/api/products/approve-bg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandId, productName, approved }),
  })
  setBgPreviews(prev => { const next = { ...prev }; delete next[productName]; return next })
  // Re-fetch DNA
  const dnaRes = await fetch(`/api/settings/brand-dna?brandId=${brandId}`)
  if (dnaRes.ok) {
    const dnaData = await dnaRes.json()
    setDna(dnaData.dna)
  }
}
```

- [ ] **Step 2: Update the product card rendering**

Find the product cards grid in the Products section. Replace each product card's content to include background removal controls. Each product card should render:

```tsx
<div key={product.name + idx} className="rounded-lg bg-white/5 overflow-hidden flex flex-col group relative">
  {/* Image */}
  {product.image_url ? (
    <div className="aspect-square bg-white/5 relative">
      <img src={product.image_url} alt={product.name} className="absolute inset-0 w-full h-full object-cover" />
      {/* Approved transparent badge */}
      {product.bg_approved && (
        <span className="absolute top-1.5 left-1.5 bg-[#10b981]/80 text-white text-[9px] px-1.5 py-0.5 rounded-full">
          BG Removed
        </span>
      )}
    </div>
  ) : (
    <div className="aspect-square bg-white/5 flex items-center justify-center">
      <Package className="w-6 h-6 text-muted-foreground/20" />
    </div>
  )}

  <div className="p-2.5 flex-1 flex flex-col">
    <span className="text-xs font-medium text-foreground line-clamp-2 mb-0.5">{product.name}</span>
    {product.price && <span className="text-[10px] font-metric text-muted-foreground">{product.price}</span>}

    {/* Background removal controls */}
    {product.image_url && !product.bg_approved && !bgPreviews[product.name] && (
      <button
        onClick={() => handleRemoveBg(product.name, product.image_url!)}
        disabled={removingBg === product.name}
        className="mt-2 text-[10px] text-[#6366f1] hover:text-[#6366f1]/80 disabled:opacity-50"
      >
        {removingBg === product.name ? 'Removing...' : 'Remove Background'}
      </button>
    )}

    {/* Approval preview */}
    {(bgPreviews[product.name] || (product.transparent_image_url && !product.bg_approved)) && (
      <div className="mt-2 space-y-1.5">
        <div className="aspect-square bg-[#1a1a2e] rounded-md overflow-hidden relative">
          <img
            src={bgPreviews[product.name] || product.transparent_image_url}
            alt={product.name + ' transparent'}
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>
        <div className="flex gap-1">
          <button onClick={() => handleApproveBg(product.name, true)}
            className="flex-1 text-[9px] bg-[#10b981]/20 text-[#10b981] rounded py-1 hover:bg-[#10b981]/30">
            Approve
          </button>
          <button onClick={() => handleApproveBg(product.name, false)}
            className="flex-1 text-[9px] bg-[#ef4444]/20 text-[#ef4444] rounded py-1 hover:bg-[#ef4444]/30">
            Reject
          </button>
        </div>
      </div>
    )}
  </div>

  {/* Remove product button */}
  <button
    onClick={() => update((d) => ({ ...d, products: d.products.filter((_, i) => i !== idx) }))}
    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white/70 hover:text-white hover:bg-red-500/80 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
  >
    <X className="w-3 h-3" />
  </button>
</div>
```

Note: The `BrandDna` interface's `products` type needs `transparent_image_url`, `bg_approved`, and `bg_removed_at` added as optional fields. Find the `products` type definition in the BrandDna interface and update:

```typescript
products: {
  name: string
  description: string
  price: string | null
  image_url: string | null
  category: string
  transparent_image_url?: string
  bg_approved?: boolean
  bg_removed_at?: string
}[]
```

- [ ] **Step 3: Verify types pass**

```bash
npx tsc --noEmit --pretty false 2>&1 | head -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/settings/page.tsx
git commit -m "feat: product background removal UI on Brand DNA settings page"
```

---

### Task 4: Use Transparent Images in Creative Generation

**Files:**
- Modify: `src/app/api/creative/generate/route.ts`

- [ ] **Step 1: Update product image selection to prefer transparent versions**

In `src/app/api/creative/generate/route.ts`, find the section where product images are gathered (the "Step 3.5" block that fetches `brandData` and builds `productImages`). Replace the product image selection logic:

```typescript
    // 3.5 Fetch product images — prefer transparent (bg-removed) versions
    const { data: brandData } = await admin
      .from('brands')
      .select('brand_guidelines, product_context')
      .eq('id', brandId)
      .single()

    const products = (brandData?.brand_guidelines as Record<string, unknown>)?.products as Array<{ name: string; image_url?: string; transparent_image_url?: string; bg_approved?: boolean }> ?? brandData?.product_context as Array<{ name: string; image_url?: string }> ?? []

    const productImages: string[] = []
    let hasTransparent = false
    for (const p of products) {
      if (p.transparent_image_url && p.bg_approved) {
        productImages.push(p.transparent_image_url)
        hasTransparent = true
      } else if (p.image_url) {
        productImages.push(p.image_url)
      }
    }
    console.log(`[creative/generate] Product images: ${productImages.length} (${hasTransparent ? 'has transparent' : 'no transparent — better results with bg removal'})`)
```

The rest of the pipeline stays the same — `referenceImageUrl` is already set from `productImages`. Transparent PNGs will produce cleaner img2img results because the product is isolated.

- [ ] **Step 2: Verify types pass**

```bash
npx tsc --noEmit --pretty false 2>&1 | head -5
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/creative/generate/route.ts
git commit -m "feat: creative generation prefers transparent product images when available"
```

---

## Summary

| Task | What | Files | Depends On |
|------|------|-------|-----------|
| 1 | removeBackground function | fal-client.ts | — |
| 2 | API endpoints (remove-bg, approve-bg) | 2 new routes | Task 1 |
| 3 | Brand DNA UI (button, preview, approve) | settings/page.tsx | Task 2 |
| 4 | Creative generation uses transparent images | generate/route.ts | Task 2 |

**Recommended execution order:** 1 → 2 → 3 → 4 (sequential, each builds on the last)
