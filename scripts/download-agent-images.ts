import * as fs from 'fs'
import * as path from 'path'

const CDN_IMAGES: Record<string, string> = {
  mia: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB0DXbTpMV6mgfo1w0blOv-6Xo1ZrPF1SqSrzCxJLc9GqE247xzr7-vm60C_mgCvYMbbVFrPCE2Uas5iqX83-tHvMlmURs3pBrp8Ir90XDi787shv7n5YT4vC5gFL-dCy5bgdUBrmPcT0_gjEiehDOESMWw3SCmqV7WzjbpyRdBvHiNhPi-pOjKrnvBvX4JmRarjzZu1OQwuT64zh9hf3DG-AypaklOXyRDaTphXMx8SMNwR4NhjxUd7Fp2SamMkhVPfQkC7IXxsbvs',
  scout: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCbtdPgvqfi8DwaCU1x0H79hYaWn1GPPAYE2XyB-JHYUrhtAKo2sgS5OETBjCDpO-SpeJ-wYWiRFRU9MoQEVJRgBnhZNHX14TQulXQ7X1Ckt2FAIAg-wp_CbuwfgftuQ9RcMd2Ufyib6b31bPO0jyDSidjcBWTYQq4A4viVfrn0h_oyw1SrYOxF6-4EslW98OUFOpBXYJBy2QIOBVgX_EQ73Y44D4HJk9bKKb2edbP2YUs628qTlj8Nxz7VlktJhPPLM47oKxj7M8u_',
  aria: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBQY8FdNhz691dK3UE_KX6NNP3N2PFV6sXdCFNcHwJ250WALwo2w_Zec_H2dbY3Jwr93WVLYuOeSF514zXjzdDxJCJrym3Geg2et_pT0WLFbATKm1fX7DCujXDySy-E0AADRuDJb4CToo7eLRC_Z4z7TBZD7pwEuGBZ58OG6VWGP8KXGO1egvCj3DUh3uMDEVn-gh7-iM9gpTvqp5B0_xe0q51RPkAfWsGO0Vsa7XO_4Co0oj9_4MpYXKYL6LyAoT1AcoEelavgi6tI',
  hugo: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCsBlCgQoeMi6D8dLCSiKYHhjRCTXNa2yh7D_ihGq__X0VUzmg_ExCu-w6I9fX8kHaB5881kbjTTA0a0oBzfydq09L7sVBDN7Z4NYNXAvih15-_fC0lYMbYF0GZ8csvRZiel5f7WkrIZizQYOj3ajEBK53EElsAJKddKPH_wlAEWpKJNKlX9jw1q7zEX2w6EyNw6eSKB41OBgdR4Z9V_z-970kHuMLBLeOnFdP6aTPwfnhzyGL1wmnPWeaN3k6oeABK_Gy2jLwJEY54',
  max: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDq9JVxHlKJvJ_h0Rk3MjxJdXaFkVPYBkT6N_Yd0FSEI2WcPRqXGQtIFEK2a2kXHqZpPvW-I58B7JmE9OPz9j9n3tgdQIecZN7UbGK1E-z5PSiL2eJC0Db6GcAZxFuSMfE84F-wZ0NdJWI6VsIGmQD5lw5cBfmhfW5J3cTCblYjFH7Bg_o5p7dTk-ZQp-t6M3KQGNdJuEk1w5sRb7e0xjS1O0XbLINL3XVB6OuKzQiL3uSEY_nOT0aRMxOJMgYVLkJx-VJlNxP3FI',
  penny: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCJE72dYEE-E6hZ1UxNfXMlajBxF3sNHxhN8kW1E2Uf3ULb-4ZKIxJL0TQRF5LCYvBf7g0Vy8b3S_k9OE5FE_B2W1r9y4F4z0PYT2mJI9nEGtJGXhYZX8Qfb9gBmOOdXb3wO4aJ4a_1j_YPSbG06ZCpG0hQHQoF2B6pvjHe8ycPhWKVG7d_1p4F4F7g1z3u3nNnRgwPtMCJdBn2JqZMvr5lw8Yr0_Y2jn7D0R1Bt2IhIwGnTpTVyN5sPwGfWMuP0y5O8MvX1Ug6Bs',
}

const GENERATE_AGENTS = [
  { id: 'luna', description: 'Gentle female AI agent, email and retention specialist, soft curves, caring warm expression, green glow', color: '#10B981' },
  { id: 'sage', description: 'Analytical male AI agent, conversion optimizer, sharp focused features, confident gaze, purple glow', color: '#8B5CF6' },
  { id: 'atlas', description: 'Intelligence female AI agent, audience analyst, observant piercing eyes, data visualization motifs, rose glow', color: '#E11D48' },
  { id: 'echo', description: 'Stealth male AI agent, competitive intelligence spy, mysterious subtle expression, dark tones, slate glow', color: '#64748B' },
  { id: 'nova', description: 'Futuristic female AI agent, search visibility expert, glowing eyes, futuristic visor, violet glow', color: '#7C3AED' },
  { id: 'navi', description: 'Operations guardian male AI agent, protective stance, system monitoring displays, sky blue glow', color: '#0EA5E9' },
]

const outDir = path.join(process.cwd(), 'public', 'agents')

async function downloadImage(url: string, filename: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(path.join(outDir, filename), buffer)
  console.log(`Downloaded: ${filename}`)
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })

  // Download CDN images
  console.log('Downloading CDN images...')
  for (const [agentId, url] of Object.entries(CDN_IMAGES)) {
    try {
      await downloadImage(url, `${agentId}.png`)
    } catch (err) {
      console.error(`Failed to download ${agentId}:`, err)
    }
  }

  // Generate missing agents via fal.ai if key available
  if (process.env.FAL_AI_KEY) {
    console.log('\nGenerating missing agent images via fal.ai...')
    // Dynamic import since fal-client uses @/lib paths
    const { generateAgentPortrait } = await import('../src/lib/fal-client')
    for (const agent of GENERATE_AGENTS) {
      try {
        const result = await generateAgentPortrait(agent.id, agent.description, agent.color)
        await downloadImage(result.url, `${agent.id}.png`)
        console.log(`Generated: ${agent.id}.png`)
      } catch (err) {
        console.error(`Failed to generate ${agent.id}:`, err)
      }
    }
  } else {
    console.log('\nFAL_AI_KEY not set — skipping generation for: luna, sage, atlas, echo, nova, navi')
    console.log('Run again with FAL_AI_KEY to generate missing agent images')
  }

  console.log('\nDone!')
}

main().catch(console.error)
