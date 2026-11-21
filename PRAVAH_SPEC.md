# PRAVAH - Complete Build Spec

**Event:** Product Space Agentic AI Hackathon
**Date:** 21 November 2026. Submission closes 11:59 PM IST the same day.
**Problem statement:** PS04, Personal finance coach with a living money model.
**Team:** 2 people. Build done mainly with Claude Code.

---

## 1. What we are building, in plain words

Most budgeting apps sort your transactions into categories and then stop. They show you a pie chart. They do not understand what you are trying to do with your money, and they do not change when your life changes.

PRAVAH is a money twin. It is a simulation of your financial life that keeps running in the background.

It does three things no budgeting app does:

1. **It learns your rules from your corrections.** When you fix a wrong category once, it writes a rule, applies that rule to every past transaction that matches, and uses it on all future ones. You can read every rule it has learned, and you can edit or delete any of them. The agent's brain is not hidden inside a prompt. It is a list you can scroll through.

2. **It lets you branch your future.** You do not just see one projection. You create scenarios, such as "rent goes up", "I quit in March", "I cut eating out by 30 percent". Each scenario runs the same projection with different assumptions. You can put two scenarios side by side and see which goals survive in each one.

3. **It shows you what ignoring it has already cost you.** This is the Regret Engine. Your balance chart has two lines. One is you. The other is a ghost line showing the version of you that acted on the advice the agent gave three months ago. The gap between the two lines is a real rupee number, and it gets wider every month you do nothing.

The word Pravah (प्रवाह) means flow. The main screen shows your money as a flow, so the name matches what you see.

---

## 2. Why this wins, and what nobody else will build

Almost every team on PS04 today will build the same product: upload a CSV, show a table of categorized transactions, draw a pie chart, add a chat box called "your AI coach", and put progress bars on some goals. That is the default answer to this problem statement.

Here is what we do that they will not.

**2.1 The rules are visible and editable.** Other teams will send each transaction to an LLM and show you the category it returned. If it is wrong, you fix it and nothing is learned. We generate an actual rule from your correction, show you the rule in plain English, and apply it backwards over your history. A judge can watch 14 old transactions re-categorize in front of them. This is the strongest single thing we can do for the AI integration score, because the judge can see the intelligence instead of taking our word for it.

**2.2 Scenario branching with a diff view.** Other teams will build one slider that changes one number. We treat each "what if" as a saved, named scenario that you can come back to, and we let you compare two of them side by side. This is also the correct way to model what-if questions, not a feature bolted on at the end.

**2.3 The Regret Engine.** No shipped budgeting app does this, because products avoid making users feel bad. It costs us almost nothing to compute and it is the most memorable moment in the whole demo.

**2.4 Indian input formats.** We accept a pasted dump of bank SMS alerts (HDFC, ICICI, SBI, Axis) and screenshots from UPI apps such as GPay and PhonePe. This is how most Indians actually see their money. Teams building for a generic "upload your bank CSV" flow are solving an American problem. This is cheap to add and it proves we understood the user, which is worth 20 percent of the score.

**2.5 The invisible salary.** One number, shown large on the main screen: what percentage of your income is already spent before it arrives. Fixed costs plus active subscriptions, divided by income. Nobody computes this and everybody feels it.

**2.6 Honest numbers with an uncertainty band.** Our projections are shown as a range, not a single confident line, because future spending is not known. This looks more sophisticated and it is more truthful.

**2.7 No AI-generated numbers.** Every rupee figure in the app comes from arithmetic we wrote, not from a language model. The model explains, categorizes, and extracts. It never calculates. We say this out loud in the demo, because a judge who has seen three hallucinated projections already will notice.

---

## 3. The eight PS requirements, and exactly how each one is met

The problem statement lists eight things we must build. All eight are in scope. None get dropped. Depth goes into the ones that score.

### 3.1 Ingestion of bank statements in messy formats, with automatic categorization

Four input paths, all on one import screen as tabs:

