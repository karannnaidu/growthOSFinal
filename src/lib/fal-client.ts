// ---------------------------------------------------------------------------
// fal.ai Client — Task 1.4
//
// Image generation, video generation, Supabase Storage persistence,
// knowledge node creation, and BYOK support.
//
// Server-side only.
// ---------------------------------------------------------------------------

import { embedText } from '@/lib/knowledge/rag';

// ---------------------------------------------------------------------------
// Vision: describe image content for RAG embedding
// ---------------------------------------------------------------------------

/**
 * Use Gemini 2.5 Flash vision to generate a detailed alt-text description
 * of an image. This description is stored alongside the node and embedded
 * so RAG can find "visually similar" creatives.
 *
 * Returns null on failure (non-fatal).
 */
export async function describeImage(imageUrl: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) return null;

  try {
    // Fetch image as base64
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!imgRes.ok) return null;
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mimeType = imgRes.headers.get('content-type') || 'image/png';

    // Call Gemini Vision
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Describe this ad creative image in one paragraph. Include: visual style, composition, dominant colors, subjects/objects, text overlays if any, mood/tone, and ad format. Be specific and factual.' },
              { inlineData: { mimeType, data: base64 } },
            ],
          }],
          generationConfig: { maxOutputTokens: 256, temperature: 0.2 },
        }),
      },
    );

    if (!res.ok) return null;
    const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;       // default 1024
  height?: number;      // default 1024
  model?: string;       // default 'fal-ai/flux/schnell'
  num_images?: number;  // default 1
  seed?: number;
  brandId?: string;     // for BYOK key lookup
  referenceImageUrl?: string;  // product image for img2img
  strength?: number;    // 0-1, how much to deviate from reference (default 0.65)
}

export interface VideoGenerationOptions {
  prompt: string;
  duration?: number;    // default 5
  width?: number;
  height?: number;
  model?: string;       // default 'fal-ai/minimax-video/video-01-live'
  brandId?: string;
}

export interface GeneratedMedia {
  url: string;
  width: number;
  height: number;
  content_type: string;
}

// ---------------------------------------------------------------------------
// Internal: fal.ai API response shapes
// ---------------------------------------------------------------------------

