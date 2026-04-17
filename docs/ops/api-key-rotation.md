# API Key Rotation — Growth OS Platform Keys

Growth OS owns all AI-provider API keys. Brands never supply keys. Rotation cadence: every 90 days, or immediately on suspected leak.

## Keys

| Env var | Provider | Used by | Rotation cadence |
|---|---|---|---|
| `OPENAI_API_KEY` | OpenAI | `ai-visibility-probe` (ChatGPT web search) | 90d |
| `PERPLEXITY_API_KEY` | Perplexity | `ai-visibility-probe` | 90d |
| `GOOGLE_AI_KEY` | Google Gemini | `ai-visibility-probe`, entity extraction, Mia LLM | 90d |
| `ANTHROPIC_API_KEY` | Anthropic | `brand-dna-extractor`, `ai-visibility-optimize`, misc | 90d |

## Rotation steps (per key)

1. Create a new key in the provider dashboard.
2. Add as Vercel env var with a temporary name (e.g. `OPENAI_API_KEY_NEW`) in production + preview.
3. Trigger a preview deploy. Smoke-test by running one `ai-visibility-probe` against a test brand.
4. Rename: delete `OPENAI_API_KEY`, rename `OPENAI_API_KEY_NEW` → `OPENAI_API_KEY`. Promote to production.
5. Revoke the old key in the provider dashboard.

## Incident response (suspected leak)

1. Revoke the leaked key in the provider dashboard **first**.
2. Follow rotation steps 1–4 to install a new key.
3. Check provider usage logs for anomalous requests in the last 72h.
4. File a postmortem in `docs/ops/incidents/`.

## Cost monitoring

Each provider has a usage dashboard. Review monthly on the 1st. Threshold alarms (to configure when we have alerting infra):
- OpenAI: > $200/mo
- Perplexity: > $150/mo
- Gemini: > $100/mo
- Anthropic: > $500/mo

## Per-brand cost attribution

Not implemented in v1. Credits charged from the wallet are the proxy. Revisit when >50 brands are active.
