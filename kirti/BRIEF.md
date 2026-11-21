# Kirti's Brief: RIPPLE Ingestion Layer

Paste this whole file into Antigravity. It is self-contained.

## 0. Context in one minute

**RIPPLE** is our entry for the Product Space Agentic AI Hackathon (PS04: personal finance coach with a living money model). Submission closes **today, 21 Nov 2026, 11:59 PM IST**. It is a "money twin" for an Indian user: it ingests their bank data, learns categorization rules from their corrections, projects their future balance with scenarios, and shows what ignoring past advice has cost them.

**You own the ingestion layer.** Every screen in the app starts from the transactions your module produces. The demo opens with a user pasting a dump of Indian bank SMS alerts, and that paste goes through your SMS parser. CSV import goes through your CSV parser. The synthetic dataset every feature is tested against comes from your generator. It is on the critical path and it is needed first.

Rehaan is building the app in `src/` against a reference fixture (`contract/fixture.json`) so neither of you blocks the other. At integration (target **17:30 IST**) your module replaces the fixture path. Ship to that time.

## 1. Repo, branch, boundaries

- Repo: `https://github.com/RAK2315/ripple`
- Clone, then work **only on branch `kirti/ingestion`** (already created): `git checkout kirti/ingestion`
- Run `npm install` once at the repo root. Everything you need (`typescript`, `vitest`, `zod`, `ai`, `@ai-sdk/anthropic`) is already installed.
- **Your code lives in `kirti/` only.** Do not create or edit files anywhere else. Do not edit `package.json`, `tsconfig.json`, `contract/`, `src/`, `rehaan/`, or any root `.md`. If you truly need a new npm package, message Rehaan instead of installing it.
- **Dependency rule (one way):** `kirti/` imports only from `../contract/types` and npm packages. It never imports from `src/` or `rehaan/`. `src/` imports your exported functions. Nothing else crosses.
- Plain TypeScript, ESM, no framework code. No React. Pure functions where possible.

Required files:

```
kirti/
  BRIEF.md            (this file)
  index.ts            re-exports parseCsv, parseSms, generateSyntheticData, renderCsv, renderSmsDump
  csv.ts              parseCsv
  sms.ts              parseSms (+ per-bank regex patterns, can be split into sms-patterns.ts)
  generator.ts        generateSyntheticData, renderCsv, renderSmsDump
  dates.ts / money.ts helpers as you like
  __tests__/          vitest tests (*.test.ts)
  samples/            sample inputs you test against (CSVs, SMS dumps)
```

## 2. The frozen contract (inline copy of `contract/types.ts`)

The contract is frozen. Do not change it. If you think it is wrong, tell Rehaan; changes happen only by agreement. Import these types with `import type { ... } from "../contract/types";`.

### Pinned representation rules

| Thing | Rule |
|---|---|
| Date | String `"YYYY-MM-DD"` (IST calendar date). No time, no `Date` objects in output. Indian banks are **always day-first**: `14/11/26` is 14 Nov 2026. |
| Amount | **Integer paise, always positive.** ₹1,234.50 → `123450`. Handle Indian grouping `1,12,430.55`. Never floats, never negative. Use `Math.round(parseFloat(clean) * 100)`. |
| Direction | Separate field: `"debit"` (money out) or `"credit"` (money in). |
| account_tail | Trailing digits as shown, digits only, 3 or 4 chars (`"4821"`, ICICI shows `"903"`), or `null`. |
| raw_description | Trimmed, internal whitespace collapsed to single spaces, otherwise verbatim. Never empty. |
| Categorization fields | `merchant_normalized`, `category`, `category_source`, `confidence` are **always `null`** in your output. The app fills them. |

### Types

