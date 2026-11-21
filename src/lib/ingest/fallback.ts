/**
 * Rehaan's FALLBACK parsers, used only until kirti/ is merged (see src/lib/ingest/index.ts).
 * They satisfy the same contract but only cover the formats in public/demo/ plus common variants.
 */
import type { ParseResult, SmsLlmFallback, Transaction, UnparsedRow } from "../../../contract/types";

const MON: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

/** A real calendar date or null: 2026-13-45 and 2026-02-31 are not dates. */
function ymd(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Indian dates are day-first. `referenceDate` resolves year-less dates ("12 Nov"): the reference year,
 * rolled back one year if that would put the date after the reference (a December alert read in January).
 */
export function parseDate(s: string, referenceDate?: string): string | null {
  s = s.trim();
  let m: RegExpMatchArray | null;
  const yy = (y: string) => (y.length === 2 ? 2000 + +y : +y);
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return ymd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/))) return ymd(yy(m[3]), +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[-\s]?([A-Za-z]{3})[-\s]?(\d{2,4})\b/))) {
    const mm = MON[m[2].toUpperCase()];
    return mm ? ymd(yy(m[3]), +mm, +m[1]) : null;
  }
  // year-less: "12 Nov", "12-Nov"
  if (referenceDate && (m = s.match(/^(\d{1,2})[-\s]?([A-Za-z]{3})\b/))) {
    const mm = MON[m[2].toUpperCase()];
    if (!mm) return null;
    const y = +referenceDate.slice(0, 4);
    const d = ymd(y, +mm, +m[1]);
    return d && d > referenceDate ? ymd(y - 1, +mm, +m[1]) : d;
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

// SBI UPI credit with no payee: the reference is the only description the message has, kept as written
PATTERNS.push({
  re: /A\/c\s*X*(\d+)\s+credited by (?:Rs\.?\s*)?([\d,.]+) on (\S+?)(?:\s+(by \(Ref no \d+\))|\s|$)/i,
  dir: "credit",
  map: (m) => ({ amt: m[2], tail: m[1], payee: m[4] ?? m[0].trim(), date: m[3] }),
});

/**
 * Not a transaction: OTPs, scheduled/future debits, bill reminders, declines, offers, balance-only messages.
 * Matched on message SHAPE, never on a single word, so "BEST OFFERS MART", "Refund for failed txn" and an alert
 * that merely says "never share your OTP" stay transactions. (Narrowed after review of kirti/ found real rows dropped.)
 */
export function isNotTransaction(msg: string): boolean {
  const t = msg.replace(/\s+/g, " ");
  const moved = /\b(debited|credited|spent|sent|paid|withdrawn|deposited|received|refund(ed)?|reversed)\b/i.test(t);
  if (/\bOTP\b.{0,60}?\bis\s*:?\s*\d{4,8}\b|\b\d{4,8}\s+is (your )?(OTP|one time password)\b|\bis your (OTP|one time password)\b/i.test(t)) return true;
  if (/\b(will be debited|is scheduled|scheduled for|due on|is due\b|payment due|bill (of .{1,20} )?is due)/i.test(t)) return true;
  if (/\b(declined|txn failed|transaction failed|unsuccessful)\b/i.test(t) && !/\b(refund|reversal|reversed|credited)\b/i.test(t)) return true;
  if (/\b(pre-?approved|apply now|claim (your|now)|congratulations|you are eligible|exclusive offer|limited period offer|reward points)\b/i.test(t)) return true;
  if (/\b(available balance|avl bal|balance enquiry|balance is)\b/i.test(t) && !moved) return true;
  return false;
}

/** Specific bank patterns; returns a transaction-shaped match or a failure reason. */
function matchPatterns(raw: string, referenceDate?: string) {
  for (const p of PATTERNS) {
    const m = raw.match(p.re);
    if (!m) continue;
    const v = p.map(m);
    return { v, dir: p.dir, date: parseDate(v.date, referenceDate), amount: parseAmount(v.amt) };
  }
  return null;
}

/**
 * Generic debit/credit fallback for banks without a pattern (Kotak, PNB, card alerts). Descriptions stay verbatim:
 * the payee as written, or the message's own reference when there is no payee. Never a trimmed or invented string.
 */
function matchGeneric(raw: string, referenceDate?: string) {
  const t = raw.replace(/\s+/g, " ");
  const deb = t.search(/\b(debited|spent|sent|paid|withdrawn)\b/i);
  const cred = t.search(/\b(credited|deposited|received)\b/i);
  if (deb < 0 && cred < 0) return null;
  const dir: "debit" | "credit" = deb >= 0 && (cred < 0 || deb < cred) ? "debit" : "credit";
  const amt = t.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  const dm = t.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}[-\s]?[A-Za-z]{3}[-\s]?\d{2,4}|\d{1,2}[-\s]?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\b/i);
  if (!amt || !dm) return null;
  const tail = t.match(/\b(?:A\/c|Acct|AC|Account|Card)(?:\s*no\.?)?(?:\s*ending)?\s*[X*x]*(\d{3,4})\b/i)?.[1] ?? null;
  const stop = String.raw`(?=\s+(?:on|ref|refno|upi|via|avl|not you|call|bal|using|and)\b|[.;(]|$)`;
  const bad = /^(a\/c|acct|account|rs\.?|inr|your|you|the)\b/i;
  const payee = (dir === "debit" ? t.match(new RegExp(String.raw`\b(?:to VPA|trf to|to|at|towards)\s+([A-Za-z0-9*&@._ /-]{2,60}?)${stop}`, "i")) : t.match(new RegExp(String.raw`\b(?:from|by)\s+([A-Za-z0-9*&@._ /-]{2,60}?)${stop}`, "i")))?.[1]?.trim();
  const ref = t.match(/\b(?:UPI\s*)?Ref(?:erence)?\.?\s*(?:no\.?)?\s*:?\s*\d{6,16}/i)?.[0];
  const desc = payee && !bad.test(payee) ? payee : (ref ?? t.slice(0, 60)).trim();
  return { v: { amt: amt[1], tail: tail ?? "", payee: desc, date: dm[1] }, dir, date: parseDate(dm[1], referenceDate), amount: parseAmount(amt[1]) };
}

