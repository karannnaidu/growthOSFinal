// scripts/backfill-embeddings.ts
// Run: npx tsx scripts/backfill-embeddings.ts

import { createClient } from '@supabase/supabase-js'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const aiKey = process.env.GOOGLE_AI_KEY
  if (!url || !key || !aiKey) {
    console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_AI_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  const { data: nodes, error } = await supabase
    .from('knowledge_nodes')
    .select('id, name, summary, properties')
    .is('embedding', null)
    .limit(100)

  if (error || !nodes?.length) {
    console.log(error ? `Error: ${error.message}` : 'No nodes to backfill')
    return
  }

  console.log(`Backfilling ${nodes.length} nodes...`)
  let success = 0

  for (const node of nodes) {
    const text = `${node.name}. ${node.summary || ''}. ${JSON.stringify(node.properties || {})}`
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${aiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text }] },
          }),
        }
      )
      const data = await res.json()
      const embedding = data?.embedding?.values
      if (embedding) {
        await supabase.from('knowledge_nodes').update({ embedding }).eq('id', node.id)
        success++
        console.log(`  [${success}/${nodes.length}] ${node.name}`)
      }
    } catch (err) {
      console.warn(`  Failed: ${node.name}`, err)
    }
    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`Done: ${success}/${nodes.length} embeddings generated`)
}

main().catch(console.error)
