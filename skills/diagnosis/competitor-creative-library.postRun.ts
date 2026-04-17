import type { PostRunContext } from '@/lib/post-run';
import { persistCompetitorCreatives } from './_competitor-creative-persist';

export async function postRun(ctx: PostRunContext): Promise<void> {
  await persistCompetitorCreatives(ctx, 'competitor-creative-library');
}