```ts
export const CONTRACT_VERSION = "1.0.0";
export type Direction = "debit" | "credit";
export const CATEGORIES = ["Income","Rent","Utilities","Phone & Internet","Subscriptions","Groceries","Dining",
  "Transport","Fuel","Shopping","Health","Fitness","Entertainment","Travel","Education","EMI & Loans",
  "Insurance","Family Transfer","Transfers","Cash Withdrawal","Fees & Charges","Other"] as const;
export type Category = (typeof CATEGORIES)[number];
export type CategorySource = "rule" | "starter_list" | "llm" | "user";
export type SourceKind = "csv" | "sms" | "pdf" | "upi_screenshot" | "synthetic";

export interface Transaction {
  id: string;                 // unique within result, ^[a-z0-9_-]{1,64}$  e.g. "csv_0001", "sms_0001", "syn_0001"
  date: string;               // "YYYY-MM-DD"
  amount: number;             // integer paise > 0
  direction: Direction;
  raw_description: string;
  account_tail: string | null;
  source_kind: SourceKind;    // "csv" | "sms" | "synthetic" for you
  source_file: string;        // file name, "sms-paste", or "synthetic"
  source_line: string;        // verbatim original CSV line or full SMS text (keep \n in multi-line SMS)
  merchant_normalized: null;  // always null from you
  category: null;             // always null from you
  category_source: null;      // always null from you
  confidence: null;           // always null from you
}
// All 13 keys always present. No extra keys.

export type UnparsedReason = "empty" | "header_undetected" | "no_amount" | "bad_amount" | "no_date"
  | "bad_date" | "no_pattern" | "not_a_transaction" | "llm_failed";
export interface UnparsedRow { index: number; raw: string; reason: UnparsedReason; detail?: string }
export interface ParseResult {
  transactions: Transaction[];
  unparsed: UnparsedRow[];
  stats: { total_inputs: number; parsed: number; unparsed: number; via_llm: number };
}
export interface SmsLlmRow { is_transaction: boolean; date: string | null; amount: number | null;
  direction: Direction | null; merchant: string | null; account_tail: string | null }
export type SmsLlmFallback = (messages: string[]) => Promise<Array<SmsLlmRow | null>>;

export interface Advice { id: string; date_given: string; text: string; projected_monthly_saving: number;
  accepted: boolean; acted_on_date: string | null }
export interface Fixture { contract_version: string; generated_at: string; user: { name: string; city: string };
  transactions: Transaction[]; advice: Advice[] }
export interface GenerateOptions { seed?: number; months?: number; endDate?: string }
```

### Exact function signatures you export

```ts
// kirti/csv.ts — synchronous, pure, NEVER throws
export function parseCsv(text: string, opts?: { sourceFile?: string }): ParseResult;

// kirti/sms.ts — NEVER throws (catch everything, report in unparsed)
export function parseSms(text: string, opts?: {
  sourceFile?: string;          // default "sms-paste"
  referenceDate?: string;       // "YYYY-MM-DD"; resolves 2-digit years and year-less dates; default today in IST
  llmFallback?: SmsLlmFallback; // injected by the app. If absent, messages matching no pattern => unparsed "no_pattern"
}): Promise<ParseResult>;

// kirti/generator.ts
export function generateSyntheticData(opts?: GenerateOptions): Fixture; // defaults: seed 42, months 8, endDate "2026-11-20"
export function renderCsv(fixture: Fixture): string;      // header "Date,Narration,Amount", amount signed rupees, debit negative
export function renderSmsDump(fixture: Fixture): string;  // one SMS per transaction (bank templates below), "\n\n" between
```

### Invariants (test all of them)

- `stats.parsed === transactions.length`, `stats.unparsed === unparsed.length`, `stats.parsed + stats.unparsed === stats.total_inputs`.
- Every input either becomes a Transaction or an UnparsedRow. **Nothing is silently dropped.** Blank lines in CSV are skipped and not counted; anything else that fails is reported.
- `UnparsedRow.index` is 1-based: for CSV, the line number in the file (header is line 1, first data row is 2); for SMS, the message number in split order.
- `ids` unique: `csv_0001…`, `sms_0001…`, `syn_0001…` in input order (only for parsed rows).

