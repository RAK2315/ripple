# RIPPLE Contract v1.1.0 — FROZEN

**Frozen as of setup, 21 Nov 2026, ~13:40 IST.** Neither side (Rehaan's `src/`, Kirti's `kirti/`) changes this file, `contract/types.ts` or `contract/transaction.schema.json` on their own. If a change is genuinely needed, it is agreed by both people first, then this file, `types.ts`, the schema and `kirti/BRIEF.md` are updated in one commit.

## Amendments

**v1.1.0, 21 Nov 2026 (agreed by Rehaan and Kirti; additive, backward compatible).** Every v1.0.0 transaction, parse result and fixture is still valid v1.1.0.

1. **New source kind `"xlsx"`** for spreadsheet exports (`.xlsx` and `.xls`, e.g. Paytm and PhonePe passbooks). For these rows `source_file` is the uploaded file name, `source_line` is the row's cells joined CSV-style (date normalised to `DD/MM/YYYY`, time appended when the export has a separate time column), and an `UnparsedRow.index` is the spreadsheet row number (1-based, as Excel shows it). Before this amendment such rows had to be labelled `"csv"`, which was wrong.
2. **SMS splitting clarification (§4).** The rule "otherwise each non-empty line is one message" applies to a paste of several one-line messages. A paste that is a single multi-line message (no line parses as a transaction on its own, but the whole paste does) is one message. This is what the §6b worked example always required; both parsers now implement it.

`kirti/` is unchanged by this amendment: it already treats a single multi-line paste as one message, and it never emits `"xlsx"`. `kirti/BRIEF.md` describes v1.0.0, which remains valid. `Fixture.contract_version` accepts `"1.0.0"` or `"1.1.0"`.

Machine-readable source of truth: `contract/types.ts` (TypeScript) and `contract/transaction.schema.json` (JSON Schema). If prose here and `types.ts` ever disagree, `types.ts` wins.

## 1. Dependency rule (one way only)

```
contract/   <-  kirti/   <-  src/
```

- `contract/` imports nothing.
- `kirti/` imports only from `contract/` (and npm packages already in `package.json`). It never imports from `src/` or `rehaan/`. Ever.
- `src/` may import from `kirti/` only the exported functions listed in section 4, and only through the contract types. `src/` never reaches into kirti internals.

This is what lets both workstreams run in parallel without blocking or breaking each other.

## 2. Representation rules (pinned, no alternatives)

| Thing | Rule |
|---|---|
| Date | String `"YYYY-MM-DD"`, the IST calendar date. No time, no timezone, no `Date` objects. |
| Amount | **Integer paise**, always **positive** (`> 0`). ₹1,234.50 → `123450`. Never a float, never negative. |
| Direction | Separate field `direction: "debit" \| "credit"`. Debit = money left the user's account. Credit = money came in. |
| Account tail | Trailing digits as shown in the source, digits only, 3 or 4 long (`"4821"`, ICICI SMS shows `"903"`), or `null`. |
| Text | `raw_description` is trimmed, internal whitespace collapsed to one space, otherwise verbatim (keep case, keep `*`, `/`, `@`). |
| Categorization fields | `merchant_normalized`, `category`, `category_source`, `confidence` are **always `null`** from parsers and the generator. The app fills them. |

## 3. The Transaction object

| Field | Type | Required | Format / allowed values |
|---|---|---|---|
| `id` | string | yes | Unique within one ParseResult or Fixture. `^[a-z0-9_-]{1,64}$`. Recommended: `csv_0001`, `sms_0001`, `syn_0001` in input order. |
| `date` | string | yes | `YYYY-MM-DD` |
| `amount` | integer | yes | paise, `>= 1` |
| `direction` | string | yes | `"debit"` or `"credit"` |
| `raw_description` | string | yes | non-empty. CSV: the description cell. SMS: the merchant/payee/narration text as written in the SMS (e.g. `SWIGGY`, `NETFLIX.COM`, `NEFT CR-...-SALARY NOV 2026`). |
| `account_tail` | string \| null | yes (nullable) | `^\d{3,4}$` or null |
| `source_kind` | string | yes | `"csv"`, `"xlsx"`, `"sms"`, `"pdf"`, `"upi_screenshot"`, `"synthetic"` (`"xlsx"` since v1.1.0) |
| `source_file` | string | yes | uploaded file name, `"sms-paste"`, or `"synthetic"` |
| `source_line` | string | yes | the verbatim original input: the full CSV line, or the full SMS text (multi-line SMS keep their `\n`) |
| `merchant_normalized` | string \| null | yes | parsers: `null` |
| `category` | Category \| null | yes | parsers: `null`. App sets one of the list below. |
| `category_source` | string \| null | yes | parsers: `null`. App sets `"rule"`, `"starter_list"`, `"llm"`, `"user"`. |
| `confidence` | number \| null | yes | parsers: `null`. App sets 0..1. |

All 13 keys are always present (use `null`, never omit a key). No extra keys.

**Category list (fixed):** Income, Rent, Utilities, Phone & Internet, Subscriptions, Groceries, Dining, Transport, Fuel, Shopping, Health, Fitness, Entertainment, Travel, Education, EMI & Loans, Insurance, Family Transfer, Transfers, Cash Withdrawal, Fees & Charges, Other.

## 4. Functions kirti/ must export

All in TypeScript, under `kirti/`. File names are fixed so `src/` can import them.

