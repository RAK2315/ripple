import type { Transaction, UnparsedRow } from "../../../contract/types";
import { parseAmount, parseDate } from "./fallback";

/**
 * Deterministic floor for text-layer PDF statements: no model involved. The model transcription stays the better
 * path when it is available; this runs when it isn't (quota, timeout, no key), so a PDF import never dies with the
 * model. Each row starts at a date; its amount is the last money figure on it (or the second last when the row
 * also prints a running balance, which then also decides debit vs credit). Without a balance column, direction
 * comes from the narration (NEFT CR, credited, salary, refund…), defaulting to debit.
 */

// numeric dates need / or - separators; month-name dates may wrap ("01-OCT- 2026"). Never starts inside an amount.
const DATE = /(?<![\d.,])(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}[-\s]?[A-Za-z]{3}[-\s]?\s*\d{2,4})\b/g;
const MONEY = /(?<![\w/])\d{1,3}(?:,\d{2,3})*(?:\.\d{2})(?![\d])|(?<![\w/])\d+\.\d{2}(?![\d])/g;
const CREDIT = /\b(NEFT CR|CR\b|CREDIT(ED)?|DEPOSIT(ED)?|SALARY|REFUND|REVERSAL|REVERSED|INTEREST|CASHBACK|RECEIVED|BY TRANSFER|IMPS[- ]CR|UPI[- ]CR)\b/i;
const HEADER = /\b(opening balance|closing balance|statement of account|total|page \d+|balance b\/f|balance c\/f)\b/i;

export function parsePdfText(text: string, fileName: string): { transactions: Transaction[]; unparsed: UnparsedRow[] } {
  const flat = text.replace(/\r/g, "").replace(/\s+/g, " ");
  const starts = [...flat.matchAll(DATE)].map((m) => ({ at: m.index!, raw: m[0] }));
  const transactions: Transaction[] = [];
  const unparsed: UnparsedRow[] = [];
  let prevBalance: number | null = null;
  starts.forEach((s, i) => {
    const row = flat.slice(s.at, starts[i + 1]?.at ?? flat.length).trim();
    const date = parseDate(s.raw.replace(/\s+/g, ""));
    if (!date) return;
    const body = row.slice(s.raw.length).trim();
    // the statement's period line ("01-OCT-2026 to 31-OCT-2026") and other headers aren't rows
    if (!body || /^(to|date|narration|particulars)\b/i.test(body) || HEADER.test(body.slice(0, 40))) return;
    const amounts = [...body.matchAll(MONEY)].map((m) => ({ v: parseAmount(m[0]), at: m.index! }));
    const money = amounts.filter((a): a is { v: number; at: number } => a.v != null && a.v > 0);
    if (!money.length) {
      unparsed.push({ index: transactions.length + unparsed.length + 1, raw: row.slice(0, 200), reason: "no_amount" });
      return;
    }
    const withBalance = money.length >= 2;
    const amt = withBalance ? money[money.length - 2] : money[money.length - 1];
    const balance = withBalance ? money[money.length - 1].v : null;
    const desc = body.slice(0, amt.at).replace(/\s+/g, " ").trim().replace(/[-–,;]+$/, "").trim();
    let direction: "debit" | "credit" = CREDIT.test(desc) ? "credit" : "debit";
    if (balance != null && prevBalance != null) direction = balance >= prevBalance ? "credit" : "debit";
    if (balance != null) prevBalance = balance;
    transactions.push({
      id: `pdf_${String(transactions.length + 1).padStart(4, "0")}`,
      date,
      amount: amt.v,
      direction,
      raw_description: desc || "UNKNOWN",
      account_tail: null,
      source_kind: "pdf",
      source_file: fileName,
      source_line: row.slice(0, 300),
      merchant_normalized: null,
      category: null,
      category_source: null,
      confidence: null,
    });
  });
  return { transactions, unparsed };
}