interface FalImage {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

interface FalImageResponse {
  images?: FalImage[];
  image?: FalImage;
}

interface FalVideoResponse {
  video?: {
    url: string;
    width?: number;
    height?: number;
    content_type?: string;
  };
  url?: string;
}

// ---------------------------------------------------------------------------
// getFalKey — BYOK first, fall back to platform env var
// ---------------------------------------------------------------------------

async function getFalKey(brandId?: string): Promise<string> {
  if (brandId) {
    try {
      const { createServiceClient } = await import('@/lib/supabase/service');
      const supabase = createServiceClient();

      const { data: byokRow } = await supabase
        .from('byok_keys')
        .select('vault_secret_id')
        .eq('brand_id', brandId)
        .eq('provider', 'fal')
        .single();

      if (byokRow?.vault_secret_id) {
        // Retrieve the secret value from Supabase Vault
        const { data: secretData } = await supabase.rpc('vault.decrypted_secret', {
          secret_id: byokRow.vault_secret_id,
        });

        const secretValue = secretData as string | null;
        if (secretValue) {
          return secretValue;
        }
      }
    } catch {
      // Non-fatal — fall through to platform key
    }
  }

  const platformKey = process.env.FAL_AI_KEY;
  if (!platformKey) {
    throw new Error(
      'No fal.ai API key found. Set FAL_AI_KEY in environment or configure a BYOK key for this brand.',
    );
  }

  return platformKey;
}

// ---------------------------------------------------------------------------
// generateImage
// ---------------------------------------------------------------------------

export async function generateImage(
  options: ImageGenerationOptions,
): Promise<GeneratedMedia[]> {
  const {
    prompt,
    negativePrompt,
    width = 1024,
    height = 1024,
    model = 'fal-ai/flux/schnell',
    num_images = 1,
    seed,
    brandId,
    referenceImageUrl,
    strength = 0.65,
  } = options;

  const apiKey = await getFalKey(brandId);

  // If reference image provided, use image-to-image (keeps product visible)
  const useImg2Img = !!referenceImageUrl;
  const endpoint = useImg2Img
    ? 'https://fal.run/fal-ai/flux/dev/image-to-image'
    : `https://fal.run/${model}`;

  const body: Record<string, unknown> = {
    prompt,
    image_size: { width, height },
    num_images,
  };

  if (useImg2Img) {
    body.image_url = referenceImageUrl;
    body.strength = strength;
  }
  if (negativePrompt) body.negative_prompt = negativePrompt;
  if (seed !== undefined) body.seed = seed;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`fal.ai image generation error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as FalImageResponse;
  const images = data.images ?? (data.image ? [data.image] : []);

  if (images.length === 0) {
    throw new Error('fal.ai returned no images');
  }

  return images.map((img) => ({
    url: img.url,
    width: img.width ?? width,
    height: img.height ?? height,
    content_type: img.content_type ?? 'image/jpeg',
  }));
}

// ---------------------------------------------------------------------------
// generateVideo
// ---------------------------------------------------------------------------

export async function generateVideo(
  options: VideoGenerationOptions,
): Promise<GeneratedMedia> {
  // Video generation temporarily disabled — coming soon
  console.warn('[fal-client] Video generation is temporarily disabled');
  return [] as any;

  const {
    prompt,
    duration = 5,
    width = 1280,
    height = 720,
    model = 'fal-ai/minimax-video/video-01-live',
    brandId,
  } = options;

  const apiKey = await getFalKey(brandId);

  const body: Record<string, unknown> = {
    prompt,
    duration,
  };

  if (options.width !== undefined) body.width = options.width;
  if (options.height !== undefined) body.height = options.height;

  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`fal.ai video generation error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as FalVideoResponse;

  const videoUrl = data.video?.url ?? data.url;
  if (!videoUrl) {
    throw new Error('fal.ai returned no video URL');
  }

  return {
    url: videoUrl!,
    width: data.video?.width ?? width,
    height: data.video?.height ?? height,
    content_type: data.video?.content_type ?? 'video/mp4',
  };
}

// ---------------------------------------------------------------------------
// generateAgentPortrait
// ---------------------------------------------------------------------------

export async function generateAgentPortrait(
  agentId: string,
  description: string,
  accentColor: string,
): Promise<GeneratedMedia> {
  const prompt = `Futuristic AI agent portrait, ${description}, accent glow color ${accentColor}, dark background, high-tech, professional, cinematic lighting, digital art, 4k quality`;

  const results = await generateImage({
    prompt,
    width: 512,
    height: 512,
    num_images: 1,
    // No brandId — portraits use the platform key
  });

  const portrait = results[0];
  if (!portrait) {
    throw new Error(`generateAgentPortrait: no image returned for agent ${agentId}`);
  }

  return portrait;
}

// ---------------------------------------------------------------------------
// persistToStorage
// ---------------------------------------------------------------------------

export async function persistToStorage(
  mediaUrl: string,
  brandId: string,
  bucket: 'brand-assets' | 'generated-assets' | 'competitor-assets',
  subPath: string,
): Promise<{ storagePath: string; publicUrl: string }> {
  // Download the media
  const downloadRes = await fetch(mediaUrl);
  if (!downloadRes.ok) {
    throw new Error(`Failed to download media from ${mediaUrl}: ${downloadRes.status}`);
  }

  const buffer = Buffer.from(await downloadRes.arrayBuffer());
  const contentType =
    downloadRes.headers.get('content-type') ?? 'application/octet-stream';

  // Build a deterministic storage path scoped to the brand
  const storagePath = `${brandId}/${subPath}`;

  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = createServiceClient();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  const publicUrl = urlData?.publicUrl ?? '';

  return { storagePath, publicUrl };
}

// ---------------------------------------------------------------------------
// createMediaNode
// ---------------------------------------------------------------------------

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
  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = createServiceClient();

  const nodeProperties: Record<string, any> = {
    storage_path: storagePath,
    bucket,
    media_type: mediaType,
    ...properties,
  };

  // Note: Vision description (describeImage) is NOT called here to keep
  // creative generation fast. It's done by the backfill-embeddings cron later.
  // The cron finds nodes without visual_description and enriches them.

  // Generate embedding from name + prompt + copy (visual_description added later by cron)
  let embedding: number[] | null = null;
  try {
    const textForEmbedding = [
      name,
      nodeType,
      properties?.prompt || '',
      properties?.copy_headline || '',
    ].filter(Boolean).join('. ');
    embedding = await embedText(textForEmbedding);
  } catch (err) {
    console.warn(`[fal-client] Embedding generation failed for media node "${name}":`, err);
  }

  // source_run_id must be a valid UUID (FK to skill_runs) or null
  const isValidUUID = sourceRunId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceRunId);

  const { data: inserted, error } = await supabase
    .from('knowledge_nodes')
    .insert({
      brand_id: brandId,
      node_type: nodeType,
      name: name.slice(0, 255),
      summary: `${nodeType} stored at ${storagePath}`,
      properties: nodeProperties,
      confidence: 1.0,
      source_skill: sourceSkill,
      source_run_id: isValidUUID ? sourceRunId : null,
      embedding,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !inserted?.id) {
    console.error(`[fal-client] createMediaNode insert failed:`, error?.message);
    // Don't throw — return empty string so pipeline continues
    return '';
  }

  return inserted.id as string;
}
