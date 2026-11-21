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
cp .env.example .env.local   # add GROQ_API_KEY (free tier; optional: every AI path falls back to heuristics without it)
npm run dev                  # http://localhost:3000
```

Regenerate demo data: `node scripts/generate-fixture.mjs`. Tests: `npm test`. Browser walkthrough of the whole demo path (screenshots + console errors): `node scripts/walk.mjs <outdir>` (`REC=<dir>` also records a video).

Demo inputs: `public/demo/sms-dump.txt` (361 bank SMS), `public/demo/statement.csv`, `public/demo/statement-oct.pdf`. `?demo=1` on any URL loads the demo profile.

## Screens

Flow (invisible salary, Sankey, cone + scrubber) · Import (SMS / CSV / PDF / UPI) · Review (correction → learned rule) · Rulebook · Scenarios (natural language → editable assumptions → diff) · Ghost (Regret Engine) · Subscriptions & alerts (graveyard, price changes, shifts, nudges) · Goals & Profile · Monthly Review (printable) · Ask RIPPLE (coach with guardrails) · What the AI sees (masked payload log).

## How the AI is fenced in

- The model (Groq free tier: `openai/gpt-oss-120b`, `gpt-oss-20b`) categorizes unknown merchants, proposes rules, reads "what if" sentences, extracts PDF rows and writes prose.
- Its prose uses `{placeholders}` that our code fills with computed figures; any digit the model writes itself is rejected and a template is used.
- Guesses about a merchant never confirmed by the user stay in Review until you accept or fix one; the fix becomes a rule.
- Account numbers, phones and person names are masked before every call; the exact payloads are listed under "What the AI sees".

## Repo

- `PRAVAH_SPEC.md` product spec (PRAVAH was the working name)
- `CONTRACT.md`, `contract/` frozen ingestion interface + fixture
- `kirti/` ingestion module (CSV, SMS parsers, synthetic generator)
- `src/` the app (Next.js, Recharts, Zustand, Vercel AI SDK + Groq)
