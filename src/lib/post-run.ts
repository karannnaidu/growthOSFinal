import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { getSkillPath } from '@/lib/skill-loader';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PostRunContext {
  brandId: string;
  skillId: string;
  runId: string;
  /** Skill's LLM output, already JSON-parsed. Treat as unknown and narrow inside. */
  output: Record<string, unknown>;
  /** Service-role client — bypasses RLS. Use only for writes owned by this skill. */
  supabase: SupabaseClient;
  /** Resolved live data from MCP tool calls, same shape as `liveData` in skills-engine. */
  liveData: Record<string, unknown>;
}

export type PostRunFn = (ctx: PostRunContext) => Promise<void>;

// Resolved once per skillId. `null` means we've checked and no .postRun.ts exists.
const postRunCache = new Map<string, PostRunFn | null>();

export async function loadPostRun(skillId: string): Promise<PostRunFn | null> {
  if (postRunCache.has(skillId)) return postRunCache.get(skillId)!;

  const mdPath = getSkillPath(skillId);
  if (!mdPath) {
    postRunCache.set(skillId, null);
    return null;
  }

  // Co-located convention: foo.md -> foo.postRun.ts
  const tsPath = mdPath.replace(/\.md$/, '.postRun.ts');
  if (!fs.existsSync(tsPath)) {
    postRunCache.set(skillId, null);
    return null;
  }

  // Dynamic import — convert to file:// URL so Windows absolute paths work
  // under the ESM loader (bare `c:\...` paths are rejected).
  const mod = await import(/* @vite-ignore */ pathToFileURL(path.resolve(tsPath)).href);
  const fn = (mod.postRun ?? mod.default) as PostRunFn | undefined;
  if (typeof fn !== 'function') {
    console.warn(`[post-run] ${tsPath} loaded but has no exported postRun function`);
    postRunCache.set(skillId, null);
    return null;
  }

  postRunCache.set(skillId, fn);
  return fn;
}

export function clearPostRunCache(): void {
  postRunCache.clear();
}