- **CSV.** Any column order. We detect which column is date, which is amount, which is description, and whether debit and credit are separate columns or one signed column.
- **SMS paste.** A big text box. Paste a dump of transaction alert messages. We parse amount, merchant, date, account tail, and direction with regex patterns per bank, and fall back to the LLM for messages that do not match any pattern.
- **PDF.** Extract the text layer first. If the text is usable, parse it. If the page is a scan, send the page image to a vision model and ask for rows. We do not build a layout parser. That is a trap that eats a whole day.
- **UPI screenshot.** Upload a screenshot of a GPay or PhonePe history screen. Vision model returns the transactions.

Categorization runs in three stages, in this order:
1. Match against learned rules. Instant, free.
2. Match against a built-in starter list of about 150 common Indian merchants (Swiggy, Zomato, Blinkit, BigBasket, IRCTC, Jio, Airtel, Uber, Ola, Rapido, DMart, and so on).
3. Whatever is left goes to the LLM in batches of 40, with the category list in the prompt. It returns a category and a confidence score for each.

Anything the LLM returns with low confidence gets flagged for review instead of being silently accepted.

### 3.2 A correction loop where the user fixes a category and the system learns the rule

This is the core. The flow:

1. User changes a transaction's category in the review list.
2. We send the raw description, the old category, the new category, and a few other transactions from the same merchant to the LLM, and ask it to propose a general rule, not a rule for this one row.
3. We show the proposed rule to the user before saving it. For example: "Rule: description contains SWIGGY, category is Dining. This matches 14 past transactions." The user confirms or edits it.
4. On confirm, we save the rule, re-run it over the full history, and show a toast saying how many rows changed.
5. The rule appears in the Rulebook screen with a timestamp and the transaction it was learned from.

Rule types we support: description contains text, merchant equals, amount in a range combined with a description match, and recurring-on-a-date. Keep it to these four. More types add bugs, not points.

### 3.3 Recurring payment and subscription detection, with alerts when one changes or goes unused

Detection is pure arithmetic, no LLM. Group transactions by normalized merchant name. A merchant is recurring if it appears three or more times, with a gap between charges of roughly 28 to 31 days (monthly), 7 days (weekly), or 365 days (yearly), and an amount that stays within 5 percent.

Three alert types:
- **Changed.** The amount went up or down. We show both amounts and the date it changed. The LLM writes a one-line guess at why, such as "this looks like a plan upgrade" or "this looks like the end of an introductory price".
- **Unused.** Flagged when the subscription is in a category the user has marked as discretionary and there has been no related activity. For the demo, we also allow the user to mark a subscription as unused themselves, which is honest because we cannot see app usage from a bank statement. Do not pretend otherwise. A judge will ask.
- **New.** A recurring payment that started in the last 60 days.

The **subscription graveyard** is a small panel listing everything you pay for and do not use, with the yearly total at the top. One screenshot, instantly understandable.

### 3.4 A persistent financial profile

Stored and editable: monthly income, fixed costs as a list with name and amount, emergency fund target and current amount, and goals. Each goal has a name, a target amount, a target date, and a priority order.

The profile is pre-filled from the imported data wherever possible. Income is guessed from the largest regular credit. Fixed costs are pre-filled from detected recurring payments. The user confirms or edits. Never make the user type in what we can already see.

### 3.5 A goal planner with what-if simulation

**This is the hero feature. Build it first and build it properly.**

The projection is deterministic math, written by us, no LLM:

```
monthly_income     = from profile
monthly_fixed      = sum of detected recurring + confirmed fixed costs
monthly_variable   = trailing 3 month average per category, with scenario adjustments applied
monthly_surplus    = monthly_income - monthly_fixed - monthly_variable
balance[month + 1] = balance[month] + monthly_surplus
```

Goals are funded from the surplus in priority order. A goal's projected date is the first month where the money allocated to it reaches its target.

For the uncertainty band, run the same projection three times: with variable spending at its average, at average plus one standard deviation of the last six months, and at average minus one. That gives an optimistic line, a likely line and a pessimistic line, which we draw as a shaded cone.

**Scenarios.** A scenario is a saved set of assumptions on top of the base projection. Supported assumptions:
- change a category by a percentage or a fixed amount
- change income
- add a one-off expense on a date
- add or remove a recurring cost
- change a goal's target amount or date

A scenario has a name and a parent, so scenarios can build on each other. "main" is the current trajectory and cannot be deleted.

