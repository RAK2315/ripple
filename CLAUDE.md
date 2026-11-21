@AGENTS.md

# RIPPLE — Rules for Claude Code

Read `CONTEXT.md` first. Spec: `PRAVAH_SPEC.md` (PRAVAH = old name, product is RIPPLE). Contract: `CONTRACT.md`. Plan: `rehaan/PLAN.md`.

## Non-negotiables

1. **No rupee figure is ever produced by a language model.** Projections, goal dates, balances, totals, averages, surplus, rule match counts, recurring detection, nudge thresholds, ghost line, goal-impact days: all computed in `src/lib/engine/` by code we wrote. Model output never flows into a number on screen. If a model response contains a number (e.g. scenario extraction "rent +6000"), it is a *parameter the user sees and can edit*, then our arithmetic runs on it. Protects: the core credibility claim of the demo.
2. **Never apply model output silently.** Rule proposals and NL scenarios are shown as editable fields before they take effect. Protects: a slightly wrong structure looking like design rather than a bug.
3. **Every model call goes through `src/lib/ai/` and is masked first** (`mask.ts`: account numbers → `XX1234`, phone numbers → `[PHONE]`, person names → `[NAME]`). The masked payload is logged for the "what the AI sees" panel. Protects: the privacy claim.
4. **Every AI path has a deterministic fallback.** No API key, timeout, or bad JSON → heuristic result, flagged lower confidence. The demo must never hang on a model call. Protects: the live demo.
5. **Contract is frozen.** Do not edit `contract/` or `CONTRACT.md`. If a change is needed, stop and flag it to Rehaan explicitly.
6. **Dependency rule:** `src/` imports from `kirti/` only via `kirti/index.ts` exports. Nothing in `kirti/` imports from `src/`. Do not edit `kirti/` (Kirti owns it) except at integration, with Rehaan's say-so.
7. **Out of scope** (spec §11): bank APIs, login, mobile app, investment/securities advice, payment execution, cancelling subscriptions, bill negotiation, credit score. No Monte Carlo, no Python.

## Conventions

- **Money:** integer paise everywhere in code (`amount: number` paise). Convert to rupees only in the `<Money>` component / `formatINR()` (Indian grouping, `₹1,23,456`). Never floats for stored money.
- **Dates:** `"YYYY-MM-DD"` strings. Month keys `"YYYY-MM"`. "Today" for the app is `APP_TODAY = "2026-11-20"` (end of fixture) from `src/lib/config.ts`, so the demo is stable.
- **Naming:** files kebab-case (`projection.ts`, `flow-screen.tsx`); React components PascalCase; functions camelCase; types PascalCase; contract field names stay snake_case exactly as in `contract/types.ts` (do not rename to camelCase). App-only types live in `src/lib/types.ts`.
- **Layout:** routes in `src/app/<route>/page.tsx` thin, real UI in `src/components/<screen>/`. Pure logic in `src/lib/engine/*.ts` with no React, no fetch, no store imports: input → output. Model calls only in `src/app/api/*/route.ts` calling `src/lib/ai/*`.
- **State:** one Zustand store `src/lib/store.ts`, persisted to localStorage under key `ripple-v1`. Store holds only source data: transactions, rules, profile, fixed costs, goals, scenarios, advice, recurring overrides (user-marked unused), nudge acks, refusal log, AI payload log. Everything derived (recurring list, projection, nudges, ghost, totals) is computed with `useMemo` from engine functions. Never store derived numbers.
- **Errors:** API routes return `{ ok: true, data }` or `{ ok: false, error, fallback? }`, never throw to the client. UI shows a small inline notice, never a blank screen. Engine functions are total: they handle empty arrays and return zeros, not NaN.
- **Provenance:** any displayed computed figure is clickable and opens `ProvenanceDrawer` with the transaction ids behind it. Engine functions that produce a figure also return the ids.
- **Models:** Groq free tier via `@ai-sdk/groq`, only in `src/lib/ai/model.ts`: `openai/gpt-oss-120b` (smart: rules, scenarios, narrative, coach), `openai/gpt-oss-20b` (fast: batch categorization, 40 per call, cached per unique description). No vision model on the key: image calls return null → fallback. Structured output via AI SDK + zod; `maxRetries: 3` backoff covers 429s. Key: `GROQ_API_KEY` in `.env.local` (never committed) and Vercel env.
- **Style:** simple, boring code. No abstraction until needed twice. Tests (vitest) only for `src/lib/engine/*` and parsers. Run `npx tsc --noEmit` and `npx vitest run` before each commit.
- **Commits:** small, per plan block, message `block N: <what>`. Push to `main`. End messages with the Co-Authored-By line.

