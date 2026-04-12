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
  } = options;

  const apiKey = await getFalKey(brandId);

  const body: Record<string, unknown> = {
    prompt,
    image_size: { width, height },
    num_images,
  };

  if (negativePrompt) body.negative_prompt = negativePrompt;
  if (seed !== undefined) body.seed = seed;

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
    url: videoUrl,
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

  // Generate embedding so the node is immediately searchable via RAG
  let embedding: number[] | null = null;
  try {
    const textForEmbedding = `${name}. ${nodeType}. ${JSON.stringify(nodeProperties)}`;
    embedding = await embedText(textForEmbedding);
  } catch (err) {
    console.warn(`[fal-client] Embedding generation failed for media node "${name}":`, err);
    // Continue with null embedding — backfill job will catch it
  }

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
      source_run_id: sourceRunId,
      embedding,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !inserted?.id) {
    throw new Error(`Failed to insert media knowledge node: ${error?.message ?? 'no id returned'}`);
  }

  return inserted.id as string;
}