**Natural language to scenario.** The user types a sentence such as "what if I move to Bangalore and rent goes to 25k and I lose the metro pass". The LLM converts that sentence into the structured assumption list, we show the user what it understood as editable fields, and the projection re-runs. This is a strong agentic demo beat and it is not hard, because the output is a small fixed schema.

**Diff view.** Pick two scenarios. Show side by side: projected balance in 12 months, each goal's projected date in both, which goals get missed, and the monthly surplus in both. Highlight what changed.

### 3.6 Nudges when spending drifts off plan

Each category gets a monthly expected amount from its trailing average. Mid-month, if actual spending is tracking more than 20 percent above the expected pace, raise a nudge.

A nudge is specific and shows its working. Not "you are spending too much on food". Instead: "Dining is at ₹4,200 with 11 days left in the month. Your usual full month is ₹3,100. The three transactions driving this were on the 4th, 9th and 12th." Then the projected effect: "If this continues, your bike goal moves from June to August."

Every nudge links to the transactions behind it. Click any number anywhere in PRAVAH and you see the rows that produced it. Call this **provenance**, and make sure it works everywhere, because it is the cheapest trust feature in the build.

### 3.7 A monthly review report

A generated page covering: total in and out, spend per category against the previous month, new and changed recurring payments, goal progress against plan, nudges raised and whether they were acted on, and the single biggest opportunity for next month.

The numbers are computed. The LLM writes the narrative around them. Exportable as a PDF or at least printable.

### 3.8 Clear guardrails

PRAVAH educates and models scenarios. It does not recommend specific securities, stocks, mutual funds, or insurance products.

This must be visible, not just in the system prompt:
- A short line in the footer stating the boundary.
- If the user asks "which mutual fund should I buy", the agent says clearly what it does not do, explains the general idea they are asking about, such as what a SIP is, and offers to model the goal instead. It then shows what monthly amount would reach their goal by their date. That is genuinely more useful than a product name.
- Log these refusals and show them in the demo. An agent that states its own limits reads as trustworthy, not limited.

---

## 4. Screens

Eight screens. Each is mostly one component.

| # | Screen | What it holds |
|---|--------|---------------|
| 1 | Import | Four tabs (CSV, SMS, PDF, UPI screenshot). Parse progress. Count of categorized versus needs review. |
| 2 | Review | Transaction list, low confidence rows pinned at top. Category editing. Rule proposal popup. |
| 3 | Rulebook | Every learned rule in plain English, with source transaction, match count, edit and delete. |
| 4 | Flow (main) | Sankey diagram of income to fixed to variable to savings. Leaks for unused subscriptions. Timeline scrubber below. Invisible salary number shown large. |
| 5 | Scenarios | Scenario list, assumption editor, natural language input box, two-scenario diff view. |
| 6 | Ghost | Balance chart with the real line and the ghost line. The regret number. List of advice given and not taken. |
| 7 | Goals and Profile | Income, fixed costs, emergency fund, goals with dates and priorities. |
| 8 | Monthly Review | The generated report. |

Screen 4 is the landing screen after import. Screen 4 and screen 5 are where the demo spends most of its time.

---

## 5. Data model

```
transaction
  id, date, amount, direction, raw_description, merchant_normalized,
  category, category_source (rule | starter_list | llm | user), confidence, source_file

rule
  id, type (contains | merchant_equals | amount_range | recurring_date),
  pattern, category, learned_from_transaction_id, created_at, match_count, active

recurring
  id, merchant_normalized, amount, previous_amount, cadence,
  first_seen, last_seen, status (active | changed | unused | new)

profile
  monthly_income, emergency_fund_target, emergency_fund_current, currency

fixed_cost
  id, name, amount, linked_recurring_id

goal
  id, name, target_amount, target_date, priority, allocated_so_far

scenario
  id, name, parent_id, assumptions (json), created_at, is_main

advice
  id, date_given, text, projected_monthly_saving, accepted (bool), acted_on_date
```

The `advice` table is what makes the Regret Engine work. The ghost line is computed by taking every piece of advice where `accepted` is false, summing its `projected_monthly_saving`, and compounding that forward from the date it was given.