## 3. Task A: synthetic data generator (`kirti/generator.ts`) — do this first

Eight months of transactions for one fictional user, **Aarav Mehta, Pune**, ending `2026-11-20` (months Apr–Nov 2026, Nov is partial), deterministic from a seed (write a tiny LCG PRNG; no `Math.random`). All transactions `source_kind: "synthetic"`, `source_file: "synthetic"`, `source_line` = the rendered CSV line for that row. Sorted ascending by date.

Accounts: HDFC savings tail `"4821"` (salary, rent, bills, most UPI), HDFC debit card tail `"7719"` (POS and card charges), ICICI savings tail `"903"` (groceries, transport, some UPI).

It **must** contain, on purpose, these stories (the demo depends on every one):

1. **Salary** ₹85,000 credit on the 1st of every month: `NEFT CR-CITI0000002-ACME TECHNOLOGIES PVT LTD-SALARY NOV 2026`.
2. **Clean recurring**: rent ₹22,000 on the 3rd (`UPI/RAMESH KULKARNI/<ref>/RENT NOV/HDFC`), electricity ₹1,450–1,495 on the 9th (`BIL/BPAY/000<9 digits>/MSEDCL PUNE ELECTRICITY`), Jio ₹349 on the 14th (`UPI/RELIANCE JIO/<ref>/Recharge/HDFC`), family transfer ₹10,000 on the 2nd (`UPI/SUNITA MEHTA/<ref>/Maa monthly/HDFC`), metro pass ₹1,200 on the 5th (`UPI/PUNE METRO RAIL CORP/<ref>/pass recharge/HDFC`).
3. **Four subscriptions**: Netflix on the 7th (`POS 4591XXXXXXXX7719 NETFLIX.COM MUMBAI IN`, card 7719), Spotify ₹119 on the 12th (`UPI-AUTOPAY/SPOTIFY INDIA/<ref>/mandate/HDFC`), YouTube Premium ₹129 on the 18th (`GOOGLE*YOUTUBE PREMIUM G.CO/HELPPAY# 7719`, card 7719), cult.fit ₹1,299 on the 2nd (`UPI/CUREFIT HEALTHCARE/<ref>/cult pass elite/HDFC`).
4. **Changed subscription**: Netflix is ₹199 for months 1–4 and **₹499 from month 5 (August)** onward.
5. **Unused subscription**: cult.fit, charged every month, with zero other fitness-related spending anywhere in the data.
6. **Rising dining**: Swiggy/Zomato/restaurant spend clearly rising month over month (roughly ₹3k in April to ₹12k+ in October; November already ~₹15k by the 20th). Strings: `UPI/SWIGGY*ORDER/<3 digits>//HDFC`, `UPI-ZOMATO LTD-ZOMATO.PAYU@HDFCBANK-HDFC0000001-<ref>-PAYMENT`, `POS 4591XXXXXXXX7719 BARBEQUE NATION PUNE` / `STARBUCKS KOREGAON PK` / `VAISHALI RESTAURANT` / `SOCIAL BANER`.
7. **Messy merchant strings everywhere**: groceries via `UPI/BLINKIT/<ref>/Order/ICICI`, `UPI/ZEPTO MARKETPLACE/<ref>//ICICI`, `UPI/INNOVATIVE RETAIL CONCEPTS/<ref>/bigbasket/ICICI`, `POS ... DMART AUNDH PUNE`; transport via `UPI/UBER INDIA/...`, `UPI/ANI TECHNOLOGIES OLA/...`, `UPI/RAPIDO/...`; plus fuel (`HPCL SAI PETROLEUM PUNE`), shopping (`AMAZON PAY INDIA PVT LTD/<ref>`, Myntra, Flipkart), Apollo Pharmacy, BookMyShow, monthly ATM (`ATW-4591XXXXXXXX7719-S1ANPN04-PUNE` ₹3,000).
8. **Rows no rule will match**: **exactly 14** `UPI/BHAGWATI TIFFIN SERVICE/<ref>/lunch/HDFC` (₹110–180, two per month Apr–Oct; this is the live correction demo), plus scattered `POS ... SHREE SAI GENERAL STORES`, `UPI/Q<9 digits>@YBL/payment/ICICI`, `UPI/KAKA HALWAI SWEET MART/...`, `UPI/98<8 digits>@YBL/sent via phonepe/HDFC`.
9. **New recurring**: `UPI/COUNTRY DELIGHT/<ref>/weekly milk/ICICI` ₹420 every Saturday from 3 Oct 2026.
10. Extras: quarterly interest credits (`INT.PD:50100234594821:01-04-2026 TO 30-06-2026`), one refund credit, quarterly `SMS CHARGES FOR QTR ENDED JUN26 INCL GST` ₹17.70.
11. **Advice** (4–5 items, `accepted: false`, `acted_on_date: null`), amounts in paise:
    - `adv_001` 2026-05-18 "Food delivery is at ₹4,900 this month and climbing. Cap it at ₹3,400 a month." 150000
    - `adv_002` 2026-07-04 "Cancel cult.fit Elite. ₹1,299 a month and no fitness-related spending in three months." 129900
    - `adv_003` 2026-07-04 "Cancel YouTube Premium. You already pay for Spotify for music." 12900
    - `adv_004` 2026-08-22 "Netflix went from ₹199 to ₹499 in August. Drop back to the Mobile plan." 30000
    - `adv_005` 2026-09-15 "Dining is up sharply since April. Cooking two more nights a week saves about ₹2,800." 280000

