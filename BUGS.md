# RIPPLE — bug hunt, 21 Nov 2026 (18:20 IST)

Document only. Nothing below has been fixed. Hunted across the whole app at commit `ac7f329` (local dev server + the deployed URL where noted).

**Evidence tag on every entry:** **[ran]** = reproduced at runtime (browser walk, vitest probe or a direct request); **[code]** = found by reading the code, the repro steps are what should trigger it but were not executed.

**Counts:** 6 demo-breaking · 33 wrong-data · 13 cosmetic · **52 total**

**Status after phases 1–2 (21 Nov, 19:00 IST):** all 6 demo-breaking fixed; wrong-data: 2 fixed (W29, W32), 3 partly fixed (W10, W21, W31), 28 open; cosmetic: 2 fixed (C5, C11), 11 open. Each fixed entry names its commit.

---

## Demo-breaking

### D1. Groq daily token quota is exhausted, and the PDF path has no deterministic fallback  [ran]
- **Status: FIXED** (phase 2, ce4fd84: text-layer PDFs fall back to RIPPLE's own parser (55/55 rows on the demo statement, test), chunk calls time out at 30 s; walk completes the PDF step on the floor. The quota itself is operational: no FALLBACK_MODEL_KEY is configured)
- **Where:** `src/app/api/vision/route.ts:44-50` (text-layer PDF calls `structured({ model: "smart" })` per chunk, no non-model parse); `src/lib/ai/model.ts` (one key, `gpt-oss-120b` for every "smart" route). Same key in Vercel production.
- **Repro:** at 18:00 IST a direct call returned `429 Rate limit reached for model openai/gpt-oss-120b ... tokens per day (TPD): Limit 200000, Used 198989`. Then `node scripts/walk.mjs <dir>` → every headline number still correct, but the walk times out at the PDF step: `locator.waitFor: Timeout 120000ms exceeded ... waiting for getByText('Added')`.
- **What happens:** every smart route silently degrades to templates (coach, advice wording, scenario naming, narrative, explain, rule proposals). Those have fallbacks. The text-layer PDF import does not: the spinner "Reading PDF…" sits for up to ~3 minutes (90 s timeout × retries per chunk, `maxDuration = 180`) and then shows "The model could not read this file". The investigation agent's own testing this session (each run is ~6 calls of 2–4k tokens) contributed to burning the quota; see W30.
- **Should:** PDF text layer gets a deterministic row parser (date + amount + description regex on the extracted text, the same shape the CSV fallback uses), used when the model call fails; long model calls fail fast on a 429 instead of retrying into a multi-minute wait. Operationally: know the quota resets on a rolling 24 h window, and avoid burning it before recording.

### D2. Uploads over ~3.3 MB fail on the deployed site with a raw JSON parse error  [ran]
- **Status: FIXED** (phase 1, bb83df1: files over 3 MB refused before upload with a clear message; callApi turns non-JSON responses (413) into a readable error)
- **Where:** Vercel function body limit (4.5 MB) vs base64 upload in `src/components/import/import-screen.tsx:84-86`; `src/lib/api.ts:7-9` calls `res.json()` on a non-JSON body.
- **Repro:** POST a 5.2 MB body to `https://ripple-psi-gold.vercel.app/api/vision` → `413 Request Entity Too Large / FUNCTION_PAYLOAD_TOO_LARGE`. In the UI: Import → UPI screenshot (or PDF) → choose a 3.5 MB phone screenshot.
- **What happens:** the 413 body is plain text, `res.json()` throws, `callApi` returns `{ ok:false, error: "Unexpected token 'R', \"Request En\"... is not valid JSON" }`, and that string is shown to the user. The clean "needs a vision model, paste SMS/CSV instead" message never appears because the request never reaches the route. Phone screenshots and scanned statements are routinely this size. This also blocks feature 2 (vision) for real files.
- **Should:** check `file.size` before encoding (or downscale images client-side) and show a clear "file too large, max N MB" message; `callApi` should handle non-JSON responses with a readable error.

### D3. Corrupted `ripple-v1` in localStorage leaves the app on a skeleton forever  [ran]
- **Status: FIXED** (phase 1, bb83df1: unreadable saved state shows a recovery screen with "Reset and reload demo data"; verified in the browser)
- **Where:** `src/lib/derived.ts:47-55` (`useHydrated` waits for `onFinishHydration`); `src/components/shell/shell.tsx` gates `<main>` on `hydrated`; `src/lib/store.ts:136` (persist, no `onRehydrateStorage` error handling).
- **Repro:** on any page run `localStorage.setItem("ripple-v1", "{not json")`, reload.
- **What happens:** the content area shows loading skeletons indefinitely, no console error, no message. Every route, including Import (where "Reset demo" lives), is gated the same way, so the user cannot recover without devtools.
- **Should:** on a rehydration error, fall back to the empty state, show a notice, and offer reset.

### D4. No error boundary: one render exception blanks the whole app  [ran]
- **Status: FIXED** (phase 1, bb83df1: error boundaries around every screen and drawer; wrong-shaped saved state is rejected on load (recovery screen); saved schema versioned (v2), older saves cleared with a notice)
- **Where:** no `error.tsx` / React error boundary under `src/app/`; components assume store shape (e.g. `s.scenarios.map`).
- **Repro:** load `/?demo=1`, then in devtools set `state.scenarios = null` in `ripple-v1` (simulates stale data from an older build) and reload; visit `/`, `/scenarios`, `/ghost`, `/goals`.
- **What happens:** `TypeError: Cannot read properties of null (reading 'map')` on every route; the main area renders nothing. Any future unexpected value (a bad model-produced row, an old schema) has the same blast radius.
- **Should:** a route-level error boundary with a "Reset demo data" action; validate persisted state shape on rehydrate.

### D5. A judge's own short statement produces income ₹0 and nonsense everywhere  [code]
- **Status: FIXED** (phase 1, bb83df1: with no detectable salary every screen shows "Income not detected" with the months imported and a link to enter it; Flow's invisible salary shows a dash, the agent says not detected; verified with a one-month CSV)
- **Where:** `src/lib/engine/projection.ts:35-36` (income = largest *recurring* credit); `src/lib/engine/recurring.ts:36-40` (recurring needs ≥3 occurrences at a monthly cadence, amounts within 5%).
- **Repro:** Import → Reset demo → upload a CSV covering one or two months (or a salary that varies by more than 5% month to month, e.g. a bonus month).
- **What happens:** no salary is detected, so income = ₹0 and fixed costs = ₹0 (nothing is "recurring" yet). Flow shows "Invisible salary 0%", surplus is negative, every goal reads "not reached", Monthly Review shows "999 mo late" (W20), and the investigation agent reports "Income ₹0/month". Nothing tells the user why or points to Goals → Monthly income.
- **Should:** when no income is detected, say so on Flow ("we couldn't detect a salary: set it on Goals") instead of computing on ₹0; consider largest credit when history is short.

### D6. "What the AI sees" shows payee names in clear: recurring ids and merchant names reach models unmasked  [code]
- **Status: FIXED** (phase 1, bb83df1: every model-bound body is tokenized in callApi (src/lib/ai/protect.ts), names in every derived form including ids (rec_ramesh_kulkarni → rec_name_1) and name parts in free text; test drives all model routes and asserts no demo name reaches a call or the panel)
- **Where:** `src/app/api/scenario/route.ts` prompt line `Recurring payments (id: merchant, category): ${recurring.map(r => `${r.id}: ${r.merchant} (${r.category})`)}`, with no `mask()` at all; recurring ids are built from the payee name (`src/lib/engine/recurring.ts:67` → `rec_ramesh_kulkarni`) and are also sent by `/api/explain` (`${it.id}:`), `/api/advice` (`key=unused_rec_<name>`) and `/api/investigate` (`recurring_id` in tool data; my leaf-masking scrubs "Ramesh Kulkarni" but not `rec_ramesh_kulkarni`).
- **Repro:** load the demo, Scenarios → type "what if rent goes up by 6000" → Run → open "What the AI sees" → the scenario payload lists `rec_ramesh_kulkarni: Ramesh Kulkarni (…)` and `rec_sunita_mehta: Sunita Mehta (…)`.
- **What happens:** the privacy claim (rule 3: "every model call is masked first") is visibly false on the panel a judge is invited to open.
- **Should:** mask merchants in the scenario prompt; send opaque recurring ids (index or hash) to models and map back server-side.

---

## Wrong-data

### Import: CSV / SMS / Excel / PDF

**W1. CSV "Transaction Type" (DR/CR) column ignored: every debit becomes a credit**  [ran]
- Where: `src/lib/ingest/fallback.ts:216` (`isType` only accepts exactly `type`, `txn type`, `dr/cr`, `cr/dr`, `debit/credit`), `:251-252`.
- Repro: CSV `Date,Description,Amount,Transaction Type` / `14/11/2026,SWIGGY,450.00,DR`.
- Happens: `2026-11-14 credit 45000 SWIGGY`. Spend vanishes and credits inflate.
- Should: match `transaction type`, `type of txn`, `cr/dr indicator` etc.; if the direction column can't be found, ask via the mapping UI rather than guess.

**W2. CSV with one unsigned Amount column and no type column: every row is a credit**  [ran]
- Where: `fallback.ts:252` (`else direction = "credit"`).
- Repro: `Date,Description,Amount` / `14/11/2026,SWIGGY,450.00`.
- Happens: SWIGGY recorded as money in.
- Should: treat as ambiguous and ask (mapping UI), or default to debit with low confidence, not silently credit.

**W3. CSV quoted fields containing a newline break into bad rows**  [ran]
- Where: `fallback.ts:187` splits the file on `\n` before handling quotes.
- Repro: `Date,Narration,Amount` / `14/11/2026,"UPI/SWIGGY` ⏎ `ORDER",-450`.
- Happens: that transaction becomes two unparsed rows (`no_amount`, `bad_date`).
- Should: split records with a quote-aware reader.

**W4. CSV row with both Withdrawal and Deposit filled: deposit silently ignored**  [ran]
- Where: `fallback.ts:257-261`.
- Repro: `Date,Narration,Withdrawal,Deposit` / `14/11/2026,REFUND+FEE,100,50`.
- Happens: one debit of ₹100; the ₹50 credit disappears without an unparsed entry.
- Should: emit both, or report the row as ambiguous.

**W5. Accounting negatives "(450.00)" rejected**  [ran]
- Where: `fallback.ts:42-46` `parseAmount`.
- Repro: Amount cell `(450.00)`.
- Happens: `bad_amount`, row lost (reported).
- Should: parse parentheses as a negative/debit.

**W6. Year-less dates are filed a year back for anything after 20 Nov 2026**  [ran]
- Where: `fallback.ts:32-37` resolves against `referenceDate = APP_TODAY = "2026-11-20"` (`src/lib/config.ts`), and the real date today is 21 Nov.
- Repro: `parseDate("21 Nov", "2026-11-20")` → `2025-11-21`. In the app: paste an SMS from today that says "on 21-Nov".
- Happens: today's transaction lands in Nov 2025, a year early, distorting history and recurring detection.
- Should: resolve against the real date (or the latest date in the paste), not the pinned demo date.

**W7. No sanity bounds on dates or amounts**  [ran]
- Where: `fallback.ts:10-15` (years 1990–2100 accepted), `:42-46` (no max).
- Repro: CSV rows dated `14/11/2099`, or amount `-99999999999999`.
- Happens: both are accepted; the future row appears in balance history; the huge amount wrecks every projection.
- Should: flag dates after today and implausible amounts as unparsed/needs review.

**W8. MM/DD dates silently swapped when the day is ≤ 12**  [ran]
- Where: `fallback.ts:26` (always day-first, per contract).
- Repro: a US-locale Excel re-save producing `03/04/2026` meaning 4 Mar.
- Happens: read as 3 Apr. Day > 12 rows fail as `bad_date`, so a mixed file is half wrong, half rejected.
- Should: detect month-first files (any first field > 12) and warn.

**W9. Cross-import dedup drops genuine identical purchases**  [code]
- Where: `src/lib/store.ts` `dedupKey` = `date|amount|direction|merchant`; applied only against existing rows, not within a batch.
- Repro: import SMS containing two ₹20 chai payments on the same day, then import a CSV with the same two rows.
- Happens: within one import both are kept; a second import of an overlapping source drops both as "duplicates", even if only one already existed. Real repeated purchases (two metro top-ups) can also be dropped against an unrelated earlier row.
- Should: count multiplicity (n copies in store vs n in batch), or dedup on a reference number when present.

**W10. PDF/vision rows dropped silently; summary claims 0 unparsed**  [code]
- **Status: PARTLY FIXED** (the deterministic PDF path reports unreadable rows as unparsed; rows the model path drops are still not reported)
- Where: `src/app/api/vision/route.ts:67-68` (filters rows with a bad date or non-positive amount), `:49-51` (failed chunks only noted in `path`); `import-screen.tsx:87` hard-codes `unparsed: []`.
- Repro: a PDF where one chunk times out, or the model returns a row with date `"14 Nov"`.
- Happens: those rows vanish; the Import summary says nothing was left unparsed. Violates the contract's "never silently drop".
- Should: return dropped rows / failed chunks as `UnparsedRow`s.

**W11. PDF text silently truncated at 60,000 characters**  [code]
- Where: `vision/route.ts:38` `mask(text).slice(0, 60000)`.
- Repro: a multi-month statement PDF with a long text layer (~600+ rows).
- Happens: rows after the cut are never sent; no notice.
- Should: chunk the whole text or report the truncation.

**W12. SMS payee fallback stores the first 60 characters of the message as the description**  [ran]
- Where: `fallback.ts:133-135`.
- Repro: `Rs 100 debited from A/c XX4821 on 14-11-26 to A`.
- Happens: `raw_description` = `Rs 100 debited from A/c XX4821 on 14-11-26 to A` (includes the account fragment); it then categorizes and groups badly.
- Should: keep the payee even when short, or mark the row for review.

### Rules and the correction loop

**W13. A rule that matches everything can be saved**  [code]
- Where: `src/components/review/rule-modal.tsx:108-115`: >60 matches only shows a warning; Save stays enabled.
- Repro: Review → fix any row → change the pattern to `A` (or `UPI`) → Save.
- Happens: the rule re-categorises most of history, including the salary credit, and every screen recomputes on it.
- Should: block or require explicit confirmation above a threshold, and never apply a debit-category rule to credits (W16).

**W14. Rulebook inline edit applies on every keystroke with no preview**  [code]
- Where: `src/components/rules/rulebook-screen.tsx:66` (`update(r.id, { pattern })` on change).
- Repro: Rulebook → edit a pattern from `SWIGGY` to `SWIGGY INSTAMART` by typing.
- Happens: intermediate patterns (`S`, `SW`…) re-categorise all history live; when you stop, the final state is right, but if you stop at a short pattern the damage is invisible (no match count shown here, unlike the modal).
- Should: edit in a draft with a preview count, apply on Save.

**W15. Deleting a rule: no confirm, no count of affected rows, no undo**  [code]
- Where: `rulebook-screen.tsx` delete button → `deleteRule`.
- Repro: Rulebook → ✕ on a rule that categorised 14 rows.
- Happens: those rows silently revert to starter/model categories (the one row the user corrected keeps its override).
- Should: "This will change N rows back" confirm, and an undo toast.

**W16. Rules ignore direction**  [code]
- Where: `src/lib/engine/categorize.ts:6-23`.
- Repro: learn `contains SWIGGY → Dining`, then import a Swiggy refund (credit).
- Happens: the refund is categorised Dining (a credit in a spending category).
- Should: a rule applies to the direction of the row it was learned from.

**W17. Conflicting rules: newest silently wins**  [code]
- Where: `categorize.ts:54` (sorted by `created_at`, ties unstable).
- Repro: create `contains AMAZON → Shopping`, then `contains AMAZON PRIME → Subscriptions`, then `contains AMAZON → Groceries`.
- Happens: Prime rows become Groceries; the Rulebook shows all three as active, with no "shadowed" indicator.
- Should: show conflicts in the Rulebook; prefer the more specific pattern.

### Engine: recurring, projection, goals

**W18. Recurring id collision between a debit and a credit series from the same merchant**  [code]
- Where: `src/lib/engine/recurring.ts:67` (`rec_${merchant}`, direction not in the id).
- Repro: a monthly payment to and a monthly refund/cashback from the same merchant.
- Happens: two Recurring records share an id: "mark unused" toggles both, React keys collide, and scenario `remove_recurring` picks the first.
- Should: include direction in the id.

**W19. Manual fixed costs always land in category "Other"**  [code]
- Where: `src/lib/engine/projection.ts:43-46`.
- Repro: Goals & Profile → add manual fixed cost "Rent ₹20,000" (not linked).
- Happens: the plan, scenario diff category table and investigation `get_profile` show it under Other, and a scenario "rent +6000" does not touch it.
- Should: let the user pick a category for a manual fixed cost.

**W20. Unreachable goal shows "999 mo late"**  [ran]
- Where: `projection.ts:218` uses 999 as a sentinel; `src/components/report/report-screen.tsx:154` prints it.
- Repro: Goals → Monthly income ₹1 → Monthly Review.
- Happens: "Bike: not reached vs plan Jun 2027 999 mo late".
- Should: "not reached at this surplus" (as the Goals screen already says).

**W21. Invisible salary shows 0% when income is ₹0, and absurd percentages for tiny incomes**  [ran]
- **Status: PARTLY FIXED** (₹0 income now shows the no-income state (D5); a tiny non-zero income still gives a huge percentage)
- Where: `src/components/flow/flow-screen.tsx:39`.
- Repro: income ₹1 → "3889300% of your income is spent before it arrives"; no salary detected (D5) → "0%".
- Should: "income not detected" state instead of a number.

**W22. Goals editor accepts negative/zero amounts and an empty date**  [code]
- Where: `src/components/goals/goals-screen.tsx:139-141` (goal target, date), `:47,63,66,68` (income, balance, emergency fund); `src/lib/format.ts:24-34` assumes a valid month.
- Repro: Goals → set a goal target to `-5000` or `0`, or clear the date field.
- Happens: target ≤ 0 → goal "lands" this month and is "funded"; cleared date → labels read "undefined" and month arithmetic yields NaN. Negative income or balance is accepted silently.
- Should: validate (target > 0, a date in the future, income ≥ 0), keeping the last valid value.

**W23. Scenario assumptions are not bounded: "cut eating out by 150%" makes spending negative**  [code]
- Where: `projection.ts:103-110` (`total * (1 + pct/100)`), `src/lib/scenario-parse.ts` (regex reads 150%), `components/scenarios/assumption-editor.tsx`.
- Repro: Scenarios → "what if I cut eating out by 150%" → Run.
- Happens: Dining becomes negative, so variable spend shrinks below zero for that category and surplus is inflated; goals move earlier.
- Should: clamp category results at ≥ 0 and flag cuts beyond −100%.

**W24. One-off expense dated this month or in the past is silently ignored**  [code]
- Where: `projection.ts` loop starts at `k = 1` (next month); one-offs keyed by month.
- Repro: Scenarios → add a one-off of ₹50,000 dated 2026-11-25 (APP_TODAY is 2026-11-20).
- Happens: the scenario shows no effect at all.
- Should: apply current-month one-offs to the starting balance, or reject past dates in the editor.

**W25. Deleting a parent scenario silently changes its children's numbers**  [code]
- Where: `src/lib/store.ts` `deleteScenario` (children keep a dangling `parent_id`); `src/lib/derived.ts` `chainAssumptions` stops at the missing parent; tree re-roots orphans (`scenarios-screen.tsx:339`).
- Repro: create "Rent +6000", create child "Cut dining" under it, delete the parent.
- Happens: the child loses the inherited rent assumption, so its balance and goal dates jump, with no notice.
- Should: confirm and either delete descendants or re-parent them to main with the inherited assumptions copied in.

### Ghost and advice

**W26. Accepting advice erases its past regret retroactively**  [code]
- Where: `src/lib/engine/ghost.ts:68` (`open = advice.filter(a => !a.accepted)`).
- Repro: Ghost → accept a seeded advice item given in June.
- Happens: its five months of accumulated regret disappear from the regret number and from the past ghost line, as if it had been followed since June.
- Should (design call): acceptance should stop accrual from `acted_on_date`, not delete history.

**W27. Advice with no matching transactions still accrues full regret**  [code]
- Where: `ghost.ts:75,81`.
- Repro: seeded advice whose text names a merchant absent from the data (or live advice whose evidence was empty).
- Happens: regret counts the full promised saving; clicking it opens an empty provenance drawer, so the number has no rows behind it.
- Should: show "no evidence it wasn't followed", or exclude it.

**W28. Seeded-advice evidence matched by the first ≥4-letter word of any merchant**  [code]
- Where: `ghost.ts:33-37`.
- Repro: advice "Take half your cab rides on the Metro pass you already pay for" (if seeded rather than live).
- Happens: Metro pass payments (following the advice) count as evidence it was *not* followed.
- Should: use explicit evidence ids for all advice (live advice already does).

### Investigation agent (new today)

**W29. A model proposal that doesn't change monthly surplus is thrown away**  [code]
- **Status: FIXED** (bb83df1: proposals are derived from the chain and cite their step; a draft that moves any goal date counts; the advice-list substitute is gone)
- Where: `src/lib/engine/investigate.ts` `runInvestigation`: a draft is only kept if `surplus_after !== surplus_before`.
- Repro: ask "Can I get the laptop sooner?" and have the model propose a `goal_change` (move the date) or a dated `one_off`.
- Happens: the proposal is replaced by the fallback advice (top fresh opportunity), which may be unrelated to the question.
- Should: keep drafts that move any goal date or balance, not only surplus.

**W30. Each investigation step resends the full transcript, so the agent is expensive**  [ran]
- Where: `src/lib/ai/investigate.ts` `buildInvestigatePrompt` (all prior tool `data`, including full recurring lists).
- Repro: one investigation logs 6 payloads in "What the AI sees", each growing; roughly 15–20k tokens per run.
- Happens: about ten investigations consume a meaningful share of the 200k/day smart-model quota (D1). The fast-model fallback keeps it working, with weaker explanations.
- Should: send compact summaries of earlier steps (the finding line), not their full data.

### Privacy

**W31. `mask()` misses common Indian narration formats**  [ran]
- **Status: PARTLY FIXED** (bb83df1: names that appear anywhere in the user's own data are now tokenized in every payload, including inside NEFT/IMPS/UPI-dash narrations; spaced phone numbers and names never seen as a payee are still missed by mask())
- Where: `src/lib/ai/mask.ts`.
- Repro (input → output from a vitest probe):
  - `NEFT CR-HDFC0001234-SUNITA MEHTA-NOV RENT` → unchanged
  - `IMPS-612345678901-RAMESH KULKARNI-SBIN` → `IMPS-XX8901-RAMESH KULKARNI-SBIN`
  - `UPI-RAMESH KULKARNI-ramesh.k@okaxis-…` → `UPI-RAMESH [UPI-ID]@okaxis-…` (surname leaks via the handle split, first name kept)
  - `UPI/P2M/412345/Ramesh Kulkarni` → unchanged
  - `BY TRANSFER-NEFT*SUNITA MEHTA` → unchanged
  - `Transfer from Rahul Verma for dinner` → unchanged
  - `Call me at 98765 43210`, `Pay 7303 456 789` → unchanged (spaced phone numbers)
  - `To Ananya Rao Singh Kumar` → `To [NAME] Kumar`
  - `Ramesh` (single first name) → unchanged
- Happens: these strings reach `/api/categorize`, `/api/propose-rule`, `/api/sms-fallback`, the PDF text path and free-text questions unmasked.
- Should: add the NEFT/IMPS/UPI-dash/P2M/BY TRANSFER shapes, spaced 10-digit numbers, and ≥4-word names.

**W32. Free-text questions get pattern masking only**  [code]
- **Status: FIXED** (bb83df1: known payee names and their parts are tokenized in every free-text field before any call)
- Where: `/api/coach`, `/api/scenario`, `/api/investigate` all `mask()` the typed sentence.
- Repro: ask the coach "why do I send Sunita so much?".
- Happens: "Sunita" reaches the model (single names are never masked). The investigate route also scrubs names that appeared in its tool data; the others don't.
- Should: scrub every known payee name (from the user's own transactions) out of free text before any call.

### State

**W33. localStorage quota is not handled**  [code]
- Where: `src/lib/store.ts` persist (default storage, no try/catch).
- Repro: import a large history (~10k+ rows at ~400 bytes each, plus the AI log) so the persisted JSON passes ~5 MB.
- Happens: `setItem` throws `QuotaExceededError`; the app keeps working in memory, then everything since the last successful save is gone on refresh, with no warning.
- Should: catch it, warn, and trim `aiLog` / `llmCache` first.

---

## Cosmetic

**C1. No responsive layout: horizontal scroll on phones**  [ran]
`src/components/shell/shell.tsx` fixed 240 px sidebar + fixed grids (e.g. `goals-screen.tsx:127` `grid-cols-[50px_1fr_150px_160px_190px_40px]`). At 390×844 the page's `scrollWidth` is 831 px. (Mobile is out of scope per spec §11, but the brief asked.)

**C2. Theme ignores the OS dark-mode preference**  [ran]
`src/app/layout.tsx:27` only reads `ripple-theme` from localStorage; a browser with `prefers-color-scheme: dark` still gets light until the toggle is used.

**C3. Timeline goal labels overlap; y-axis labels clip on large balances**  [ran]
`src/components/flow/timeline.tsx`: two goals landing in the same month render on top of each other ("Bike" + "Laptop" → "Bilaptop"); with a balance in the crores the axis reads `0000.0Cr`, cut off at the left edge.

**C4. Nudge says "costs your bike goal about 0 days a month"**  [ran]
`src/components/nudges/nudge-list.tsx` prints a goal-impact that rounds to 0 instead of hiding the clause.

**C5. Investigation findings use "Jun 27" for June 2027**  [ran]
- **Status: FIXED** (bb83df1)
`src/lib/engine/investigate.ts` uses `monthLabel` ("Jun 27"), which reads as the date 27 June. Use `monthLabelLong` ("Jun 2027").

**C6. Choosing the same file again does nothing**  [code]
`import-screen.tsx:257`: the file input's value is never reset, so after an error, re-selecting the same file fires no `change` event.

**C7. Amount-range rules read "between ₹500 and ₹0" when no maximum is set**  [code]
`categorize.ts:33`.

**C8. Empty SMS paste parses to a 0/0/0 summary**  [ran]
`fallback.ts:146` returns `total_inputs: 0`; the Import screen shows an empty "Added 0" summary instead of "nothing to parse".

**C9. Empty CSV reports "1 input could not be parsed (header_undetected)"**  [ran]
`fallback.ts:208`.

**C10. Semicolon/tab-delimited CSVs fail row by row as `no_amount`**  [ran]
`fallback.ts:207-226`: the header is detected but every row is one cell; the reason shown should be "unsupported delimiter".

**C11. A stale persisted `version` logs a console error on every load**  [ran]
- **Status: FIXED** (bb83df1: a migrate step now clears older saves quietly with an on-screen notice)
`store.ts` persist has `version: 1` and no `migrate`; a stored `version: 0` logs "State loaded from storage couldn't be migrated since no migrate function was provided" (data still loads). Breaks the "zero console errors" bar for returning visitors after any future version bump.

**C12. "What the AI sees" keeps only 30 payloads, and one investigation logs 6**  [code]
`store.ts` `logAi` `.slice(0, 30)`: after a few investigations the categorize/PDF payloads a judge might want to inspect have rolled off.

**C13. Deep scenario trees indent without limit**  [code]
`scenarios-screen.tsx:317-335`: each level adds indentation; at depth ~10 names are squeezed off the card.

---

## Not bugs (checked)
- [ran] Investigation agent: the chain stops at 5 tool calls (unit test + live run), tools on an empty dataset return "No … found" lines without throwing, and an unanswerable question on an empty store still ends with an explanation.
- [code] Diffing a scenario against itself: `scenarioDiff` marks every row unchanged; no division or crash path.
- [code] Duplicate advice: `addLiveAdvice` dedupes by id, so the investigation agent and "Generate advice" can't add the same opportunity twice; the Ghost only renders Accept for open items, so double-accept isn't reachable from the UI.
- [ran] Escape inside the provenance drawer opened from the investigation drawer closes one layer at a time (fixed during feature 1, before this hunt).