**Important and be honest about this:** for the demo, the advice history has to be seeded, because the app has not been running on a real user for three months. Seed four or five pieces of advice across the past six months with realistic dates and savings amounts. This is normal demo data preparation, not cheating, but know the answer when a judge asks how the ghost line has history on day one. The answer is that the seeded profile represents a user who has had PRAVAH for six months.

---

## 6. Where AI is used, and where it is deliberately not

**AI is used for:**
1. Categorizing the transactions that no rule matched, in batches.
2. Normalizing messy merchant strings into clean names.
3. Proposing a general rule from a single user correction. This is the most interesting use in the whole build.
4. Explaining why a recurring payment changed.
5. Turning a typed sentence into a structured scenario.
6. Writing the narrative of the monthly review around computed numbers.
7. Generating the top three savings opportunities with reasons, which then feed the advice table.
8. Vision: reading UPI screenshots and scanned PDF pages into transaction rows.

**AI is deliberately not used for:** any projection, any goal date, any balance, any total, any rule matching, any recurring detection. All of that is arithmetic we wrote.

Say this explicitly in the demo and in the LinkedIn posts. It is a real engineering position and it separates us from teams whose coach makes up numbers.

---

## 7. Demo script, 90 seconds

The hero moment has to land inside the first 30 seconds. Judges decide early.

1. **0:00 to 0:10.** Paste a dump of bank SMS messages. Nothing else, just a paste. 180 transactions appear, categorized, with 12 flagged as uncertain. Say: "This is how most Indians see their money, so this is where we start."
2. **0:10 to 0:25.** Fix one wrong category. The rule proposal appears. Confirm it. 14 past transactions re-categorize live. Open the Rulebook and scroll. Say: "It did not just fix one row. It learned a rule, and you can read every rule it has."
3. **0:25 to 0:45.** Land on the Flow screen. Point at the invisible salary number. Drag the timeline into the future. Show the uncertainty cone and the bike goal marker sitting on June.
4. **0:45 to 1:05.** Type "what if rent goes up by 6000 and I cut eating out by a third". Scenario builds itself. Goal marker slides to August. Open the diff view against main.
5. **1:05 to 1:20.** Open the Ghost screen. Two lines. Say the number out loud: "The version of you that cancelled three subscriptions in July has ₹14,200 more than you, and already owns the bike."
6. **1:20 to 1:30.** Ask it which mutual fund to buy. It declines clearly, explains the concept, and shows the monthly amount needed to hit the goal instead. Close on that.

---

## 8. Build order

The architect skill will turn this into a real plan. The ordering principle, given that submission closes at 11:59 PM tonight:

1. Synthetic data generator first. Everything downstream depends on it.
2. CSV and SMS ingestion plus the three-stage categorization.
3. Projection math and the goal engine.
4. Flow screen with the timeline scrubber. This is the hero, so it gets built while energy is high.
5. Correction loop and Rulebook.
6. Scenarios with the diff view.
7. Ghost screen.
8. Recurring detection, graveyard, nudges.
9. Monthly review and guardrails.
10. PDF and UPI screenshot ingestion. These are the most impressive inputs but also the most likely to break, so they go last and the demo falls back to SMS if they are not ready.

Build the demo path end to end before widening anything.

---

## 9. Synthetic data we need

Write this generator in the first hour. Eight months of transactions for one fictional user. It must contain, on purpose:

- A believable salary credit on the same date each month.
- Rent, phone, electricity, and four subscriptions as clean recurring payments.
- One subscription that silently goes from ₹199 to ₹499 in month five. This is the "changed" alert.
- One subscription paid every month that the user never benefits from. This is the graveyard.
- Dining and food delivery spending that is clearly rising month over month. This is the drift nudge.
- Enough messy merchant strings that categorization has real work to do, for example `UPI/SWIGGY*ORDER/412//HDFC` rather than `Swiggy`.
- A handful of transactions that no rule will match, so the correction loop has something to do live.
- Four or five seeded pieces of past advice, marked as not accepted, so the ghost line has history.

Also produce the same data in three formats: a CSV, a block of SMS text, and a simple PDF, so all three import paths can be demonstrated from one dataset.

---

## 10. Problems I Anticipate (and Solutions)

