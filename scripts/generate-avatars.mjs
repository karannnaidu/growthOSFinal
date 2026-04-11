// Generate all 12 agent avatar images using fal.ai FLUX Pro
// Usage: node scripts/generate-avatars.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const FAL_AI_KEY = envContent
  .split('\n')
  .find(l => l.startsWith('FAL_AI_KEY='))
  ?.split('=')
  .slice(1)
  .join('=')
  .trim();

if (!FAL_AI_KEY) {
  console.error('FAL_AI_KEY not found in .env.local');
  process.exit(1);
}

const SEED = 424242; // consistent style across all agents

const NEGATIVE_PROMPT = 'cartoon, anime, illustration, flat design, low quality, distorted face, extra limbs, logo, text';

const PROMPTS = {
  mia: `Hyper-realistic 3D rendered portrait of a sharp, authoritative woman in her early 40s, short sleek dark hair pulled back, wearing a structured charcoal blazer with subtle electric blue accent lining, confident direct gaze, slight knowing smile, deep navy blue gradient background with soft radial glow, cinematic portrait lighting, soft rim light, photorealistic skin texture, professional headshot composition, 8K render, Octane render style, corporate futurism aesthetic`,
  scout: `Hyper-realistic 3D rendered portrait of a focused young man in his late 20s, sharp angular features, short neat dark hair, wearing a teal crew-neck top, alert observant expression, slight forward lean posture, dark teal to midnight green gradient background, cinematic studio lighting, subtle analytical energy, photorealistic render, corporate headshot composition, clean professional look, 8K Octane render`,
  aria: `Hyper-realistic 3D rendered portrait of an elegant woman in her early 30s, auburn hair in a sleek updo, wearing a deep burgundy blazer, warm confident expression, subtle smile, expressive eyes, warm crimson to deep rose gradient background, cinematic portrait lighting, soft bokeh background glow, photorealistic skin, professional creative director energy, 8K Octane render, corporate futurism aesthetic`,
  luna: `Hyper-realistic 3D rendered portrait of a warm empathetic woman in her early 30s, dark hair with subtle highlights, wearing a soft indigo-purple blazer, gentle genuine smile, soft eyes, approachable energy, deep violet to midnight blue gradient background with soft lunar glow, warm diffused rim lighting, photorealistic skin texture, 8K Octane render, trustworthy and human feel`,
  hugo: `Hyper-realistic 3D rendered portrait of a creative young man in his late 20s, tousled light brown hair, wearing a teal-green casual blazer, curious playful smile, bright expressive eyes, creative energy, warm teal to light aqua gradient background, soft bright studio lighting, photorealistic 8K Octane render, friendly approachable creative professional`,
  sage: `Hyper-realistic 3D rendered portrait of a calm thoughtful woman in her mid 30s, natural brown hair loosely tied, wearing a forest green blazer with cream shirt, wise gentle expression, warm eyes, slight upward gaze, deep emerald to sage green gradient background with soft organic texture, warm natural studio lighting, photorealistic render, grounded intellectual energy, 8K Octane render, corporate wellness aesthetic`,
  max: `Hyper-realistic 3D rendered portrait of a confident man in his early 30s, strong jaw, close-cropped hair, wearing a dark navy performance jacket, determined competitive expression, slight smirk, deep blue to electric indigo gradient background, dramatic side lighting, high contrast shadows, athletic energy meets corporate polish, photorealistic 8K Octane render, cinematic headshot`,
  atlas: `Hyper-realistic 3D rendered portrait of a composed strategic man in his mid 40s, salt-and-pepper short hair, strong features, wearing a deep charcoal suit jacket, steady confident expression, direct authoritative gaze, dark graphite to deep blue gradient background, dramatic cinematic lighting, strong shadow contrast, senior executive energy, photorealistic 8K Octane render`,
  echo: `Hyper-realistic 3D rendered portrait of a precise analytical woman in her late 20s, sleek dark hair parted center, wearing a silver-grey structured top, focused neutral expression, slight head tilt, calculating eyes, cool silver to steel blue gradient background with subtle data-grid overlay, clean diffused studio lighting, photorealistic 8K Octane render, corporate tech aesthetic, clean and minimal`,
  nova: `Hyper-realistic 3D rendered portrait of a dynamic energetic woman in her early 30s, dark hair with sharp styling, wearing a deep red-orange power blazer, bold determined expression, forward energy, deep orange to burnt sienna gradient background with subtle radial burst, dramatic cinematic lighting with warm accent, photorealistic 8K Octane render, high-energy campaign commander aesthetic`,
  navi: `Hyper-realistic 3D rendered portrait of a friendly helpful woman in her late 20s, light brown hair in a neat bun, wearing a bright cobalt blue top, open warm smile, welcoming bright eyes, electric blue to cerulean gradient background, bright even studio lighting, positive approachable energy, photorealistic 8K Octane render, clean corporate headshot style`,
  penny: `Hyper-realistic 3D rendered portrait of a sharp precise woman in her early 30s, sleek blonde hair pulled back, wearing a gold-accented dark blazer, composed professional expression, slight confident smile, deep amber to dark gold gradient background, warm cinematic lighting, premium financial advisor energy, photorealistic 8K Octane render, luxury corporate aesthetic`,
};

const publicDir = resolve(__dirname, '..', 'public', 'agents');
mkdirSync(publicDir, { recursive: true });

console.log(`Generating all 12 agent avatars with FLUX Pro...\n`);

for (const [id, prompt] of Object.entries(PROMPTS)) {
  console.log(`→ Generating ${id}...`);

  try {
    const res = await fetch('https://fal.run/fal-ai/flux-pro/v1.1', {
      method: 'POST',
      headers: {
        Authorization: `Key ${FAL_AI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        negative_prompt: NEGATIVE_PROMPT,
        image_size: { width: 512, height: 512 },
        num_images: 1,
        seed: SEED,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`  ✗ Failed (${res.status}): ${err}`);
      continue;
    }

    const data = await res.json();
    const imageUrl = data.images?.[0]?.url || data.image?.url;

    if (!imageUrl) {
      console.error(`  ✗ No image URL returned`);
      continue;
    }

    const imgRes = await fetch(imageUrl);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const outPath = resolve(publicDir, `${id}.png`);
    writeFileSync(outPath, buffer);
    console.log(`  ✓ Saved ${id}.png (${(buffer.length / 1024).toFixed(0)} KB)`);
  } catch (err) {
    console.error(`  ✗ Error: ${err.message}`);
  }
}

console.log('\nDone!');
