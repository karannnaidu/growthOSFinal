import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillDefinition {
  id: string;
  name: string;
  agent: string;
  category: string;
  complexity: 'free' | 'cheap' | 'mid' | 'premium';
  credits: number;
  mcpTools: string[];
  chainsTo: string[];
  schedule?: string;
  knowledge?: {
    needs: string[];
    semanticQuery?: string;
    traverseDepth?: number;
    includeAgencyPatterns?: boolean;
  };
  produces?: Array<{
    nodeType: string;
    edgeTo?: string;
    edgeType?: string;
  }>;
  sections: {
    systemPrompt: string;
    whenToRun?: string;
    inputsRequired?: string;
    workflow?: string;
    outputFormat?: string;
    autoChain?: string;
  };
  rawMarkdown: string;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const skillCache = new Map<string, SkillDefinition>();
let allSkillsLoaded = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SKILLS_DIR = path.join(process.cwd(), 'skills');

/**
 * Walk the skills directory tree and return every `.md` file path.
 */
function walkSkillFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // skip _foundation or other special dirs if needed
      results.push(...walkSkillFiles(full));
    } else if (entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Extract named sections from the markdown body.
 * Sections start with `## Section Name` headings.
 */
function parseSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const regex = /^## (.+)$/gm;
  let match: RegExpExecArray | null;
  const headings: { name: string; start: number }[] = [];

  while ((match = regex.exec(body)) !== null) {
    headings.push({ name: match[1]!.trim(), start: match.index + match[0].length });
  }

  for (let i = 0; i < headings.length; i++) {
    const current = headings[i]!;
    const next = headings[i + 1];
    const end = next ? body.lastIndexOf('\n## ', next.start) : body.length;
    sections[current.name] = body.slice(current.start, end).trim();
  }

  return sections;
}

/**
 * Normalise a heading string into a camelCase key.
 * "System Prompt" -> "systemPrompt", "When to Run" -> "whenToRun"
 */
function headingToKey(heading: string): string {
  return heading
    .split(/\s+/)
    .map((w, i) =>
      i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Parse a single markdown string into a SkillDefinition
// ---------------------------------------------------------------------------

export function parseSkillMarkdown(raw: string): SkillDefinition {
  const { data, content } = matter(raw);

  const sections = parseSections(content);
  const mapped: Record<string, string> = {};
  for (const [heading, text] of Object.entries(sections)) {
    mapped[headingToKey(heading)] = text;
  }

  return {
    id: data.id ?? '',
    name: data.name ?? '',
    agent: data.agent ?? '',
    category: data.category ?? '',
    complexity: data.complexity ?? 'cheap',
    credits: data.credits ?? 1,
    mcpTools: data.mcp_tools ?? [],
    chainsTo: data.chains_to ?? [],
    schedule: data.schedule,
    knowledge: data.knowledge
      ? {
          needs: data.knowledge.needs ?? [],
          semanticQuery: data.knowledge.semantic_query,
          traverseDepth: data.knowledge.traverse_depth,
          includeAgencyPatterns: data.knowledge.include_agency_patterns,
        }
      : undefined,
    produces: Array.isArray(data.produces)
      ? data.produces.map((p: Record<string, unknown>) => ({
          nodeType: (p.node_type as string) ?? '',
          edgeTo: p.edge_to as string | undefined,
          edgeType: p.edge_type as string | undefined,
        }))
      : undefined,
    sections: {
      systemPrompt: mapped['systemPrompt'] ?? '',
      whenToRun: mapped['whenToRun'],
      inputsRequired: mapped['inputsRequired'],
      workflow: mapped['workflow'],
      outputFormat: mapped['outputFormat'],
      autoChain: mapped['autoChain'],
    },
    rawMarkdown: raw,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the filesystem path for a built-in skill by its id.
 * Skills live in `skills/<category>/<id>.md`. Since the id alone doesn't
 * encode the category, we search the directory tree.
 */
export function getSkillPath(skillId: string): string | null {
  const files = walkSkillFiles(SKILLS_DIR);
  for (const f of files) {
    const basename = path.basename(f, '.md');
    if (basename === skillId) return f;
  }
  return null;
}

/**
 * Load a single skill by id. Checks the in-memory cache first, then the
 * filesystem, then falls back to the `custom_skills` table in Supabase.
 */
export async function loadSkill(skillId: string): Promise<SkillDefinition> {
  // 1. Cache hit
  const cached = skillCache.get(skillId);
  if (cached) return cached;

  // 2. Filesystem
  const filePath = getSkillPath(skillId);
  if (filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const skill = parseSkillMarkdown(raw);
    skillCache.set(skill.id, skill);
    return skill;
  }

  // 3. Database (custom skills)
  // Lazy-import the server client to avoid pulling in Next.js cookie APIs
  // when this module is loaded at the top level during builds.
  const { createServiceClient } = await import('@/lib/supabase/service');
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('custom_skills')
    .select('markdown')
    .eq('skill_id', skillId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    throw new Error(`Skill "${skillId}" not found on disk or in database`);
  }

  const skill = parseSkillMarkdown(data.markdown);
  skillCache.set(skill.id, skill);
  return skill;
}

/**
 * Load every built-in skill from the filesystem and return the full map.
 * Results are cached — subsequent calls return the same map.
 */
export async function loadAllSkills(): Promise<Map<string, SkillDefinition>> {
  if (allSkillsLoaded) return skillCache;

  const files = walkSkillFiles(SKILLS_DIR);
  for (const f of files) {
    const raw = fs.readFileSync(f, 'utf-8');
    try {
      const skill = parseSkillMarkdown(raw);
      if (skill.id) {
        skillCache.set(skill.id, skill);
      }
    } catch {
      // Skip files that fail to parse (e.g. README.md in the skills dir)
    }
  }
  allSkillsLoaded = true;
  return skillCache;
}

/**
 * Clear the in-memory cache. Useful for tests or hot-reload scenarios.
 */
export function clearSkillCache(): void {
  skillCache.clear();
  allSkillsLoaded = false;
}
