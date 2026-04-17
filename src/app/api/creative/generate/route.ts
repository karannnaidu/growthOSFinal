// ---------------------------------------------------------------------------
// POST /api/creative/generate
//
// Full creative generation pipeline:
//   1. Auth + brand access check
//   2. Gather creative context from knowledge graph
//   3. Generate an intelligent brief (image prompts, video prompts, copy)
//      3a. If briefOnly=true, return the brief for user editing
//   4. Generate 4 image variants via Nano Banana 2 (Imagen 4.0 fallback)
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
  generateVideo,
  createMediaNode,
  type GeneratedMedia,
} from '@/lib/fal-client'
import { generateAdImage } from '@/lib/imagen-client'

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
  const { brandId, campaignGoal, targetPersonas, customPrompt, briefOnly, editedBrief } = body as {
    brandId?: string
    campaignGoal?: string
    targetPersonas?: string
    customPrompt?: string
    briefOnly?: boolean
    editedBrief?: CreativeBrief
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

    // 2.5 Fetch product images from Brand DNA for image-to-image reference
    // (needs to happen before brief generation so product info is available)
    const { data: brandData } = await admin
      .from('brands')
      .select('brand_guidelines, product_context, logo_url')
      .eq('id', brandId)
      .single()

    const products = (brandData?.brand_guidelines as Record<string, unknown>)?.products as Array<{ name: string; image_url?: string; transparent_image_url?: string; bg_approved?: boolean }> ?? brandData?.product_context as Array<{ name: string; image_url?: string }> ?? []
    // Prefer transparent (bg-removed) versions when approved
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
    console.log(`[creative/generate] Product images: ${productImages.length} (${hasTransparent ? 'has transparent' : 'originals only'})`)

    // Resolve the brand's primary logo — prefer logo_variants[primary] in
    // brand_guidelines.visual_identity, fall back to visual_identity.logo_url,
    // then to the top-level brands.logo_url column the onboarding scraper fills.
    const vi = (brandData?.brand_guidelines as Record<string, unknown>)?.visual_identity as {
      logo_url?: string | null
      logo_variants?: Array<{ url: string; variant?: string }>
    } | undefined
    const logoVariants = vi?.logo_variants ?? []
    const primaryLogoUrl =
      logoVariants.find((v) => v.variant === 'primary')?.url
      ?? logoVariants[0]?.url
      ?? vi?.logo_url
      ?? (brandData?.logo_url as string | null | undefined)
      ?? undefined
    console.log(`[creative/generate] Brand logo: ${primaryLogoUrl ? 'present' : 'none'}`)

    // 3. Generate intelligent brief
    console.log(`[creative/generate] Step 3: generating brief via Claude`)
    const brief: CreativeBrief = await generateIntelligentBrief(
      brandId,
      customPrompt ? `${campaignGoal}\n\nAdditional instructions: ${customPrompt}` : campaignGoal,
      targetPersonas || 'general audience',
      context,
    )
    console.log(`[creative/generate] Step 3 done. Image prompts: ${brief.imagePrompts?.length}, Reasoning: ${brief.reasoning?.slice(0, 50)}`)

    if (briefOnly) {
      return NextResponse.json({ brief, briefOnly: true })
    }

    // Use edited brief if provided (two-step flow)
    const activeBrief = editedBrief ?? brief

    // 4. Generate 4 ad images via Nano Banana 2 (or Imagen 4.0 fallback)
    const imagePrompts = activeBrief.imagePrompts.slice(0, 4)
    console.log(`[creative/generate] Step 4: generating ${imagePrompts.length} images via Nano Banana 2`)

    const rawImages: Array<{ base64: string; mimeType: string; width: number; height: number }> = []

    // Extract brand context for image prompts
    const brandCategory = context.brandGuidelines?.positioning || 'professional'
    const brandName = context.brandInfo?.name || 'the brand'
    const brandColors = context.brandGuidelines?.colors

    for (let idx = 0; idx < imagePrompts.length; idx++) {
      const p = imagePrompts[idx]!
      const copyVariant = activeBrief.copyVariants[idx] ?? activeBrief.copyVariants[0]
      const productImageUrl = productImages.length > 0 ? productImages[idx % productImages.length] : undefined

      const adPrompt = [
        `Create a professional ${brandCategory} social media ad for ${brandName}.`,
        `Scene: ${copyVariant?.sceneDescription || p.prompt}`,
        productImageUrl
          ? `Keep the product EXACTLY as shown in the first reference image. Do not modify labels or branding.`
          : `Show a relevant ${brandCategory} visual that represents ${brandName}.`,
        primaryLogoUrl
          ? `A brand logo is provided as ${productImageUrl ? 'the second' : 'a'} reference image. Render it cleanly in a corner (top-left or bottom-right) at a reasonable size — preserve its exact colors and letterforms; do not redraw or stylize it.`
          : '',
        `Text overlay on the image:`,
        copyVariant?.headline ? `- Headline (prominent, top): "${copyVariant.headline}"` : '',
        copyVariant?.cta ? `- CTA button (bottom): "${copyVariant.cta}"` : '',
        copyVariant?.offerText ? `- Offer badge (corner): "${copyVariant.offerText}"` : '',
        brandColors ? `Brand colors: ${JSON.stringify(brandColors)}. Use these as accent colors.` : '',
        `Style: Professional commercial photography, high production value, clean layout, ${brandCategory} aesthetic, social media ad format.`,
      ].filter(Boolean).join('\n')

      try {
        const result = await generateAdImage({
          prompt: adPrompt,
          referenceImageUrl: productImageUrl,
          additionalReferenceUrls: primaryLogoUrl ? [primaryLogoUrl] : undefined,
          width: 1024,
          height: 1024,
        })
        if (result) rawImages.push(result)
      } catch (err) {
        console.warn(`[creative/generate] Image ${idx} failed:`, err)
      }
    }

    console.log(`[creative/generate] Step 4 done. Generated ${rawImages.length} images`)

    // 5. Generate 2 video variants (non-fatal — skip entirely if no FAL_AI_KEY)
    const rawVideos: GeneratedMedia[] = []
    const videoPrompts = activeBrief.videoPrompts.slice(0, 2)
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

    // 6. Persist to Supabase Storage + create knowledge nodes
    const persistedImages: PersistedMedia[] = []

    const imageStorageResults = await Promise.allSettled(
      rawImages.map(async (img, idx) => {
        const ext = img.mimeType.includes('png') ? 'png' : 'jpg'
        const subPath = `creatives/${runId}/image-${idx}.${ext}`
        const storagePath = `${brandId}/${subPath}`

        const buffer = Buffer.from(img.base64, 'base64')
        const { error: uploadErr } = await admin.storage
          .from('generated-assets')
          .upload(storagePath, buffer, { contentType: img.mimeType, upsert: true })

        if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

        const { data: urlData } = admin.storage.from('generated-assets').getPublicUrl(storagePath)
        const publicUrl = urlData?.publicUrl ?? ''

        console.log(`[creative/generate] Step 6: persisted image ${idx} to ${storagePath}`)
        const copyVariant = activeBrief.copyVariants[idx] ?? activeBrief.copyVariants[0]
        const nodeId = await createMediaNode(
          brandId,
          'ad_creative',
          `Creative ${idx + 1} — ${campaignGoal.slice(0, 60)} · ${runId.slice(-8)}`,
          storagePath,
          'generated-assets',
          img.mimeType,
          'creative-generate',
          runId,
          {
            campaign_goal: campaignGoal,
            prompt: imagePrompts[idx]?.prompt,
            copy_headline: copyVariant?.headline,
            copy_body: copyVariant?.body,
            copy_cta: copyVariant?.cta,
            offer_text: copyVariant?.offerText,
            media_url: publicUrl,
          },
        )

        return { url: publicUrl, width: img.width, height: img.height, content_type: img.mimeType, storagePath, publicUrl, nodeId } as PersistedMedia
      }),
    )

    for (const result of imageStorageResults) {
      if (result.status === 'fulfilled') {
        persistedImages.push(result.value)
      }
    }

    // Persist videos
    const persistedVideos: PersistedMedia[] = []
    const videoStorageResults = await Promise.allSettled(
      rawVideos.map(async (vid, idx) => {
        const subPath = `creatives/${runId}/video-${idx}.mp4`
        const { persistToStorage } = await import('@/lib/fal-client')
        const { storagePath, publicUrl } = await persistToStorage(
          vid.url,
          brandId,
          'generated-assets',
          subPath,
        )

        const nodeId = await createMediaNode(
          brandId,
          'video_asset',
          `Video ${idx + 1} — ${campaignGoal.slice(0, 60)} · ${runId.slice(-8)}`,
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
        const copyVariant = activeBrief.copyVariants[idx] ?? activeBrief.copyVariants[0]
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
      brief: activeBrief,
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
