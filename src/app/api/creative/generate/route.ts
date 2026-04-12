// ---------------------------------------------------------------------------
// POST /api/creative/generate
//
// Full creative generation pipeline:
//   1. Auth + brand access check
//   2. Gather creative context from knowledge graph
//   3. Generate an intelligent brief (image prompts, video prompts, copy)
//   4. Generate 4 image variants via fal.ai
//   5. Generate 2 video variants via fal.ai (non-fatal)
//   6. Persist all media to Supabase Storage
//   7. Create knowledge graph nodes for each media item
//   8. Score each image+copy combination
//   9. Return { images, videos, brief, scores }
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  gatherCreativeContext,
  generateIntelligentBrief,
  scoreCreative,
  type CreativeBrief,
  type CreativeScore,
} from '@/lib/creative-intelligence'
import {
  generateImage,
  generateVideo,
  persistToStorage,
  createMediaNode,
  type GeneratedMedia,
} from '@/lib/fal-client'

export const maxDuration = 300 // Vercel Pro: 300s for full creative pipeline

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PersistedMedia extends GeneratedMedia {
  storagePath: string
  publicUrl: string
  nodeId: string
}

/** Generate a unique run ID for tracing this pipeline execution. */
function makeRunId(): string {
  return `creative-gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { brandId, campaignGoal, targetPersonas, customPrompt } = body as {
    brandId?: string
    campaignGoal?: string
    targetPersonas?: string
    customPrompt?: string
  }

  if (!brandId || !campaignGoal) {
    return NextResponse.json(
      { error: 'brandId and campaignGoal are required' },
      { status: 400 },
    )
  }

  // Brand access check
  const admin = createServiceClient()
  const { data: brand } = await admin
    .from('brands')
    .select('id, owner_id')
    .eq('id', brandId)
    .single()

  if (!brand) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (brand.owner_id !== user.id) {
    const { data: member } = await admin
      .from('brand_members')
      .select('brand_id')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .single()
    if (!member) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const runId = makeRunId()

  try {
    // 2. Gather creative context
    console.log(`[creative/generate] Step 2: gathering context for brand ${brandId}`)
    const context = await gatherCreativeContext(brandId)
    console.log(`[creative/generate] Step 2 done. Creatives: ${context.topPerformingCreatives?.length}, Personas: ${context.personas?.length}`)

    // 3. Generate intelligent brief
    console.log(`[creative/generate] Step 3: generating brief via Claude`)
    const brief: CreativeBrief = await generateIntelligentBrief(
      brandId,
      customPrompt ? `${campaignGoal}\n\nAdditional instructions: ${customPrompt}` : campaignGoal,
      targetPersonas || 'general audience',
      context,
    )
    console.log(`[creative/generate] Step 3 done. Image prompts: ${brief.imagePrompts?.length}, Reasoning: ${brief.reasoning?.slice(0, 50)}`)

    // 3.5 Fetch product images from Brand DNA for image-to-image reference
    const { data: brandData } = await admin
      .from('brands')
      .select('brand_guidelines, product_context')
      .eq('id', brandId)
      .single()

    const products = (brandData?.brand_guidelines as Record<string, unknown>)?.products as Array<{ name: string; image_url?: string }> ?? brandData?.product_context as Array<{ name: string; image_url?: string }> ?? []
    const productImages = products.filter(p => p.image_url).map(p => p.image_url!)
    console.log(`[creative/generate] Product images available: ${productImages.length}`)

    // 4. Generate 4 image variants using product images as references
    const imagePrompts = brief.imagePrompts.slice(0, 4)
    console.log(`[creative/generate] Step 4: generating ${imagePrompts.length} images via fal.ai (img2img with product refs)`)
    const imageResults = await Promise.allSettled(
      imagePrompts.map((p, idx) =>
        generateImage({
          prompt: p.prompt + '. Feature the actual product prominently. Professional product photography for D2C social media ad.',
          negativePrompt: (p.negativePrompt || '') + ', blurry product, missing product, no product visible',
          width: p.width || 1024,
          height: p.height || 1024,
          num_images: 1,
          brandId,
          // Cycle through product images as references
          referenceImageUrl: productImages.length > 0 ? productImages[idx % productImages.length] : undefined,
          strength: 0.6, // Keep product recognizable but allow creative context
        }),
      ),
    )

    const rawImages: GeneratedMedia[] = []
    for (const result of imageResults) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        rawImages.push(result.value[0]!)
      }
    }

    // 5. Generate 2 video variants (non-fatal — skip entirely if no FAL_AI_KEY)
    const rawVideos: GeneratedMedia[] = []
    const videoPrompts = brief.videoPrompts.slice(0, 2)
    try {
      const videoResults = await Promise.allSettled(
        videoPrompts.map((p) =>
          generateVideo({
            prompt: p.prompt,
            duration: p.duration || 5,
            brandId,
          }),
        ),
      )
      for (const result of videoResults) {
        if (result.status === 'fulfilled') {
          rawVideos.push(result.value)
        }
      }
    } catch {
      // Video generation is non-fatal
      console.warn(`[POST /api/creative/generate] Video generation skipped or failed`)
    }

    // 6. Persist to storage + 7. Create knowledge nodes
    const persistedImages: PersistedMedia[] = []
    const persistedVideos: PersistedMedia[] = []

    // Persist images
    const imageStorageResults = await Promise.allSettled(
      rawImages.map(async (img, idx) => {
        const subPath = `creatives/${runId}/image-${idx}.jpg`
        const { storagePath, publicUrl } = await persistToStorage(
          img.url,
          brandId,
          'generated-assets',
          subPath,
        )

        const copyVariant = brief.copyVariants[idx] ?? brief.copyVariants[0]
        const nodeId = await createMediaNode(
          brandId,
          'ad_creative',
          `Creative ${idx + 1} — ${campaignGoal.slice(0, 80)}`,
          storagePath,
          'generated-assets',
          img.content_type,
          'creative-generate',
          runId,
          {
            campaign_goal: campaignGoal,
            prompt: imagePrompts[idx]?.prompt,
            copy_headline: copyVariant?.headline,
            copy_body: copyVariant?.body,
            copy_cta: copyVariant?.cta,
            media_url: publicUrl,
          },
        )

        return { ...img, storagePath, publicUrl, nodeId } as PersistedMedia
      }),
    )

    for (const result of imageStorageResults) {
      if (result.status === 'fulfilled') {
        persistedImages.push(result.value)
      }
    }

    // Persist videos
    const videoStorageResults = await Promise.allSettled(
      rawVideos.map(async (vid, idx) => {
        const subPath = `creatives/${runId}/video-${idx}.mp4`
        const { storagePath, publicUrl } = await persistToStorage(
          vid.url,
          brandId,
          'generated-assets',
          subPath,
        )

        const nodeId = await createMediaNode(
          brandId,
          'video_asset',
          `Video ${idx + 1} — ${campaignGoal.slice(0, 80)}`,
          storagePath,
          'generated-assets',
          vid.content_type,
          'creative-generate',
          runId,
          {
            campaign_goal: campaignGoal,
            prompt: videoPrompts[idx]?.prompt,
            media_url: publicUrl,
          },
        )

        return { ...vid, storagePath, publicUrl, nodeId } as PersistedMedia
      }),
    )

    for (const result of videoStorageResults) {
      if (result.status === 'fulfilled') {
        persistedVideos.push(result.value)
      }
    }

    // 8. Score each image+copy combination
    const scores: CreativeScore[] = []
    const scoreResults = await Promise.allSettled(
      persistedImages.map((img, idx) => {
        const copyVariant = brief.copyVariants[idx] ?? brief.copyVariants[0]
        const copyText = copyVariant
          ? `${copyVariant.headline}\n${copyVariant.body}\n${copyVariant.cta}`
          : ''
        return scoreCreative(brandId, { copyText, imageUrl: img.publicUrl }, context)
      }),
    )

    for (const result of scoreResults) {
      if (result.status === 'fulfilled') {
        scores.push(result.value)
      }
    }

    // 9. Return results
    return NextResponse.json({
      images: persistedImages.map((img) => ({
        url: img.publicUrl,
        width: img.width,
        height: img.height,
        content_type: img.content_type,
        nodeId: img.nodeId,
      })),
      videos: persistedVideos.map((vid) => ({
        url: vid.publicUrl,
        width: vid.width,
        height: vid.height,
        content_type: vid.content_type,
        nodeId: vid.nodeId,
      })),
      brief,
      scores,
    })
  } catch (err) {
    console.error('[POST /api/creative/generate] Pipeline error:', err)
    return NextResponse.json(
      { error: 'Creative generation failed', detail: String(err) },
      { status: 500 },
    )
  }
}