```ts
// kirti/csv.ts
export function parseCsv(text: string, opts?: { sourceFile?: string }): ParseResult;          // sync, pure, never throws

// kirti/sms.ts
export function parseSms(text: string, opts?: {
  sourceFile?: string;          // default "sms-paste"
  referenceDate?: string;       // "YYYY-MM-DD", resolves 2-digit/missing years; default today IST
  llmFallback?: SmsLlmFallback; // injected by the app; if absent, unmatched => unparsed "no_pattern"
}): Promise<ParseResult>;                                                                       // never throws

// kirti/generator.ts
export function generateSyntheticData(opts?: { seed?: number; months?: number; endDate?: string }): Fixture;
export function renderCsv(fixture: Fixture): string;      // header "Date,Narration,Amount", signed rupee amount, debit negative
export function renderSmsDump(fixture: Fixture): string;  // one SMS per transaction, blank line between messages

// kirti/index.ts  re-exports all five
```

```ts
interface ParseResult {
  transactions: Transaction[];
  unparsed: UnparsedRow[];   // every input that did not become a Transaction. NEVER silently drop.
  stats: { total_inputs: number; parsed: number; unparsed: number; via_llm: number };
}
interface UnparsedRow { index: number; raw: string; reason: UnparsedReason; detail?: string }
type UnparsedReason = "empty" | "header_undetected" | "no_amount" | "bad_amount" | "no_date"
                    | "bad_date" | "no_pattern" | "not_a_transaction" | "llm_failed";
type SmsLlmFallback = (messages: string[]) => Promise<Array<SmsLlmRow | null>>; // same length & order
interface SmsLlmRow { is_transaction: boolean; date: string|null; amount: number|null;
                      direction: "debit"|"credit"|null; merchant: string|null; account_tail: string|null }
```

Invariant: `stats.parsed === transactions.length`, `stats.unparsed === unparsed.length`, `parsed + unparsed === total_inputs`.

`index` is 1-based: CSV line number in the file (header is line 1, so the first data row is 2); SMS message number in split order.

**SMS splitting rule:** if the pasted text contains a blank line, each blank-line-separated block is one message. Otherwise each non-empty line is one message, unless the paste is a single multi-line message: no line parses as a transaction on its own but the whole paste does, in which case the whole paste is one message (v1.1.0 clarification; this is what §6b requires).

**Why the LLM fallback is injected:** the app masks account numbers, names and phone numbers before any model call and shows the user the exact masked payload ("what the AI sees"). So the model call lives in `src/`. `kirti/` may ship its own fallback for testing, but the app always passes its own.

**OTP / promotional / balance-only messages** are not transactions: `unparsed` with reason `"not_a_transaction"`.

## 5. Fixture

```ts
interface Fixture {
  contract_version: "1.0.0" | "1.1.0";
  generated_at: string;                 // ISO datetime
  user: { name: string; city: string };
  transactions: Transaction[];          // sorted by date asc, then id; source_kind "synthetic"
  advice: Advice[];
}
interface Advice {
  id: string;                           // ^adv_[a-z0-9_-]+$
  date_given: string;                   // YYYY-MM-DD
  text: string;
  projected_monthly_saving: number;     // integer paise > 0
  accepted: boolean;
  acted_on_date: string | null;         // null when not accepted
}
```

`contract/fixture.json` (generated by `scripts/generate-fixture.mjs`) is the reference instance. The app is built against it.

## 6. Worked examples

### 6a. Messy CSV row → Transaction

Input file `hdfc_nov.csv`:
```
Txn Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance
14/11/26,UPI/SWIGGY*ORDER/412//HDFC,0000431298765432,"1,234.50",,"45,120.10"
```
Output (`transactions[0]`):
```json
{
  "id": "csv_0001",
  "date": "2026-11-14",
  "amount": 123450,
  "direction": "debit",
  "raw_description": "UPI/SWIGGY*ORDER/412//HDFC",
  "account_tail": null,
  "source_kind": "csv",
  "source_file": "hdfc_nov.csv",
  "source_line": "14/11/26,UPI/SWIGGY*ORDER/412//HDFC,0000431298765432,\"1,234.50\",,\"45,120.10\"",
  "merchant_normalized": null,
  "category": null,
  "category_source": null,
  "confidence": null
}
```
Note: `14/11/26` is DD/MM/YY (Indian banks always use day-first). `"1,234.50"` → `123450`. Withdrawal column populated → debit. Balance column ignored.

### 6b. SMS → Transaction

Input (pasted):
```
Sent Rs.412.00
From HDFC Bank A/C *4821
To SWIGGY
On 14/11/26
Ref 431298765432
Not You?
Call 18002586161/SMS BLOCK UPI to 7308080808
```
Output:
```json
{
  "id": "sms_0001",
  "date": "2026-11-14",
  "amount": 41200,
  "direction": "debit",
  "raw_description": "SWIGGY",
  "account_tail": "4821",
  "source_kind": "sms",
  "source_file": "sms-paste",
  "source_line": "Sent Rs.412.00\nFrom HDFC Bank A/C *4821\nTo SWIGGY\nOn 14/11/26\nRef 431298765432\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808",
  "merchant_normalized": null,
  "category": null,
  "category_source": null,
  "confidence": null
}
```

### 6c. Unparseable

Input SMS `Your OTP for txn of Rs 2,000 at AMAZON is 482913. Do not share.` →
```json
{ "index": 3, "raw": "Your OTP for txn of Rs 2,000 at AMAZON is 482913. Do not share.", "reason": "not_a_transaction" }
```