The reference instance is `contract/fixture.json` (made by `scripts/generate-fixture.mjs`, which you may read for reference but must not import). Your output should tell the same stories; it does not need to be byte-identical.

`renderSmsDump` templates per transaction (pick by account tail):
- credit → HDFC credit template (example 2 below)
- tail `903` → ICICI debit template (example 4)
- tail `7719` → HDFC card template (example 3)
- otherwise → HDFC UPI template (example 1)

Write the outputs to `kirti/samples/` too: `synthetic.json`, `synthetic.csv`, `synthetic-sms.txt`.

## 4. Task B: CSV parser (`kirti/csv.ts`)

Must handle real Indian bank exports, not just our own CSV:

- **Any column order.** Detect the header row (may not be line 1: banks put account details above it; scan the first 30 lines for the first row containing a date-like header or whose next row parses as a date). If no header can be found, return everything as one `unparsed` row with reason `header_undetected`.
- **Column detection** by header name first, then by content:
  - date: `date`, `txn date`, `transaction date`, `value date` (prefer txn date over value date)
  - description: `narration`, `description`, `particulars`, `remarks`, `details`
  - amount, two cases:
    - **separate columns**: `withdrawal`/`debit`/`dr` and `deposit`/`credit`/`cr` (e.g. `Withdrawal Amt.`, `Deposit Amt.`). Whichever is non-empty and non-zero decides direction.
    - **single signed column**: `amount`. Negative or suffixed `Dr` → debit; positive or `Cr` → credit. Also support an `amount` column plus a `type`/`dr/cr` column.
  - ignore balance columns (`balance`, `closing balance`).
