import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadAllSkills, type SkillDefinition } from '@/lib/skill-loader'

// ---------------------------------------------------------------------------
// Public shape (omit rawMarkdown for payload size)
// ---------------------------------------------------------------------------

type SkillPublic = Omit<SkillDefinition, 'rawMarkdown'>

interface SkillsResponse {
  success: boolean
  data?: SkillPublic[]
  error?: { code: string; message: string }
}

// ---------------------------------------------------------------------------
// GET /api/skills — returns all built-in skills
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse<SkillsResponse>> {
  // 1. Verify auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 },
    )
  }

  // 2. Load all skills from filesystem
  let skillMap: Map<string, SkillDefinition>
  try {
    skillMap = await loadAllSkills()
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to load skills',
        },
      },
      { status: 500 },
    )
  }

  // 3. Strip rawMarkdown and return as array
  const skills: SkillPublic[] = []
  for (const [, skill] of skillMap) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rawMarkdown: _, ...pub } = skill
    skills.push(pub)
  }

  // Sort alphabetically by name
  skills.sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({ success: true, data: skills })
}
