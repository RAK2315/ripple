# Rehaan's Build Plan — RIPPLE

Now → 22:30 IST build freeze. 22:30–23:59 is demo video + writeup (Kirti owns, Rehaan supports). Ordering from spec §8: **demo path end to end with the hero working before widening anything.** Every block leaves the app demoable.

Demo path (spec §7): SMS paste → categorized + flagged → fix one category → rule → 14 rows re-categorize → Rulebook → Flow (invisible salary, scrubber, cone, goal marker) → NL scenario → diff → Ghost + regret number → mutual-fund refusal.

## Decision points (fixed clock times)

| Time | Decision |
|---|---|
| **16:30** | **Sankey fallback call.** If the Sankey is not rendering real data correctly by 16:30, switch to a stacked horizontal bar of the same flows (20 min) and move on. No extensions. |
| **17:30** | **Kirti integration.** If her PR is merged and `npx vitest run kirti` is green, wire `parseSms`/`parseCsv` into Import. If not, Import keeps running on the fallback path (fixture + `public/demo/` inputs) and we retry at 20:00. The demo never depends on it. |
| **18:15** | **Rough demo recording.** Hero path working = record a rough 90 s screen capture, however ugly. We are never without a video. |
| **20:00** | Second (last) Kirti integration window. |
| **21:00** | Feature freeze for anything not on the demo path. Deploy. |
| **21:45** | Re-record demo on the deployed URL. |

## Blocks

### B1 · 14:10–15:10 · Data core
Build: `src/lib/config.ts`, `types.ts`, `store.ts` (Zustand persist), `format.ts` (paise→₹), engine `categorize-match.ts` (4 rule types + ~150-merchant starter list + merchant normalizer), `recurring.ts` (≥3 occurrences, 28–31 / 7 / 365-day gaps, ±5% amount; statuses active/changed/unused/new), `profile.ts` (income from largest regular credit, fixed costs from recurring). `/api/categorize` (Haiku, batches of 40, cache per description, heuristic fallback). Load-fixture button. Vitest on recurring + categorize-match.
Done: fixture loads, every row has a category + source + confidence, low-confidence ones flagged, Netflix shows `changed` 199→499 in Aug, Country Delight `new`, tests green, survives refresh.
Cut if overrun: LLM categorization (heuristic fallback ships, LLM added in B8).

### B2 · 15:10–16:30 · Projection + Flow screen (HERO)
Build: engine `projection.ts` (spec §3.5 formula; trailing 3-month avg per category; 3 runs avg/±1σ of 6 months; 24 months forward; balance history from transactions), `goals.ts` (priority-order funding, projected date), `impact.ts` (goal-impact days). Seed profile: bike goal ₹1,80,000 + emergency fund + laptop goal. Flow screen: invisible salary number large, Sankey (income → fixed / variable categories / savings, leaks for unused subs), timeline chart with history + cone + goal markers, draggable scrubber that updates Sankey/balance for the selected month. Provenance drawer (clicking a number → rows).
Done: Flow screen is the landing page, numbers are correct by hand-check, dragging the scrubber moves the cone/marker readout, bike goal lands around mid-2027.
**16:30 Sankey call** (see above). Cut if overrun: scrubber updates only the readout, not the Sankey.

### B3 · 16:30–17:30 · Import (SMS/CSV) + Review + correction loop + Rulebook
Build: Import screen with 4 tabs (SMS + CSV live now, PDF/UPI tabs present and wired in B8). SMS uses `kirti/` if merged, else internal fallback that matches the pasted demo dump to fixture rows by `source_line`/amount+date. Count of categorized vs needs-review. Review screen: low-confidence pinned top, inline category select. `/api/propose-rule` (Sonnet; raw desc + old/new category + same-merchant rows → rule; fallback: "contains <merchant token>"). Rule modal shows plain English + live match count, editable, confirm → apply over history → toast "14 transactions re-categorized". Rulebook: plain English, source txn, match count, edit, delete, toggle.
Done: the 0:00–0:25 demo beats work end to end on the BHAGWATI rows.
Cut if overrun: rule edit (keep delete/toggle).

### 17:30 · Kirti integration checkpoint (15 min, inside B4)

### B4 · 17:30–18:15 · Scenarios + diff
Build: scenario model (category %/fixed change, income change, one-off expense, add/remove recurring, goal target/date change; name + parent; "main" undeletable), projection applies assumption chain. `/api/scenario` (Sonnet, zod schema → assumptions; fallback regex for "rent +N", "cut X by a third/N%"). Editable assumption fields shown before running. Diff view: balance at 12 months, each goal date in both, missed goals, monthly surplus; changes highlighted.
Done: typing "what if rent goes up by 6000 and I cut eating out by a third" builds a scenario, bike marker moves, diff vs main shows it.
Cut if overrun: scenario parents (flat list under main).

### B5 · 18:15–18:45 · Ghost screen + rough demo recording
Build: engine `ghost.ts` (unaccepted advice: monthly saving compounded forward from date given; ghost balance = real + accumulated), chart real vs ghost, regret number large, advice list with "accept" (which moves future advice into accepted). **Record the rough demo at ~18:30.**
Done: regret number shows with provenance to the advice rows; rough video file exists.
Cut if overrun: accept button.

### B6 · 18:45–19:45 · Recurring alerts, graveyard, nudges, goal-impact, income shift
Build: Subscriptions panel (changed/unused/new alerts; LLM one-line "why it changed" via `/api/explain` with fallback text; user can mark unused), graveyard with yearly total, nudges engine (>20% above expected pace mid-month, names the driving transactions, projected goal shift), goal-impact lens on every transaction row and nudge, `shifts.ts` (income / rent-like fixed cost change ≥10% month over month) with "Re-plan" button showing which goal dates moved.
Done: Dining nudge appears for November with its 3 driving dates and goal effect; graveyard shows cult.fit; every txn row shows "+N days on <goal>".
Cut if overrun: LLM explanation (static template).

