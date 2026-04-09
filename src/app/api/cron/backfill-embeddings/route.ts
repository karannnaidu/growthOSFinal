import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { embedText } = await import('@/lib/knowledge/rag')

  const { data: nodes } = await supabase
    .from('knowledge_nodes')
    .select('id, name, summary, properties')
    .is('embedding', null)
    .limit(50)

  if (!nodes?.length) {
    return NextResponse.json({ message: 'No nodes to backfill', count: 0 })
  }

  let success = 0
  for (const node of nodes) {
    try {
      const text = `${node.name}. ${node.summary || ''}. ${JSON.stringify(node.properties || {})}`
      const embedding = await embedText(text)
      await supabase.from('knowledge_nodes').update({ embedding }).eq('id', node.id)
      success++
    } catch { /* skip */ }
  }

  return NextResponse.json({ message: `Backfilled ${success}/${nodes.length}`, count: success })
}
