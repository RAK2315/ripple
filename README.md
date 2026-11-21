# RIPPLE

**See where your money is going, and where it ends up.**

A personal finance coach with a living money model, built for the Product Space Agentic AI Hackathon (PS04), 21 Nov 2026.

RIPPLE is a money twin for Indian users. Paste your bank SMS alerts, drop a CSV, PDF or UPI screenshot, and it:

- **learns rules from your corrections** and shows every rule it has learned in a Rulebook you can edit,
- **branches your future** into named scenarios you can compare side by side,
- **shows what ignoring advice has cost you** with a ghost balance line (the Regret Engine),
- tells you your **invisible salary**: how much of your income is spent before it arrives.

No rupee figure in RIPPLE is produced by a language model. Projections, balances, goal dates and totals are arithmetic. The model categorizes, extracts and explains. RIPPLE does not recommend securities, funds or insurance products.

## Run

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY (optional: app falls back to heuristics without it)
npm run dev                  # http://localhost:3000
```

Regenerate demo data: `node scripts/generate-fixture.mjs`. Tests: `npm test`.

## Repo

- `PRAVAH_SPEC.md` product spec (PRAVAH was the working name)
- `CONTRACT.md`, `contract/` frozen ingestion interface + fixture
- `kirti/` ingestion module (CSV, SMS parsers, synthetic generator)
- `src/` the app (Next.js, Recharts, Zustand, Vercel AI SDK + Claude)