## Status

Update after each block.

- [x] Setup: contract, fixture, briefs, repo
- [x] Provider: Groq free tier (gpt-oss-120b/20b); model guesses on unconfirmed merchants capped at 0.65 → Review with "Accept" (AI suggests, you confirm once, a rule remembers)
- [x] B1 data core
- [x] B2 projection + Flow (Sankey, cone, scrubber, invisible salary, provenance)
- [x] B3 import (SMS/CSV/PDF/UPI), review + correction loop + rule proposal, rulebook
- [x] B4 scenarios: NL → editable assumptions → run, branch tree with parents, diff vs any scenario, compare line on timeline
- [x] B5 Ghost: regret number (6% savings rate, provenance = payments since advice), ghost line + gap, ghost goal dates, accept; rough demo at ../demo-recordings/rough-demo-b5.webm (`REC=<dir> node scripts/walk.mjs`)
- [x] B6 /subscriptions: graveyard (yearly total, mark unused), changed/new alerts + /api/explain (digit-guarded, template fallback), shifts.ts + Re-plan, nudges (≥2 rows, ≥₹2k drift), goal-impact on review rows, nudges, recurring table, provenance drawer
- [x] B7 /goals editor (income override, balance, emergency fund, manual fixed costs, goals reorder/add/delete), /report (computed review + /api/narrative + print), "Ask RIPPLE" coach drawer: securities regex + model flag → refusal + concept + computed monthly amount, refusal log. Model text uses {placeholders} filled by our code; any digit → template
- [x] B8 privacy: bare payee names masked, masked merchant never taken back from model, panel verified. PDF text layer chunked ~15 rows/call in parallel (55/55 rows, exact totals on public/demo/statement-oct.pdf). UPI + scanned PDF: no vision model on the Groq key → clear "use SMS/CSV" message
- [x] B9 deployed: https://ripple-psi-gold.vercel.app (Vercel project `ripple`, GROQ_API_KEY in production env); `BASE=<url> node scripts/walk.mjs` passes with 0 console errors. Reset demo is on the Import screen
- [x] Excel import: `src/lib/ingest/xlsx.ts` (SheetJS 0.20.3, browser-only): picks the history sheet, finds the header under metadata, detects columns incl. an unnamed UPI ID column, signed amounts, Date+Time, emoji-free tags; mapping UI when columns are unknown; unparsed rows reported. source_kind "xlsx" (CONTRACT v1.1.0 amendment). Masking now covers "Money sent to <name>" and UPI IDs; privacy test asserts the model payload. Fixtures via `node scripts/make-xlsx-samples.mjs`
- [x] B10 paced demo footage on the deployed URL: `node scripts/demo.mjs <dir>` → ../demo-recordings/demo-deployed-b10.webm (69 s, spec §7 beats). Not built (cut list #3): coach opportunity generation; seeded advice drives the Ghost
- [x] Investigation agent ("Investigate" in the sidebar, `src/components/investigate/`, `/api/investigate`, `src/lib/engine/investigate.ts`, `src/lib/ai/investigate.ts`): the model plans a chain over 7 tools that wrap the engine (query_transactions, get_recurring, get_goals, get_profile, get_category_trend, run_projection, create_scenario), one route call per step, each step streamed with its finding and clickable rows; capped at 5 calls then forced to conclude; proposes one action (scenario, or engine-priced advice) the user approves. Tool results masked leaf by leaf (bare payee names), explanation digit-guarded. Smart model, then fast model, then a fixed fallback chain. Shares no code with the coach drawer
- [x] Phase 1 (bb83df1): privacy tokens at payload construction (`src/lib/ai/protect.ts`, applied in `callApi`; derived ids too; all-routes test), recovery screen + error boundaries + schema v2 (`STORE_VERSION`), "Income not detected" state, 3 MB upload cap. Agent: `create_goal` (stated price only, else it asks), proposals derived from the chain with a cited step
- [x] Phase 2 (ce4fd84): deterministic text-layer PDF parser (`src/lib/ingest/pdf-text.ts`) as the floor under the model; routes report fallback/template use (`src/lib/ai/meta.ts`) and the sidebar shows it. No FALLBACK_MODEL_KEY configured, so no second provider
- [x] Phase 3 (06e3fb1): plain-language bulk rules on Review (`/api/bulk-rules`, `src/lib/engine/bulk-rules.ts`), user-defined categories (`customCategories` in the store), rule `source` shown in the Rulebook; demo data for the example in `public/demo/sms-shops.txt`. 85 tests
