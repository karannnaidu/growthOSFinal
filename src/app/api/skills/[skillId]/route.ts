import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadSkill, type SkillDefinition } from '@/lib/skill-loader'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SkillDefinitionPublic = Omit<SkillDefinition, 'rawMarkdown'>

interface SkillResponse {
  success: boolean
  data?: SkillDefinitionPublic
  error?: { code: string; message: string }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResponse(code: string, message: string, status: number): NextResponse<SkillResponse> {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

// ---------------------------------------------------------------------------
// GET /api/skills/[skillId]
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ skillId: string }> },
): Promise<NextResponse<SkillResponse>> {
  // 1. Verify auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401)

  // 2. Get skillId from route params
  const { skillId } = await params

  if (!skillId) {
    return errorResponse('VALIDATION_ERROR', 'skillId is required', 400)
  }

  // 3. Load skill via skill-loader
  let skill: SkillDefinition
  try {
    skill = await loadSkill(skillId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not found')) {
      return errorResponse('NOT_FOUND', `Skill "${skillId}" not found`, 404)
    }
    return errorResponse('INTERNAL_ERROR', msg, 500)
  }

  // 4. Return skill definition without rawMarkdown
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rawMarkdown: _, ...skillPublic } = skill

  return NextResponse.json({ success: true, data: skillPublic })
}