- Quoted fields with commas (`"1,234.50"`), Indian grouping, `₹`/`Rs.`/`INR` prefixes, trailing `Dr`/`Cr`, empty cells, `\r\n` line endings.
- Dates: `DD/MM/YY`, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD-MMM-YY`, `DD MMM YYYY`, `YYYY-MM-DD`. Always day-first.
- Per row failures go to `unparsed` (`no_date`, `bad_date`, `no_amount`, `bad_amount`, `empty` for a row with only separators). Footer lines like `*** End of statement ***` → `not_a_transaction`.
- `account_tail` is null for CSV unless the header block contains an account number like `Account No : XXXXXXXX4821` (then use its last 4 for every row).

Worked example (must pass exactly):

```
Txn Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
14/11/26,UPI/SWIGGY*ORDER/412//HDFC,0000431298765432,"1,234.50",,"45,120.10"
```
`parseCsv(text, { sourceFile: "hdfc_nov.csv" })` →
```json
{ "transactions": [{
    "id": "csv_0001", "date": "2026-11-14", "amount": 123450, "direction": "debit",
    "raw_description": "UPI/SWIGGY*ORDER/412//HDFC", "account_tail": null,
    "source_kind": "csv", "source_file": "hdfc_nov.csv",
    "source_line": "14/11/26,UPI/SWIGGY*ORDER/412//HDFC,0000431298765432,\"1,234.50\",,\"45,120.10\"",
    "merchant_normalized": null, "category": null, "category_source": null, "confidence": null }],
  "unparsed": [], "stats": { "total_inputs": 1, "parsed": 1, "unparsed": 0, "via_llm": 0 } }