**Bank statement PDFs will eat the whole day if you let them.** Real Indian bank PDFs have inconsistent layouts and building a parser for them is a trap. Solution: CSV and SMS are the first-class paths and they carry the demo. PDF goes through text extraction plus an LLM pass, never a layout parser, and it is built last.

**No real transaction data, and you cannot put your own bank statement on a demo stream.** Solution: the synthetic generator in section 9, built in hour one, seeded with the exact stories the demo needs to tell.

**LLM categorization is slow and unreliable at volume.** Sending 900 transactions one at a time will take minutes and some calls will fail. Solution: rules and the starter merchant list handle the bulk for free, the LLM only sees the unmatched tail, in batches of 40, with retries and a cached result per unique description string. This is also the honest architecture, not a shortcut.

**The Sankey flow diagram is the single most likely thing to swallow four hours.** Solution: timebox it, and decide right now what the fallback is. The fallback is a stacked horizontal bar of the same data, which carries the same information and takes 20 minutes. Make that call by a fixed hour, not at 9 PM.

**Eight requirements in nine hours means everything is 70 percent done and nothing demos.** Solution: build the full demo path end to end first, with the hero working, then widen. If time runs out, the remaining requirements exist as real but shallow features rather than half-broken ones.

**The natural-language-to-scenario feature will return a slightly wrong structure sometimes.** Solution: never apply it silently. Always show what it understood as editable fields before running the projection. A visible, correctable mistake looks like good design. A silent one looks broken.

**The ghost line invites the question "how do you have six months of history?"** Solution: have the answer ready, as written in section 5. Do not get caught improvising.

**The unused-subscription claim is not actually knowable from a bank statement.** A sharp judge will catch this. Solution: do not claim we detect app usage. We detect the payment and ask the user to confirm it is unused, or infer it from the absence of related spending. Say this plainly in the demo. Admitting one honest limit buys more credibility than it costs.

**LinkedIn is worth 15 percent plus up to 10 bonus points, which is as heavy as AI integration, and it is the first thing a tired team drops.** Solution: your teammate owns LinkedIn and the demo video completely, starting now, not at 10 PM. Post one goes up within the next 30 minutes.

**Two people, one codebase, merge conflicts at hour seven.** Solution: if the teammate is doing LinkedIn, video and the submission writeup, they do not touch the repo at all. One builder, one storyteller. Cleanest split for a nine-hour build.

**Demo recording left until the last 20 minutes.** Solution: record a rough version as soon as the hero path works, around hour five, even if it is ugly. Then re-record if there is time. Never be in a position where there is no video at all.

---

## 11. Explicitly out of scope

Say no to these now, so the build does not wander:

- No real bank API or account linking.
- No login, no multi-user, no accounts.
- No mobile app. Responsive web is enough.
- No actual investment or securities advice, by design.
- No payment execution or subscription cancellation on the user's behalf. We can draft a cancellation message. We do not send it.
- No bill negotiation.
- No credit score features.

---

## 12. Enabling technology

The stack is not locked here. That is the architect's job. The capabilities we need are:

- A web UI with charting, including a flow or Sankey style diagram and a draggable timeline.
- A language model with structured output support, for categorization, rule proposal, scenario extraction and narrative writing.
- A vision-capable model for screenshots and scanned PDF pages.
- PDF text extraction.
- Local persistence that survives a page refresh. A real database is not required for a one-day build but state must not vanish.

---

## 13. Scoring, and where the points come from

| Criterion | Weight | What earns it here |
|-----------|--------|--------------------|
| Prototype quality and UX | 25% | Eight working screens, the flow hero, provenance on every number, nothing visibly broken in the demo path. |
| AI integration | 25% | Eight distinct, visible uses of the model. The rulebook makes the learning legible. No AI-generated numbers. |
| Problem understanding | 20% | SMS and UPI ingestion, the invisible salary, honest limits stated out loud, all eight requirements addressed. |
| LinkedIn content and engagement | 15% + up to 10 bonus | Three posts, owned by the teammate, starting immediately. Lead with the ghost-line visual. |
| Innovation and creativity | 15% | The Regret Engine, scenario branching with diff, the learned-rule glass box. |
