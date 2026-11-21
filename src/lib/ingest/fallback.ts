/**
 * Rehaan's FALLBACK parsers, used only until kirti/ is merged (see src/lib/ingest/index.ts).
 * They satisfy the same contract but only cover the formats in public/demo/ plus common variants.
 */
import type { ParseResult, SmsLlmFallback, Transaction, UnparsedRow } from "../../../contract/types";

const MON: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

export function parseDate(s: string): string | null {
  s = s.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/))) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if ((m = s.match(/^(\d{1,2})[-\s]?([A-Za-z]{3})[-\s]?(\d{2,4})/))) {
    const mm = MON[m[2].toUpperCase()];
    if (!mm) return null;
    return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${mm}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export function parseAmount(s: string): number | null {
  const clean = s.replace(/[₹,\s]|Rs\.?|INR/gi, "");
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  return Math.round(Math.abs(parseFloat(clean)) * 100);
}

const base = (o: Partial<Transaction>): Transaction => ({
  id: "",
  date: "",
  amount: 0,
  direction: "debit",
  raw_description: "",
  account_tail: null,
  source_kind: "sms",
  source_file: "sms-paste",
  source_line: "",
  merchant_normalized: null,
  category: null,
  category_source: null,
  confidence: null,
  ...o,
});

const PATTERNS: { re: RegExp; dir: "debit" | "credit"; map: (m: RegExpMatchArray) => { amt: string; tail: string; payee: string; date: string } }[] = [
  // HDFC UPI multi-line
  { re: /Sent Rs\.?([\d,.]+)\s+From HDFC Bank A\/C \*?(\d+)\s+To (.+?)\s+On (\S+)/i, dir: "debit", map: (m) => ({ amt: m[1], tail: m[2], payee: m[3], date: m[4] }) },
  // HDFC credit
  { re: /INR ([\d,.]+) deposited in HDFC Bank A\/c XX(\d+) on (\S+) for (.+?)\.\s*Avl bal/i, dir: "credit", map: (m) => ({ amt: m[1], tail: m[2], payee: m[4], date: m[3] }) },
  // HDFC card
  { re: /Spent Rs\.?([\d,.]+) On HDFC Bank Card (\d+) At (.+?) On (\d{4}-\d{2}-\d{2})/i, dir: "debit", map: (m) => ({ amt: m[1], tail: m[2], payee: m[3], date: m[4] }) },
  // ICICI debit
  { re: /ICICI Bank Acct XX(\d+) debited for Rs ([\d,.]+) on (\S+?);\s*(.+?) credited/i, dir: "debit", map: (m) => ({ amt: m[2], tail: m[1], payee: m[4], date: m[3] }) },
  // ICICI credit
  { re: /Acct XX(\d+) is credited with Rs ([\d,.]+) on (\S+) from (.+?)\./i, dir: "credit", map: (m) => ({ amt: m[2], tail: m[1], payee: m[4], date: m[3] }) },
  // SBI debit
  { re: /A\/C X(\d+) debited by ([\d,.]+) on date (\S+) trf to (.+?) Ref/i, dir: "debit", map: (m) => ({ amt: m[2], tail: m[1], payee: m[4], date: m[3] }) },
  // Axis debit/credit
  { re: /INR ([\d,.]+) debited\s+A\/c no\. XX(\d+)\s+(\S+?),[\s\S]*?\n(?:UPI|IMPS)\/[^/]+\/\d+\/(.+)/i, dir: "debit", map: (m) => ({ amt: m[1], tail: m[2], payee: m[4].split("\n")[0], date: m[3] }) },
  { re: /INR ([\d,.]+) credited\s+A\/c no\. XX(\d+)\s+(\S+?),[\s\S]*?\n(?:UPI|IMPS)\/[^/]+\/\d+\/(.+)/i, dir: "credit", map: (m) => ({ amt: m[1], tail: m[2], payee: m[4].split("\n")[0], date: m[3] }) },
];

const NOT_TXN = /\bOTP\b|will be debited|is due|declined|failed|reward points|offer/i;

export async function fallbackParseSms(text: string, opts: { llmFallback?: SmsLlmFallback } = {}): Promise<ParseResult> {
  const norm = text.replace(/\r\n/g, "\n").trim();
  const msgs = /\n\s*\n/.test(norm) ? norm.split(/\n\s*\n/) : norm.split("\n");
  const messages = msgs.map((m) => m.trim()).filter(Boolean);
  const txns: Transaction[] = [];
  const unparsed: UnparsedRow[] = [];
  const toLlm: { index: number; raw: string }[] = [];
  messages.forEach((raw, i) => {
    if (NOT_TXN.test(raw)) return unparsed.push({ index: i + 1, raw, reason: "not_a_transaction" });
    for (const p of PATTERNS) {
      const m = raw.match(p.re);
      if (!m) continue;
      const v = p.map(m);
      const date = parseDate(v.date);
      const amount = parseAmount(v.amt);
      if (!date) return unparsed.push({ index: i + 1, raw, reason: "bad_date" });
      if (!amount) return unparsed.push({ index: i + 1, raw, reason: "bad_amount" });
      txns.push(base({ date, amount, direction: p.dir, raw_description: v.payee.replace(/\s+/g, " ").trim(), account_tail: v.tail.replace(/\D/g, "").slice(-4) || null, source_line: raw }));
      return;
    }
    toLlm.push({ index: i + 1, raw });
  });
  let viaLlm = 0;
  if (toLlm.length) {
    if (!opts.llmFallback) toLlm.forEach((x) => unparsed.push({ ...x, reason: "no_pattern" }));
    else {
      let rows: Awaited<ReturnType<SmsLlmFallback>> = [];
      try {
        rows = await opts.llmFallback(toLlm.map((x) => x.raw));
      } catch {
        rows = [];
      }
      toLlm.forEach((x, k) => {
        const r = rows[k];
        if (!r) return unparsed.push({ ...x, reason: "llm_failed" });
        if (!r.is_transaction) return unparsed.push({ ...x, reason: "not_a_transaction" });
        if (!r.date) return unparsed.push({ ...x, reason: "no_date" });
        if (!r.amount) return unparsed.push({ ...x, reason: "no_amount" });
        viaLlm++;
        txns.push(base({ date: r.date, amount: r.amount, direction: r.direction ?? "debit", raw_description: r.merchant ?? "SMS TRANSACTION", account_tail: r.account_tail, source_line: x.raw }));
      });
    }
  }
  txns.forEach((t, k) => (t.id = `sms_${String(k + 1).padStart(4, "0")}`));
  unparsed.sort((a, b) => a.index - b.index);
  return { transactions: txns, unparsed, stats: { total_inputs: messages.length, parsed: txns.length, unparsed: unparsed.length, via_llm: viaLlm } };
}

/** Minimal CSV: quoted fields, header detection by name, signed amount or debit/credit columns. */
export function fallbackParseCsv(text: string, opts: { sourceFile?: string } = {}): ParseResult {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const split = (l: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const hi = lines.findIndex((l) => /date/i.test(l) && /(amount|withdrawal|debit|deposit|credit)/i.test(l));
  if (hi < 0) return { transactions: [], unparsed: [{ index: 1, raw: lines[0] ?? "", reason: "header_undetected" }], stats: { total_inputs: 1, parsed: 0, unparsed: 1, via_llm: 0 } };
  const h = split(lines[hi]).map((x) => x.toLowerCase());
  const col = (re: RegExp) => h.findIndex((x) => re.test(x));
  const cDate = col(/txn date|transaction date|^date|value date/);
  const cDesc = col(/narration|description|particulars|remarks|details/);
  const cAmt = col(/^amount/);
  const cDr = col(/withdrawal|debit|^dr/);
  const cCr = col(/deposit|credit|^cr/);
  const txns: Transaction[] = [];
  const unparsed: UnparsedRow[] = [];
  let total = 0;
  for (let i = hi + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    total++;
    const c = split(raw);
    const date = parseDate(c[cDate] ?? "");
    if (!date) {
      unparsed.push({ index: i + 1, raw, reason: c[cDate] ? "bad_date" : "no_date" });
      continue;
    }
    let amount: number | null = null;
    let direction: "debit" | "credit" = "debit";
    if (cAmt >= 0) {
      const v = c[cAmt] ?? "";
      amount = parseAmount(v.replace(/(Dr|Cr)$/i, ""));
      direction = v.trim().startsWith("-") || /Dr$/i.test(v) ? "debit" : "credit";
    } else {
      const dr = parseAmount(c[cDr] ?? "");
      const cr = parseAmount(c[cCr] ?? "");
      if (dr) amount = dr;
      else if (cr) {
        amount = cr;
        direction = "credit";
      }
    }
    if (!amount) {
      unparsed.push({ index: i + 1, raw, reason: "no_amount" });
      continue;
    }
    txns.push(base({ date, amount, direction, raw_description: (c[cDesc] ?? "").replace(/\s+/g, " ").trim() || "UNKNOWN", source_kind: "csv", source_file: opts.sourceFile ?? "upload.csv", source_line: raw }));
  }
  txns.forEach((t, k) => (t.id = `csv_${String(k + 1).padStart(4, "0")}`));
  return { transactions: txns, unparsed, stats: { total_inputs: total, parsed: txns.length, unparsed: unparsed.length, via_llm: 0 } };
}