```

Also test the signed-column case with `public/demo/statement.csv` from the repo (header `Date,Narration,Amount`, amount negative for debits): it must parse all 361 rows with 0 unparsed.

## 5. Task C: SMS parser (`kirti/sms.ts`)

**Splitting:** if the pasted text contains a blank line, each blank-line-separated block is one message; otherwise each non-empty line is one message. `total_inputs` = number of messages.

**Per message:** try each bank's regex patterns (HDFC, ICICI, SBI, Axis; several patterns per bank: UPI debit, UPI credit, card spend, NEFT/IMPS credit). First match wins. Extract amount, merchant/payee, date, account tail, direction. Non-transactions (OTP, "will be debited", promotional, balance enquiry, failed/declined) → `unparsed` `not_a_transaction`. Detect these **before** pattern matching.

**raw_description:** the merchant/payee/narration exactly as written in the SMS. If the message has no payee at all, use `"<BANK> <CREDIT|DEBIT>"` plus `" REF <ref>"` if a reference number is present, e.g. `"SBI CREDIT REF 431298712345"`.

**LLM fallback:** collect every message that is not a non-transaction and matched no pattern. If `opts.llmFallback` exists, call it **once** with all of them (array of strings) and map results back by position: `null` → `unparsed` `llm_failed`; `is_transaction: false` → `not_a_transaction`; missing date or amount → `no_date`/`no_amount`; otherwise a Transaction (`raw_description` = `merchant` or the fallback rule above). Count these in `stats.via_llm`. If the fallback throws, every message sent to it becomes `llm_failed`. If `llmFallback` is absent, those messages become `no_pattern`.

The app injects the real fallback because it masks account numbers, names and phone numbers before any model call and shows the user the exact payload. For your own testing write a mock fallback in tests. Do not put an API key or a live model call in `kirti/` code paths that run by default.

### Example SMS and the exact objects they must produce

Use `referenceDate: "2026-11-21"`. All outputs have `source_kind: "sms"`, `source_file: "sms-paste"`, `source_line` = the full message text, and the four categorization fields `null`. Shown here: the fields that vary.

**1. HDFC UPI debit (multi-line)**
```
Sent Rs.412.00
From HDFC Bank A/C *4821
To SWIGGY
On 14/11/26
Ref 431298765432
Not You?
Call 18002586161/SMS BLOCK UPI to 7308080808
```
→ `{ date: "2026-11-14", amount: 41200, direction: "debit", raw_description: "SWIGGY", account_tail: "4821" }`

**2. HDFC NEFT credit**
```
Update! INR 85,000.00 deposited in HDFC Bank A/c XX4821 on 01-NOV-26 for NEFT CR-CITI0000002-ACME TECHNOLOGIES PVT LTD-SALARY NOV 2026. Avl bal INR 1,12,430.55.
```
→ `{ date: "2026-11-01", amount: 8500000, direction: "credit", raw_description: "NEFT CR-CITI0000002-ACME TECHNOLOGIES PVT LTD-SALARY NOV 2026", account_tail: "4821" }` (note: the balance is not the amount)

**3. HDFC debit card**
```
Spent Rs.499.00 On HDFC Bank Card 7719 At NETFLIX.COM On 2026-11-07:10:12:44 Not You? Call 18002586161
```
→ `{ date: "2026-11-07", amount: 49900, direction: "debit", raw_description: "NETFLIX.COM", account_tail: "7719" }`

**4. ICICI UPI debit**
```
ICICI Bank Acct XX903 debited for Rs 250.00 on 12-Nov-26; ZOMATO LTD credited. UPI:431209876543. Call 18002662 for dispute. SMS BLOCK 903 to 9215676766.
```
→ `{ date: "2026-11-12", amount: 25000, direction: "debit", raw_description: "ZOMATO LTD", account_tail: "903" }`

**5. ICICI credit**
```
Dear Customer, Acct XX903 is credited with Rs 1,299.00 on 21-Aug-26 from AMAZON PAY. UPI:430912345678-ICICI Bank.
```
→ `{ date: "2026-08-21", amount: 129900, direction: "credit", raw_description: "AMAZON PAY", account_tail: "903" }`

**6. SBI UPI debit**
```
Dear UPI user A/C X4821 debited by 120.0 on date 12Nov26 trf to BHAGWATI TIFFIN Refno 431212345678. If not u? call 1800111109. -SBI
```
→ `{ date: "2026-11-12", amount: 12000, direction: "debit", raw_description: "BHAGWATI TIFFIN", account_tail: "4821" }`

**7. SBI UPI credit, no payee**
```
Dear SBI UPI User, ur A/cX4821 credited by Rs500 on 15Nov26 by (Ref no 431298712345)
```
→ `{ date: "2026-11-15", amount: 50000, direction: "credit", raw_description: "SBI CREDIT REF 431298712345", account_tail: "4821" }`

**8. Axis UPI debit (multi-line)**
```
INR 1200.00 debited
A/c no. XX4821
05-11-26, 10:15:32
UPI/P2M/431298765432/PUNE METRO RAIL
Not you? SMS BLOCKUPI Cust ID to 919951860002
Axis Bank
```
→ `{ date: "2026-11-05", amount: 120000, direction: "debit", raw_description: "PUNE METRO RAIL", account_tail: "4821" }`

**9. Axis credit**
```
INR 2,500.00 credited
A/c no. XX4821
18-11-26, 19:40:02
IMPS/P2A/431212398765/RAHUL SHARMA
Axis Bank
```
→ `{ date: "2026-11-18", amount: 250000, direction: "credit", raw_description: "RAHUL SHARMA", account_tail: "4821" }`

**10. OTP (not a transaction)**
```
Your OTP for txn of Rs 2,000 at AMAZON is 482913. Do not share it with anyone.
```
→ unparsed `{ reason: "not_a_transaction" }`

**11. No bank pattern (LLM fallback territory)**
```
Rs.640 paid to KAKA HALWAI via PhonePe on 10/11 from a/c ..4821
```
→ without `llmFallback`: unparsed `{ reason: "no_pattern" }`. With a mock fallback returning `{ is_transaction: true, date: "2026-11-10", amount: 64000, direction: "debit", merchant: "KAKA HALWAI", account_tail: "4821" }` → a Transaction with those values, `stats.via_llm: 1`.

Pasting all 11 (blank lines between) must give `total_inputs: 11`, `parsed: 9`, `unparsed: 2` without fallback.

Also: `parseSms` on `public/demo/sms-dump.txt` from the repo (361 messages, one per fixture transaction, our own demo paste) must parse all 361 with 0 unparsed. **This file is literally what gets pasted in the demo.**

## 6. Self-test before every push

Put tests in `kirti/__tests__/*.test.ts` (vitest; `import { describe, it, expect } from "vitest"`). Required:

1. The CSV worked example above, compared with `toEqual` on the full object.
2. A separate debit/credit column CSV with the header on line 4 (account details above it) and columns in a shuffled order.
3. A signed-amount CSV with `Dr`/`Cr` suffixes and `₹` prefixes.
4. `public/demo/statement.csv` → 361 parsed, 0 unparsed.
5. Each of the 11 SMS examples individually, full `toEqual` on the fields shown.
6. The 11-message combined paste → stats `{ total_inputs: 11, parsed: 9, unparsed: 2, via_llm: 0 }`, and with the mock fallback → `parsed: 10, via_llm: 1`.
7. `public/demo/sms-dump.txt` → 361 parsed, 0 unparsed.
8. Generator: deterministic for a seed; exactly 14 BHAGWATI rows; Netflix 19900 before Aug, 49900 from Aug; 5 advice all `accepted: false`; every transaction has all 13 keys with the four categorization fields null; dates valid; amounts positive integers.
9. A contract-shape check run over every Transaction any test produces: id pattern, date pattern, integer amount > 0, keys exactly the 13.

Run: `npx vitest run kirti` and `npx tsc --noEmit -p .` — both must be clean before you push.

## 7. Commit, push, PR

- Commit small and often on `kirti/ingestion` with clear messages (`ingestion: hdfc + icici sms patterns`). Push every hour so Rehaan can see progress.
- When all self-tests pass, open the PR into `main`:
  `gh pr create --base main --head kirti/ingestion --title "Ingestion layer: CSV + SMS parsers + synthetic generator" --body "<what works, test output summary, known gaps>"`
  (or open it from the GitHub web UI). Paste the `vitest` summary in the body. List anything not done as "Known gaps" explicitly.
- Target: PR open by **17:00 IST**, merged by **17:30 IST**. If something is not finished at 17:00, open the PR anyway with what passes and list the gaps. A working subset at 17:00 beats a complete module at 20:00.
- Message Rehaan the PR link when it is up.

## 8. After the merge: LinkedIn, demo video, submission writeup

Once your PR is merged you own **LinkedIn posts, the demo video, and the submission writeup**. These carry **15% of the score plus up to 10 bonus points**, as much as AI integration. They are not an afterthought.

**Post 1 goes up immediately, before you start coding.** Three posts total, each tagging **Product Space**:

1. **Now (kickoff):** that you are building RIPPLE at the Product Space Agentic AI Hackathon, and the problem: budgeting apps sort transactions into a pie chart and stop; they do not understand what you are trying to do with your money or change when your life does. RIPPLE is a money twin: it learns your rules from your corrections, lets you branch your future into scenarios, and shows what ignoring advice has already cost you. Mention we start from how Indians actually see their money: bank SMS alerts and UPI screenshots.
2. **Mid-build (around 17:30–18:30):** progress with a screenshot (ask Rehaan for the Flow screen or the Ghost line chart; the ghost line is the strongest visual). Say the engineering position out loud: **no rupee figure in RIPPLE is produced by a language model; every projection, balance and goal date is arithmetic we wrote; the model categorizes, extracts and explains.**
3. **Final (after the demo video, before 23:30):** the demo video, what it does in three lines, the repo link `https://github.com/RAK2315/ripple`, and thanks to Product Space.

Demo video: 90 seconds, script in `PRAVAH_SPEC.md` section 7 (PRAVAH was the working name; the product is RIPPLE) (paste SMS → fix one category, 14 rows re-categorize → Flow screen and timeline → typed what-if scenario → Ghost line and the regret number → asks for a mutual fund, it declines and models the goal instead). Rehaan records a rough cut around 18:00; you own the final edit.
