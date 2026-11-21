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
- **Models:** `claude-sonnet-5-5` (rules, scenarios, narrative, vision), `claude-haiku-5-5` (batch categorization, 40 per call, cached per unique description). Structured output via AI SDK + zod. Key: `ANTHROPIC_API_KEY` in `.env.local` (never committed) and Vercel env.
- **Style:** simple, boring code. No abstraction until needed twice. Tests (vitest) only for `src/lib/engine/*` and parsers. Run `npx tsc --noEmit` and `npx vitest run` before each commit.
- **Commits:** small, per plan block, message `block N: <what>`. Push to `main`. End messages with the Co-Authored-By line.

## Status

Update after each block.

- [x] Setup: contract, fixture, briefs, repo
- [ ] B1 data core