### B7 · 19:45–20:30 · Goals & Profile, Monthly Review, guardrails
Build: Goals & Profile editor (income, fixed costs, emergency fund, goals with priority reorder). Monthly Review page (computed: in/out, category vs previous month, new/changed recurring, goal progress, nudges acted on, biggest opportunity) + `/api/narrative` (Sonnet writes prose around passed numbers; fallback template) + print stylesheet. Coach box with guardrails: securities/fund/insurance questions → refusal + concept explanation + computed SIP-style monthly amount to hit the goal (our arithmetic); refusal log shown; footer boundary line. `/api/coach` also generates top-3 opportunities → advice table.
Done: "which mutual fund should I buy" gets the refusal + monthly amount; review page prints.
Cut if overrun: coach opportunities generation (seeded advice is enough).

### 20:00 · Second Kirti integration window (15 min)

### B8 · 20:30–21:00 · Privacy pipeline + PDF/UPI vision
Build: `mask.ts` applied in every `/api/*` route, payload log in store, "What the AI sees" panel (drawer showing last N masked payloads). PDF tab: unpdf text → SMS/CSV-like line parse via LLM; scanned → page image to vision. UPI screenshot tab: image → `/api/vision` → rows.
Done: panel shows `XX4821`/`[NAME]` masking on a real call; a GPay screenshot yields rows.
Cut if overrun: PDF scan path (text-layer only), then UPI.

### B9 · 21:00–21:45 · Deploy + demo hardening
Build: `vercel --prod` with `ANTHROPIC_API_KEY` env, "Reset demo" button (reload fixture, clear rules except seeded), walk the demo path on the public URL with console open, fix errors, empty/loading states on demo screens, README with URL.
Done: public URL runs the whole demo path with no console errors.

### B10 · 21:45–22:30 · Re-record + buffer
Re-record the 90 s demo on the deployed build. Remaining time: polish on the demo path only. 22:30 hand off to Kirti for edit + writeup.

## Cut list (bottom first)
1. PDF scanned-page vision → 2. UPI screenshot → 3. coach opportunity generation → 4. rule edit → 5. scenario parents → 6. LLM recurring explanations → 7. Monthly review narrative (template) → never cut: correction loop, Flow, scenarios + diff, Ghost, refusal.

## Problems I Anticipate (and Solutions)

1. **Sankey eats hours** (spec §10). Hard call at 16:30; stacked bar fallback is the same data, 20 min.
2. **No API key yet / model slow or down mid-demo.** Every AI route has a deterministic fallback (heuristic categorizer, regex scenario parser, template narrative). Categorization results cached by description in the store, so the demo dataset is categorized once and replays instantly.
3. **LLM categorization at volume.** Rules + starter list catch most rows; only the unmatched tail goes to Haiku in batches of 40 with retries. Low confidence (< 0.7) → flagged, not silently accepted.
4. **NL scenario returns a wrong structure.** Never applied silently; editable fields first. Regex fallback for the exact demo sentence.
5. **Ghost line "how do you have six months of history?"** Answer: the seeded profile is a user who has had RIPPLE for six months. Say it if asked; never improvise.
6. **"Unused" is not knowable from a bank statement.** We detect the payment and ask the user to confirm, or infer from no related spending in the category. Say it out loud.
7. **Kirti's parser late or produces off-contract output.** App built on `contract/fixture.json` + `public/demo/`; integration is a swap at 17:30 or 20:00, gated by her tests passing. Runtime guard: validate parser output against contract shape; any off-contract row → treated as unparsed, never crashes.
8. **Date edge cases.** Nov is partial (ends 20th): monthly averages use complete months only; nudge pace uses day-of-month / days-in-month. Trailing averages exclude the current partial month.
9. **Re-categorization breaks derived numbers.** Nothing derived is stored; everything recomputes from transactions, so a rule change ripples everywhere automatically (and is the product's name).
10. **Rule over-matching** (e.g. "contains UPI"). Rule modal shows the live match count and a sample of matched rows before confirm; reject tokens shorter than 4 chars and generic tokens (UPI, POS, HDFC, ICICI, PAYMENT, NEFT, IMPS).
11. **Duplicates** when the user imports SMS and CSV for the same period. Dedup key `date + amount + direction + normalized merchant`; duplicates reported in the import summary, not silently merged.
12. **localStorage quota / stale schema** after code changes. Versioned key `ripple-v1`, "Reset demo" button, store migrate function that drops unknown shapes.
13. **Hydration mismatch** from persisted state in Next.js. Screens render client-side only after store hydration (`useHasHydrated` gate), skeleton before.
14. **Goal-impact on negative surplus** (divide by ≤ 0). Show "goal unreachable at current surplus" instead of a number.
15. **Masking strips the merchant the model needs.** Mask only person names in P2P transfers and the account holder's name; merchants (Swiggy, Netflix) stay visible. Panel proves what was sent.
16. **Vercel deploy surprises** (env var missing, function timeout on vision). Deploy a first time at B2 end (16:30) so the pipeline is proven early; final deploy at 21:00. Vision routes set `maxDuration`.
17. **Demo-day flakiness**: deterministic seed, `APP_TODAY` pinned to 2026-11-20, reset button, a pre-copied SMS dump in `public/demo/sms-dump.txt` with a "copy demo SMS" link on the Import screen.
