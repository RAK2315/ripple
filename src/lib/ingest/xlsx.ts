/**
 * Excel import (.xlsx / .xls) for bank and wallet exports. Runs entirely in the browser: the file never leaves the device.
 * Sheet, header and column detection are heuristic; Paytm's passbook export is the known-good case.
 * Output follows CONTRACT.md. The contract has no "xlsx" source kind (it is frozen), so rows use source_kind "csv": tabular export.
 */
import type { ParseResult, Transaction, UnparsedRow } from "../../../contract/types";

export type Cell = string | number | boolean | Date | null | undefined;
export interface Sheet {
  name: string;
  rows: Cell[][];
  /** 0-based sheet row of rows[0], so unparsed indexes are real spreadsheet row numbers */
  firstRow: number;
}

export interface ColumnMap {
  date: number;
  time: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  type: number;
  vpa: number;
  tags: number;
}

export interface SheetAnalysis {
  sheet: Sheet;
  sheets: { name: string; dateRows: number }[];
  /** index into sheet.rows; -1 if no header found */
  headerIdx: number;
  header: string[];
  map: ColumnMap;
  needsMapping: boolean;
  /** what could not be identified, for the mapping UI */
  missing: ("date" | "amount" | "description")[];
  accountTail: string | null;
}

/** Load a workbook in the browser (or in tests). SheetJS is imported on demand so it never ships with the first page. */
export async function readWorkbook(data: ArrayBuffer | Uint8Array): Promise<Sheet[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"];
    const firstRow = ref ? XLSX.utils.decode_range(ref).s.r : 0;
    const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: "", blankrows: true });
    return { name, rows, firstRow };
  });
}

// ---------- cell helpers ----------

const text = (c: Cell): string => (c instanceof Date ? isoFromDate(c) : c == null ? "" : String(c)).trim();

function isoFromDate(d: Date): string {
  // SheetJS cellDates: local components equal the spreadsheet's values
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Indian exports are day-first. Returns YYYY-MM-DD for a real calendar date, else null. */
export function parseDateCell(c: Cell): string | null {
  if (c instanceof Date) return isNaN(c.getTime()) ? null : validYmd(c.getFullYear(), c.getMonth() + 1, c.getDate());
  const s = text(c);
  if (!s) return null;
  let m: RegExpMatchArray | null;
  const yy = (y: string) => (y.length === 2 ? 2000 + +y : +y);
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return validYmd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/))) return validYmd(yy(m[3]), +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[\s/-]?([A-Za-z]{3})[A-Za-z]*[\s/,-]*(\d{2}|\d{4})\b/))) {
    const mm = MON[m[2].toLowerCase()];
    return mm ? validYmd(yy(m[3]), mm, +m[1]) : null;
  }
  return null;
}

