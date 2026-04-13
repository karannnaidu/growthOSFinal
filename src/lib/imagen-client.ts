// src/lib/imagen-client.ts
//
// Google AI image generation — Nano Banana 2 (primary) + Imagen 4.0 (fallback).
// Replaces fal.ai for creative generation. fal.ai kept for bg removal only.

export interface ImageGenOptions {
  prompt: string
  referenceImageUrl?: string
  width?: number
  height?: number
  numberOfImages?: number
}

export interface GeneratedImage {
  base64: string
  mimeType: string
  width: number
  height: number
}

export async function generateWithNanoBanana(
  options: ImageGenOptions,
): Promise<GeneratedImage[]> {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('GOOGLE_AI_KEY is not set')

  const parts: Array<Record<string, unknown>> = []

  if (options.referenceImageUrl) {
    try {
      const imgRes = await fetch(options.referenceImageUrl, { signal: AbortSignal.timeout(10000) })
      if (imgRes.ok) {
        const buffer = Buffer.from(await imgRes.arrayBuffer())
        const mimeType = imgRes.headers.get('content-type') || 'image/png'
        parts.push({ inlineData: { mimeType, data: buffer.toString('base64') } })
      }
    } catch (err) {
      console.warn('[imagen-client] Failed to fetch reference image:', err)
    }
  }

  parts.push({ text: options.prompt })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    },
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Nano Banana 2 error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> } }>
  }

  const images: GeneratedImage[] = []
  for (const candidate of data.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        images.push({
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/jpeg',
          width: options.width ?? 1024,
          height: options.height ?? 1024,
        })
      }
    }
  }

  return images
}

export async function generateWithImagen(
  options: ImageGenOptions,
  model: 'imagen-4.0-fast-generate-001' | 'imagen-4.0-generate-001' | 'imagen-4.0-ultra-generate-001' = 'imagen-4.0-fast-generate-001',
): Promise<GeneratedImage[]> {
  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) throw new Error('GOOGLE_AI_KEY is not set')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: options.prompt }],
        parameters: { sampleCount: options.numberOfImages ?? 1 },
      }),
    },
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Imagen 4.0 error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as {
    predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>
  }

  return (data.predictions ?? [])
    .filter(p => p.bytesBase64Encoded)
    .map(p => ({
      base64: p.bytesBase64Encoded!,
      mimeType: p.mimeType ?? 'image/png',
      width: options.width ?? 1024,
      height: options.height ?? 1024,
    }))
}

export async function generateAdImage(options: ImageGenOptions): Promise<GeneratedImage | null> {
  try {
    const results = await generateWithNanoBanana(options)
    if (results.length > 0) return results[0]!
  } catch (err) {
    console.warn('[imagen-client] Nano Banana 2 failed, trying Imagen 4.0:', err)
  }

  try {
    const results = await generateWithImagen({
      ...options,
      prompt: options.prompt + ' Professional product photography, premium quality.',
    })
    if (results.length > 0) return results[0]!
  } catch (err) {
    console.warn('[imagen-client] Imagen 4.0 also failed:', err)
  }

  return null
}
