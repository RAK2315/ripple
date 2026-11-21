/**
 * RIPPLE FROZEN CONTRACT — machine-readable types.
 * Human-readable spec: ../CONTRACT.md. Frozen at setup, 21 Nov 2026.
 * v1.1.0 (agreed amendment, additive): source kind "xlsx"; SMS single multi-line paste clarified. See CONTRACT.md "Amendments".
 * Neither side edits this file unilaterally. Changes happen by agreement only.
 *
 * Imports allowed in this file: none. It must stay dependency-free.
 */

export const CONTRACT_VERSION = "1.1.0";

/** Direction of money relative to the user's account. */
export type Direction = "debit" | "credit";

/** Fixed category list. Parsers never set a category; the app does. */
export const CATEGORIES = [
  "Income",
  "Rent",
  "Utilities",
  "Phone & Internet",
  "Subscriptions",
  "Groceries",
  "Dining",
  "Transport",
  "Fuel",
  "Shopping",
  "Health",
  "Fitness",
  "Entertainment",
  "Travel",
  "Education",
  "EMI & Loans",
  "Insurance",
  "Family Transfer",
  "Transfers",
  "Cash Withdrawal",
  "Fees & Charges",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type CategorySource = "rule" | "starter_list" | "llm" | "user";

/** Where a transaction came from. */
export type SourceKind = "csv" | "xlsx" | "sms" | "pdf" | "upi_screenshot" | "synthetic";

export interface Transaction {
  /** Unique within its ParseResult/Fixture. Pattern ^[a-z0-9_-]{1,64}$. */
  id: string;
  /** Calendar date in IST, "YYYY-MM-DD". No time component. Ever. */
  date: string;
  /** Integer PAISE. Always > 0. Sign is never used; see `direction`. ₹1,234.50 => 123450. */
  amount: number;
  direction: Direction;
  /** Description exactly as in the source, whitespace-trimmed, internal whitespace collapsed to single spaces. Never empty. */
  raw_description: string;
  /** Trailing digits of the user's account/card exactly as shown in source (3 or 4 digits; ICICI SMS shows 3), else null. Digits only, no X. */
  account_tail: string | null;
  source_kind: SourceKind;
  /** File name for uploads ("hdfc_nov.csv"), "sms-paste" for SMS, "synthetic" for generated data. */
  source_file: string;
  /** The verbatim original input this row came from: the full CSV line or the full SMS text. For provenance. */
  source_line: string;
  /** Set by the app. Parsers and the generator MUST emit null. */
  merchant_normalized: string | null;
  /** Set by the app. Parsers and the generator MUST emit null. */
  category: Category | null;
  /** Set by the app. Parsers and the generator MUST emit null. */
  category_source: CategorySource | null;
  /** Set by the app, 0..1. Parsers and the generator MUST emit null. */
  confidence: number | null;
}

export type UnparsedReason =
  | "empty"
  | "header_undetected"
  | "no_amount"
  | "bad_amount"
  | "no_date"
  | "bad_date"
  | "no_pattern"
  | "not_a_transaction"
  | "llm_failed";

/** A row or message the parser could not turn into a Transaction. Never silently drop input. */
export interface UnparsedRow {
  /** 1-based index: CSV line number (header = line 1), or SMS message number in split order. */
  index: number;
  /** The verbatim input that failed. */
  raw: string;
  reason: UnparsedReason;
  /** Optional human-readable detail, e.g. "amount column value 'abc'". */
  detail?: string;
}

export interface ParseResult {
  transactions: Transaction[];
  unparsed: UnparsedRow[];
  stats: {
    /** Number of input units considered (CSV data rows excluding header, or SMS messages). */
    total_inputs: number;
    parsed: number;
    unparsed: number;
    /** SMS only: how many were parsed by the LLM fallback. 0 for CSV. */
    via_llm: number;
  };
}

/** Row returned by the SMS LLM fallback, in the same order as the messages passed in. */
export interface SmsLlmRow {
  is_transaction: boolean;
  /** "YYYY-MM-DD" or null if absent. */
  date: string | null;
  /** Integer paise, > 0, or null. */
  amount: number | null;
  direction: Direction | null;
  /** Merchant/payee string as written in the SMS, or null. Becomes raw_description. */
  merchant: string | null;
  account_tail: string | null;
}

/**
 * Injected by the caller. Receives messages that matched no regex pattern.
 * The APP supplies the real implementation (it masks PII before any model call).
 * Must return an array of the same length and order; null entry = model failed for that message.
 */
export type SmsLlmFallback = (messages: string[]) => Promise<Array<SmsLlmRow | null>>;

export interface ParseCsvOptions {
  /** Defaults to "upload.csv". */
  sourceFile?: string;
}

export interface ParseSmsOptions {
  /** Defaults to "sms-paste". */
  sourceFile?: string;
  /** "YYYY-MM-DD". Used to resolve 2-digit years and year-less dates. Defaults to today (IST). */
  referenceDate?: string;
  /** If omitted, unmatched messages go to `unparsed` with reason "no_pattern". */
  llmFallback?: SmsLlmFallback;
}

/** Signature: kirti/csv.ts must export this as `parseCsv`. Synchronous, pure, never throws. */
export type ParseCsv = (text: string, opts?: ParseCsvOptions) => ParseResult;

/** Signature: kirti/sms.ts must export this as `parseSms`. Never throws; failures go to `unparsed`. */
export type ParseSms = (text: string, opts?: ParseSmsOptions) => Promise<ParseResult>;

/** Past advice from the coach. Drives the Ghost line (Regret Engine). */
export interface Advice {
  /** Pattern ^adv_[a-z0-9_-]+$ */
  id: string;
  /** "YYYY-MM-DD" */
  date_given: string;
  /** One or two plain sentences. */
  text: string;
  /** Integer paise per month, > 0. */
  projected_monthly_saving: number;
  accepted: boolean;
  /** "YYYY-MM-DD" or null. Null when accepted is false. */
  acted_on_date: string | null;
}

export interface Fixture {
  contract_version: string; // "1.0.0" or "1.1.0"
  /** ISO 8601 datetime when generated. */
  generated_at: string;
  user: { name: string; city: string };
  /** Sorted ascending by date, then by id. */
  transactions: Transaction[];
  advice: Advice[];
}

export interface GenerateOptions {
  /** Default 42. Same seed => byte-identical output (except generated_at). */
  seed?: number;
  /** Default 8. */
  months?: number;
  /** "YYYY-MM-DD", last date included. Default "2026-11-20". */
  endDate?: string;
}

/** Signature: kirti/generator.ts must export this as `generateSyntheticData`. */
export type GenerateSyntheticData = (opts?: GenerateOptions) => Fixture;
/** kirti/generator.ts must export `renderCsv`: single signed-amount CSV of the fixture's transactions. */
export type RenderCsv = (fixture: Fixture) => string;
/** kirti/generator.ts must export `renderSmsDump`: one SMS per transaction, blank line between messages. */
export type RenderSmsDump = (fixture: Fixture) => string;
