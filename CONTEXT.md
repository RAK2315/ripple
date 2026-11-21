# RIPPLE — Context for any agent joining cold

**RIPPLE: see where your money is going, and where it ends up.**

(The product spec file is `PRAVAH_SPEC.md`; PRAVAH was the working name. RIPPLE is the product name everywhere else. Read the spec as if every "PRAVAH" says "RIPPLE".)

## What it is

Product Space Agentic AI Hackathon, **PS04: personal finance coach with a living money model**. Submission closes **21 Nov 2026, 11:59 PM IST**. Build freeze 22:30 IST; the last 90 minutes are demo video and writeup.

RIPPLE is a money twin for an Indian user. It ingests messy bank data (CSV, pasted bank SMS, PDF, UPI screenshots), categorizes it, and keeps a simulation of their financial life running. Three things no budgeting app does:

1. **Learns rules from corrections.** Fix one category → the model proposes a general rule → user confirms → rule re-applies over history ("14 rows changed") → visible, editable in the Rulebook.
2. **Branches the future.** Named scenarios with parents ("rent +6000", "cut dining by a third"), typed in natural language, compared side by side in a diff view.
3. **Regret Engine.** A ghost balance line for the version of you that took past advice. The gap is a real rupee number.

Plus: the **invisible salary** (fixed + subscriptions ÷ income, shown large), an **uncertainty cone** (3 runs: avg, avg ± 1σ), **provenance** (click any number → the rows behind it), and per the addendum: a **goal-impact lens** on every transaction and nudge ("this ₹2,400 pushes your laptop goal back 3 days" = amount ÷ monthly surplus × 30), **income/fixed-cost shift detection** with one-tap re-plan, and a **privacy pipeline** (mask account numbers, names, phones before every model call; "what the AI sees" panel).

Two agentic surfaces sit on top: an **investigation agent** (Investigate in the sidebar: the model plans up to five tool calls over the engine, including `create_goal` for "I want X in N months" questions, each step streamed with its finding and rows, ending in one approvable action that cites the step it came from) and **plain-language bulk rules** on Review ("put all entries of Maheshwari Mart and Pintu Kumar as stationery" → one rule per merchant, user-defined categories created on confirm, previewed with match counts).

**Hard rule: no rupee figure is ever produced by a language model.** Projections, goal dates, balances, totals, rule matching, recurring detection are arithmetic in `src/lib/engine/`. The model categorizes, normalizes merchants, proposes rules, explains changes, extracts scenarios from text, writes narrative around computed numbers (as `{placeholders}` our code fills), and transcribes PDF statement rows. Nothing else.

## Stack (locked, not revisited)

**Next.js 16 (App Router, TypeScript) + Tailwind v4 + Recharts 3 + Zustand (persist → localStorage) + Vercel AI SDK 7 with Groq free tier (`openai/gpt-oss-120b` for rules/scenarios/narrative/coach, `openai/gpt-oss-20b` for batch categorization; no vision model on the key, so image/scanned-PDF paths fall back to "try SMS/CSV") + unpdf for PDF text, deployed on Vercel.**

Justification: one TypeScript codebase serves UI and the server routes that hold the API key, runs with `npm run dev`, and deploys to a public URL with `vercel --prod` in about two minutes. Recharts 3 ships a `Sankey` component (verified in `node_modules/recharts/types/index.d.ts`), `Area` with `[low, high]` range values for the uncertainty band, and `Brush`/`ReferenceLine` for the timeline scrubber, so no second charting library. AI SDK's structured output (zod schemas) covers categorization, rule proposals and scenario extraction, and text-layer PDFs go through the text model. Zustand `persist` gives refresh-safe state with zero infrastructure and no auth, which the spec rules out anyway. Next.js and Tailwind are the conventions an agent moves fastest in. No Python, no database, no Monte Carlo.

## Architecture

```
contract/        frozen interface (types.ts, schema, fixture.json) — imports nothing
kirti/           ingestion brief for the parallel parser workstream (not merged; the app ships its own parsers in src/lib/ingest)
src/
  app/           routes: / (Flow), /import, /review, /rules, /scenarios, /ghost, /subscriptions, /goals, /report
  app/api/       server routes that call the model: categorize, propose-rule, scenario, explain, narrative, vision, sms-fallback, coach, investigate, bulk-rules
  lib/engine/    PURE arithmetic: categorize, merchants, recurring, projection, flows, scenario, nudges, shifts, ghost, review, coach, opportunities, investigate (agent tools + chain), bulk-rules
  lib/ai/        model calls + privacy: protect.ts tokenizes every name in every payload at callApi (derived ids too), mask.ts second layer; meta.ts reports fallback/template use to the sidebar
  lib/store.ts   single Zustand store, persisted
  components/    one component per screen + shared (Money, ProvenanceDrawer, GoalImpact)
scripts/         generate-fixture.mjs (fallback dataset + demo inputs)
public/demo/     statement.csv, sms-dump.txt, statement-oct.pdf, sms-shops.txt (Maheshwari Mart / Pintu Kumar, for the bulk-rule example) — the demo inputs
```

Data flow: input → parser (src/lib/ingest, or the fixture) → `Transaction[]` (contract) → categorize pipeline (rules → starter list → LLM batch) → store → engine functions derive everything else on read (recurring, profile, projection, nudges, ghost). Derived numbers are never stored, only recomputed, so a rule change ripples through every screen.

## Dependency rule

`contract/ ← kirti/ ← src/`. `kirti/` never imports from `src/` or `rehaan/`. `src/` imports only kirti's exported functions, typed by the contract. Contract is frozen; see `CONTRACT.md`.

## Team

- **Rehaan** (Claude Code): `src/`, everything in the app. Plan: `rehaan/PLAN.md`.
- **Kirti** (Antigravity): `kirti/` on branch `kirti/ingestion`, then LinkedIn, demo video, writeup. Brief: `kirti/BRIEF.md`.
