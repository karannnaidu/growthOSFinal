# Mia picker fixtures

Replay captured (or crafted) planner outputs against `parsePlannerOutput`
to prevent regression in the parser's guardrails.

Run:
```
npx tsx scripts/test-mia-picker.ts
```

Each fixture is a JSON file with:
- `name` — human label for the case
- `catalogSkillIds` — skill ids that should be considered valid
- `raw` — the string the model returned (may be fenced, malformed, etc.)
- `expect` — assertions over the parsed `PlannerOutput`

A fixture is a regression, not a spec: add one whenever the parser is
changed or a bug is fixed.
