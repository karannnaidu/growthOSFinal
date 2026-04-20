#!/usr/bin/env node
// One-off: generate ecommerce ad placeholder images for the landing hero surfaces
// via fal.ai flux/schnell, save under public/landing/.
//
// Run: node scripts/generate-landing-placeholders.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const outDir = resolve(root, 'public/landing')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

// Load FAL_AI_KEY from .env.local
const envPath = resolve(root, '.env.local')
const envText = readFileSync(envPath, 'utf8')
const falKey = envText.split(/\r?\n/).find((l) => l.startsWith('FAL_AI_KEY='))?.split('=')[1]?.trim()
if (!falKey) {
  console.error('FAL_AI_KEY not found in .env.local')
  process.exit(1)
}

const jobs = [
  {
    id: 'aria-ad-1.jpg',
    size: { width: 512, height: 512 },
    prompt:
      'High-end ecommerce product ad creative, minimalist luxury skincare serum bottle on soft beige cream backdrop, warm natural light, soft shadow, studio photography, magazine quality, clean negative space, no text, no words, no logo',
  },
  {
    id: 'aria-ad-2.jpg',
    size: { width: 512, height: 512 },
    prompt:
      'Vibrant ecommerce product ad creative for premium sneakers on terrazzo pedestal, coral pink backdrop, dynamic lighting, bold color block composition, studio photography, commercial ad quality, no text, no words, no logo',
  },
  {
    id: 'echo-ad-1.jpg',
    size: { width: 640, height: 360 },
    prompt:
      'Social media competitor ad screenshot style, athletic apparel lifestyle photo, runner at sunrise on urban rooftop, moody cinematic grading, 16:9 wide composition, no text, no words, no logo',
  },
  {
    id: 'echo-ad-2.jpg',
    size: { width: 640, height: 360 },
    prompt:
      'Modern ecommerce ad composite, ceramic coffee mug with steam on linen napkin, morning light through window, warm earth palette, lifestyle photography, 16:9 wide, no text, no words, no logo',
  },
  {
    id: 'echo-ad-3.jpg',
    size: { width: 640, height: 360 },
    prompt:
      'Beauty brand competitor ad, woman with glowing skin applying moisturizer in soft bathroom light, wellness aesthetic, muted pastel palette, 16:9 wide cinematic framing, no text, no words, no logo',
  },
]

async function generateOne(job) {
  console.log(`[fal] generating ${job.id} ...`)
  const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: job.prompt,
      image_size: job.size,
      num_images: 1,
      num_inference_steps: 4,
      enable_safety_checker: true,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`fal error ${res.status}: ${text}`)
  }
  const data = await res.json()
  const url = data.images?.[0]?.url
  if (!url) throw new Error(`no image url in response: ${JSON.stringify(data).slice(0, 300)}`)
  const dl = await fetch(url)
  if (!dl.ok) throw new Error(`download failed ${dl.status}`)
  const buf = Buffer.from(await dl.arrayBuffer())
  const outPath = resolve(outDir, job.id)
  writeFileSync(outPath, buf)
  console.log(`  -> ${outPath} (${buf.length} bytes)`)
}

for (const job of jobs) {
  await generateOne(job).catch((e) => {
    console.error(`FAIL ${job.id}:`, e.message)
    process.exit(2)
  })
}

console.log('\nAll landing placeholders generated.')
