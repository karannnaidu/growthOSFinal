import type { PostRunContext } from '@/lib/post-run';

export async function postRun(ctx: PostRunContext): Promise<void> {
  const { brandId, runId, output } = ctx;
  const { generateAdImage } = await import('@/lib/imagen-client');
  const { createMediaNode } = await import('@/lib/fal-client');

  const briefs = Array.isArray(output.briefs)
    ? (output.briefs as Record<string, unknown>[])
    : [output];

  for (const briefRaw of briefs.slice(0, 4)) {
    const brief = briefRaw as Record<string, unknown>;
    const prompt = (brief.prompt || brief.description || JSON.stringify(brief)) as string;
    const referenceImageUrl = (brief.reference_image_url || brief.product_image_url) as string | undefined;
    const img = await generateAdImage({
      prompt,
      referenceImageUrl,
      width: (brief.width as number | undefined) ?? 1024,
      height: (brief.height as number | undefined) ?? 1024,
    });
    if (!img) continue;

    const ext = img.mimeType.includes('png') ? 'png' : 'jpg';
    const storagePath = `${brandId}/ad-creatives/${runId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const buffer = Buffer.from(img.base64, 'base64');
    const { error: uploadErr } = await ctx.supabase.storage
      .from('generated-assets')
      .upload(storagePath, buffer, { contentType: img.mimeType, upsert: true });
    if (uploadErr) {
      console.warn('[image-brief.postRun] upload failed:', uploadErr.message);
      continue;
    }

    await createMediaNode(
      brandId,
      'ad_creative',
      (brief.name as string | undefined) || `Creative from image-brief · ${runId.slice(-8)}`,
      storagePath,
      'generated-assets',
      img.mimeType,
      'image-brief',
      runId,
      { prompt, dimensions: `${img.width}x${img.height}` },
    );
  }
}
