import { callModel } from '../src/lib/model-client'

const SYSTEM = `You extract durable facts a marketing AI assistant should remember about a brand across sessions.

Output JSON only, no markdown. Shape:
{ "memories": [ { "kind": "preference" | "decision" | "context_fact" | "avoid", "content": "<=200 chars", "confidence": 0.0-1.0 } ] }

Rules: preference / decision / context_fact / avoid as per spec. Skip ephemera.`

async function main() {
  const userMessage = "I hate when you run health-check every day. Also we don't care about acquisition this quarter — focus on retention."
  const assistantMessage = "Got it — I'll hold health-check and skew toward retention skills."

  const result = await callModel({
    model: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    systemPrompt: SYSTEM,
    userPrompt: `## User turn\n${userMessage}\n\n## Assistant reply\n${assistantMessage}`,
    maxTokens: 384,
    temperature: 0.1,
  })
  console.log('RAW:', result.content)
  const parsed = JSON.parse(result.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())
  console.log('PARSED:', JSON.stringify(parsed, null, 2))
  const kinds = new Set(parsed.memories?.map((m: { kind: string }) => m.kind))
  if (!kinds.has('avoid') || !kinds.has('decision')) {
    console.error('FAIL: expected at least one "avoid" and one "decision" memory')
    process.exit(1)
  }
  console.log('OK')
}

main().catch((e) => { console.error(e); process.exit(1) })