export function parseTimeCell(c: Cell): string | null {
  if (c instanceof Date) return `${String(c.getHours()).padStart(2, "0")}:${String(c.getMinutes()).padStart(2, "0")}:${String(c.getSeconds()).padStart(2, "0")}`;
  if (typeof c === "number" && c >= 0 && c < 1) {
    const s = Math.round(c * 86400);
    return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  const m = text(c).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = +m[1];
  if (m[4]) h = (h % 12) + (/p/i.test(m[4]) ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
}

/** Amount in paise plus the sign it carried. Strict: "12abc" is not ₹12. */
export function parseAmountCell(c: Cell): { paise: number; sign: -1 | 1 | 0 } | null {
  if (typeof c === "number") return Number.isFinite(c) ? { paise: Math.round(Math.abs(c) * 100), sign: c < 0 ? -1 : c > 0 ? 1 : 0 } : null;
  let s = text(c);
  if (!s) return null;
  let sign: -1 | 1 | 0 = 0;
  if (/\(.*\)/.test(s)) sign = -1; // accounting negative
  if (/\bdr\.?$/i.test(s)) sign = -1;
  if (/\bcr\.?$/i.test(s)) sign = 1;
  s = s.replace(/\b(dr|cr)\.?$/i, "").replace(/[()₹,\s]|Rs\.?|INR/gi, "");
  if (/^[-–—]/.test(s)) sign = -1;
  else if (/^\+/.test(s)) sign = 1;
  s = s.replace(/^[-–—+]/, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return { paise: Math.round(parseFloat(s) * 100), sign };
}

/** Tags like "🍔 #Food" → "#Food". Emoji, variation selectors and joiners are removed before the tag is used anywhere. */
export function cleanTag(c: Cell): string {
  return text(c)
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{FE0E}\u{200D}\u{20E3}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- detection ----------

const H = {
  date: /\b(txn|transaction|posting|value)?\s*date\b|^dt\.?$|^value dt/i,
  txnDate: /(txn|transaction|tran)\.?\s*date/i,
  valueDate: /value\s*(date|dt)/i,
  amountLike: /amount|amt\b|withdrawal|deposit|debit|credit|\bdr\b|\bcr\b/i,
  amount: /^(txn |transaction |net )?amount\b|^amt\.?$|amount\s*\((rs|inr|₹)/i,
  debit: /withdrawal|debit|\bdr\b|paid out|money out/i,
  credit: /deposit|credit|\bcr\b|paid in|money in/i,
  balance: /balance/i,
  time: /^(txn |transaction )?time$/i,
  description: /transaction details|narration|description|particulars|remarks|^details$|merchant|payee/i,
  vpa: /upi id|vpa|other transaction details/i,
  type: /^(dr\s*\/\s*cr|cr\s*\/\s*dr|type|txn type|debit\s*\/\s*credit)$/i,
  tags: /^tags?$|^category$|^label$/i,
};

const SHEET_NAME = /passbook|payment history|transaction|history|statement|txn|activity|ledger/i;
const NOT_DATA = /summary|overview|info|instructions|about/i;

function dateRowCount(s: Sheet): number {
  return s.rows.filter((r) => r.slice(0, 4).some((c) => parseDateCell(c))).length;
}

/** Pick the transaction sheet: name looks like history and has date rows; most date-like rows wins. */
export function pickSheet(sheets: Sheet[]): { sheet: Sheet; counts: { name: string; dateRows: number }[] } {
  const counts = sheets.map((s) => ({ s, name: s.name, dateRows: dateRowCount(s) }));
  const named = counts.filter((c) => SHEET_NAME.test(c.name) && !NOT_DATA.test(c.name) && c.dateRows > 0);
  const pool = named.length ? named : counts.filter((c) => !NOT_DATA.test(c.name) || counts.length === 1);
  const best = (pool.length ? pool : counts).sort((a, b) => b.dateRows - a.dateRows)[0];
  return { sheet: best.s, counts: counts.map(({ name, dateRows }) => ({ name, dateRows })) };
}

/** First row (scanning down) that names both a date-like and an amount-like column. */
export function findHeader(rows: Cell[][]): number {
  for (let i = 0; i < Math.min(rows.length, 80); i++) {
    const cells = rows[i].map(text);
    if (cells.some((c) => H.date.test(c) && c.length < 30) && cells.some((c) => H.amountLike.test(c) && !H.balance.test(c) && c.length < 40)) return i;
  }
  return -1;
}

const emptyMap = (): ColumnMap => ({ date: -1, time: -1, description: -1, amount: -1, debit: -1, credit: -1, type: -1, vpa: -1, tags: -1 });

export function detectColumns(header: string[], data: Cell[][]): ColumnMap {
  const map = emptyMap();
  const find = (re: RegExp, skip: (h: string) => boolean = () => false) => header.findIndex((h) => re.test(h) && !skip(h));
  map.date = find(H.txnDate);
  if (map.date < 0) map.date = find(H.date, (h) => H.valueDate.test(h));
  if (map.date < 0) map.date = find(H.valueDate);
  map.time = find(H.time);
  map.vpa = find(H.vpa);
  map.description = find(H.description, (h) => H.vpa.test(h));
  map.type = find(H.type);
  map.tags = find(H.tags);
  map.amount = find(H.amount, (h) => H.balance.test(h));
  if (map.amount < 0) {
    map.debit = find(H.debit, (h) => H.balance.test(h) || H.type.test(h));
    map.credit = find(H.credit, (h) => H.balance.test(h) || H.type.test(h) || header.indexOf(h) === map.debit);
  }
  // unnamed column whose cells are UPI handles (Paytm leaves this header blank)
  if (map.vpa < 0) {
    map.vpa = header.findIndex((h, i) => {
      const vals = data.map((r) => text(r[i])).filter(Boolean);
      return vals.length > 0 && vals.filter((v) => v.includes("@")).length / vals.length >= 0.5;
    });
  }
  return map;
}

function preambleTail(rows: Cell[][], headerIdx: number): string | null {
  for (const r of rows.slice(0, Math.max(0, headerIdx))) {
    const m = r.map(text).join(" ").match(/(?:account|a\/c|acct)\s*(?:no\.?|number)?\s*[:.-]?\s*[X*x]*(\d{3,4})\b/i);
    if (m) return m[1];
  }
  return null;
}

export function analyzeSheets(sheets: Sheet[], chosenName?: string): SheetAnalysis {
  const { sheet: picked, counts } = pickSheet(sheets);
  const sheet = (chosenName && sheets.find((s) => s.name === chosenName)) || picked;
  const headerIdx = findHeader(sheet.rows);
  const headerRowIdx = headerIdx >= 0 ? headerIdx : Math.max(0, sheet.rows.findIndex((r) => r.some((c) => text(c))));
  const header = (sheet.rows[headerRowIdx] ?? []).map(text);
  const width = Math.max(header.length, ...sheet.rows.slice(headerRowIdx + 1, headerRowIdx + 20).map((r) => r.length));
  while (header.length < width) header.push("");
  const map = headerIdx >= 0 ? detectColumns(header, sheet.rows.slice(headerIdx + 1, headerIdx + 50)) : emptyMap();
  const missing: SheetAnalysis["missing"] = [];
  if (map.date < 0) missing.push("date");
  if (map.amount < 0 && map.debit < 0 && map.credit < 0) missing.push("amount");
  if (map.description < 0) missing.push("description");
  return { sheet, sheets: counts, headerIdx: headerRowIdx, header, map, needsMapping: headerIdx < 0 || missing.length > 0, missing, accountTail: preambleTail(sheet.rows, headerRowIdx) };
}

// ---------- rows → contract ----------

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const FOOTER = /^(\*{3}|end of statement|total|closing balance|opening balance|grand total)/i;

export interface XlsxParse extends ParseResult {
  /** emoji-stripped tag per transaction id (Paytm "Tags"), a hint for categorization only */
  tags: Record<string, string>;
  sheetName: string;
  headerRow: number;
}

export function parseSheet(a: SheetAnalysis, map: ColumnMap, fileName: string): XlsxParse {
  const { sheet, headerIdx } = a;
  const pending: { t: Omit<Transaction, "id">; sortKey: string; tag: string }[] = [];
  const unparsed: UnparsedRow[] = [];
  let total = 0;
  for (let i = headerIdx + 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    const cells = row.map(text);
    if (!cells.some(Boolean)) continue; // blank rows are not inputs
    total++;
    const index = sheet.firstRow + i + 1;
    const raw = cells.join(" | ");
    const fail = (reason: UnparsedRow["reason"], detail?: string) => unparsed.push({ index, raw, reason, ...(detail ? { detail } : {}) });
    const lead = cells.find(Boolean) ?? "";
    if (FOOTER.test(lead) && !parseDateCell(row[map.date])) {
      fail("not_a_transaction", "summary or footer row");
      continue;
    }
    const dateCell = row[map.date];
    if (!text(dateCell)) {
      fail("no_date");
      continue;
    }
    const date = parseDateCell(dateCell);
    if (!date) {
      fail("bad_date", `date cell "${text(dateCell)}"`);
      continue;
    }
    let paise = 0;
    let direction: "debit" | "credit" = "debit";
    if (map.amount >= 0) {
      const cell = row[map.amount];
      if (!text(cell)) {
        fail("no_amount");
        continue;
      }
      const a = parseAmountCell(cell);
      if (!a || a.paise <= 0) {
        fail("bad_amount", `amount cell "${text(cell)}"`);
        continue;
      }
      paise = a.paise;
      // pre-signed: direction comes from the sign, never re-applied to the amount
      if (a.sign !== 0) direction = a.sign < 0 ? "debit" : "credit";
      else if (map.type >= 0) direction = /cr|credit/i.test(text(row[map.type])) ? "credit" : "debit";
      else direction = "credit";
    } else {
      const dr = map.debit >= 0 ? parseAmountCell(row[map.debit]) : null;
      const cr = map.credit >= 0 ? parseAmountCell(row[map.credit]) : null;
      if (dr && dr.paise > 0) {
        paise = dr.paise;
        direction = "debit";
      } else if (cr && cr.paise > 0) {
        paise = cr.paise;
        direction = "credit";
      } else {
        const drT = map.debit >= 0 ? text(row[map.debit]) : "";
        const crT = map.credit >= 0 ? text(row[map.credit]) : "";
        fail(drT || crT ? "bad_amount" : "no_amount", drT || crT ? `debit "${drT}", credit "${crT}"` : undefined);
        continue;
      }
    }
    // full original string, per CONTRACT.md; prefixes like "Paid to" are stripped app-side by normalizeMerchant
    let desc = map.description >= 0 ? text(row[map.description]).replace(/\s+/g, " ") : "";
    if (!desc && map.vpa >= 0) desc = text(row[map.vpa]);
    if (!desc) {
      fail("no_pattern", "no description or payee in this row");
      continue;
    }
    const time = map.time >= 0 ? parseTimeCell(row[map.time]) : null;
    const source_line = cells
      .map((c, k) => (k === map.date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : k === map.time && time ? time : c))
      .map(csvCell)
      .join(",");
    pending.push({
      t: {
        date,
        amount: paise,
        direction,
        raw_description: desc,
        account_tail: a.accountTail,
        source_kind: "csv",
        source_file: fileName,
        source_line,
        merchant_normalized: null,
        category: null,
        category_source: null,
        confidence: null,
      },
      sortKey: `${date} ${time ?? "00:00:00"} ${String(i).padStart(6, "0")}`,
      tag: map.tags >= 0 ? cleanTag(row[map.tags]) : "",
    });
  }
  // exports list newest first; Date + Time give a stable chronological order
  pending.sort((x, y) => (x.sortKey < y.sortKey ? -1 : 1));
  const tags: Record<string, string> = {};
  const transactions: Transaction[] = pending.map((p, k) => {
    const id = `xlsx_${String(k + 1).padStart(4, "0")}`;
    if (p.tag) tags[id] = p.tag;
    return { id, ...p.t };
  });
  unparsed.sort((x, y) => x.index - y.index);
  return {
    transactions,
    unparsed,
    stats: { total_inputs: total, parsed: transactions.length, unparsed: unparsed.length, via_llm: 0 },
    tags,
    sheetName: sheet.name,
    headerRow: sheet.firstRow + headerIdx + 1,
  };
}