export async function fallbackParseSms(text: string, opts: { llmFallback?: SmsLlmFallback; referenceDate?: string } = {}): Promise<ParseResult> {
  const norm = text.replace(/\r\n/g, "\n").trim();
  // CONTRACT 6b: with no blank line, one message per line, unless the paste is a single multi-line message:
  // no line parses on its own, but the whole paste does (so a list of one-line alerts is never merged)
  const parses = (s: string) => !!(matchPatterns(s, opts.referenceDate) || matchGeneric(s, opts.referenceDate));
  const whole = !/\n\s*\n/.test(norm) && norm.includes("\n") && parses(norm) && !norm.split("\n").some((l) => parses(l.trim()));
  const msgs = /\n\s*\n/.test(norm) ? norm.split(/\n\s*\n/) : whole ? [norm] : norm.split("\n");
  const messages = msgs.map((m) => m.trim()).filter(Boolean);
  const txns: Transaction[] = [];
  const unparsed: UnparsedRow[] = [];
  const toLlm: { index: number; raw: string }[] = [];
  messages.forEach((raw, i) => {
    if (isNotTransaction(raw)) return unparsed.push({ index: i + 1, raw, reason: "not_a_transaction" });
    const hit = matchPatterns(raw, opts.referenceDate) ?? matchGeneric(raw, opts.referenceDate);
    if (!hit) return toLlm.push({ index: i + 1, raw });
    if (!hit.date) return unparsed.push({ index: i + 1, raw, reason: "bad_date", detail: `date "${hit.v.date}"` });
    if (!hit.amount) return unparsed.push({ index: i + 1, raw, reason: "bad_amount", detail: `amount "${hit.v.amt}"` });
    const tail = hit.v.tail.replace(/\D/g, "").slice(-4);
    txns.push(base({ date: hit.date, amount: hit.amount, direction: hit.dir, raw_description: hit.v.payee.replace(/\s+/g, " ").trim(), account_tail: tail.length >= 3 ? tail : null, source_line: raw }));
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

/** CSV: quoted fields ("" escapes), header found below any preamble, signed amount, Dr/Cr suffix or type column, or debit/credit columns. */
export function fallbackParseCsv(text: string, opts: { sourceFile?: string } = {}): ParseResult {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const split = (l: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let k = 0; k < l.length; k++) {
      const ch = l[k];
      if (ch === '"') {
        if (q && l[k + 1] === '"') {
          cur += '"';
          k++;
        } else q = !q;
      } else if (ch === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const hi = lines.findIndex((l) => /date|\bdt\b/i.test(l) && /(amount|withdrawal|debit|deposit|credit)/i.test(l));
  if (hi < 0) return { transactions: [], unparsed: [{ index: 1, raw: lines[0] ?? "", reason: "header_undetected" }], stats: { total_inputs: 1, parsed: 0, unparsed: 1, via_llm: 0 } };
  // account tail from the statement preamble ("Account No : XXXXXXXX4821")
  const tail = lines
    .slice(0, hi)
    .join(" ")
    .match(/(?:account|a\/c|acct)\s*(?:no\.?|number)?\s*[:.-]?\s*[X*x]*(\d{3,4})\b/i)?.[1] ?? null;
  const h = split(lines[hi]).map((x) => x.toLowerCase());
  const col = (re: RegExp, skip: (x: string) => boolean = () => false) => h.findIndex((x) => re.test(x) && !skip(x));
  const isType = (x: string) => /^(dr\s*\/\s*cr|cr\s*\/\s*dr|type|txn type|debit\s*\/\s*credit)$/.test(x);
  const isValue = (x: string) => /value\s*(date|dt)/.test(x);
  // transaction date beats value date
  let cDate = col(/(txn|transaction|tran)\.?\s*date/);
  if (cDate < 0) cDate = col(/^date\b|\bdate$/, isValue);
  if (cDate < 0) cDate = col(/value\s*(date|dt)/);
  const cDesc = col(/narration|description|particulars|remarks|details/);
  const cAmt = col(/^amount/);
  const cType = col(/./, (x) => !isType(x));
  const cDr = col(/withdrawal|debit|^dr\b|\(dr\)/, (x) => isType(x) || /balance/.test(x));
  const cCr = col(/deposit|credit|^cr\b|\(cr\)/, (x) => isType(x) || /balance/.test(x));
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
      const lead = c.find(Boolean) ?? "";
      if (/^(\*{3}|end of statement|total|closing balance|opening balance|grand total)/i.test(lead)) unparsed.push({ index: i + 1, raw, reason: "not_a_transaction", detail: "summary or footer row" });
      else unparsed.push({ index: i + 1, raw, reason: c[cDate] ? "bad_date" : "no_date" });
      continue;
    }
    let amount: number | null = null;
    let direction: "debit" | "credit" = "debit";
    let cellText = "";
    if (cAmt >= 0) {
      const v = c[cAmt] ?? "";
      cellText = v;
      amount = parseAmount(v.replace(/(Dr|Cr)\.?$/i, ""));
      if (v.trim().startsWith("-") || /Dr\.?$/i.test(v)) direction = "debit";
      else if (v.trim().startsWith("+") || /Cr\.?$/i.test(v)) direction = "credit";
      else if (cType >= 0) direction = /^(cr|credit|c)$/i.test(c[cType] ?? "") ? "credit" : /^(dr|debit|d)$/i.test(c[cType] ?? "") ? "debit" : "credit";
      else direction = "credit";
    } else {
      const dr = parseAmount(c[cDr] ?? "");
      const cr = parseAmount(c[cCr] ?? "");
      cellText = `${c[cDr] ?? ""}${c[cCr] ?? ""}`;
      if (dr) amount = dr;
      else if (cr) {
        amount = cr;
        direction = "credit";
      }
    }
    if (!amount) {
      // an empty cell is a missing amount; text that is not a number is a bad one ("12abc" is not Rs 12)
      unparsed.push({ index: i + 1, raw, reason: cellText.trim() && !/^[0.,\s]+$/.test(cellText) ? "bad_amount" : "no_amount", ...(cellText.trim() ? { detail: `amount "${cellText.trim()}"` } : {}) });
      continue;
    }
    txns.push(base({ date, amount, direction, raw_description: (c[cDesc] ?? "").replace(/\s+/g, " ").trim() || "UNKNOWN", account_tail: tail, source_kind: "csv", source_file: opts.sourceFile ?? "upload.csv", source_line: raw }));
  }
  txns.forEach((t, k) => (t.id = `csv_${String(k + 1).padStart(4, "0")}`));
  return { transactions: txns, unparsed, stats: { total_inputs: total, parsed: txns.length, unparsed: unparsed.length, via_llm: 0 } };
}
