import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { analyzeSheets, cleanTag, parseAmountCell, parseDateCell, parseSheet, readWorkbook } from "../xlsx";
import { categorizeLines } from "../../ai/payloads";
import { mask } from "../../ai/mask";
import { normalizeMerchant } from "../../engine/merchants";

const FX = "src/lib/ingest/__fixtures__";
const load = async (f: string) => readWorkbook(new Uint8Array(fs.readFileSync(`${FX}/${f}`)));

describe("xlsx cell parsing", () => {
  it("dates are day-first and must be real calendar dates", () => {
    expect(parseDateCell("02/10/2026")).toBe("2026-10-02");
    expect(parseDateCell("14/11/26")).toBe("2026-11-14");
    expect(parseDateCell("12-Nov-2026")).toBe("2026-11-12");
    expect(parseDateCell("31/02/2026")).toBeNull();
    expect(parseDateCell("45/13/26")).toBeNull();
  });
  it("amounts are strict and keep their sign separately", () => {
    expect(parseAmountCell("-229.96")).toEqual({ paise: 22996, sign: -1 });
    expect(parseAmountCell("+2,000.00")).toEqual({ paise: 200000, sign: 1 });
    expect(parseAmountCell(-186.5)).toEqual({ paise: 18650, sign: -1 });
    expect(parseAmountCell("1,234.50 Dr")).toEqual({ paise: 123450, sign: -1 });
    expect(parseAmountCell("abc")).toBeNull();
    expect(parseAmountCell("12abc")).toBeNull();
  });
  it("tags lose their emoji", () => {
    expect(cleanTag("🍔 #Food")).toBe("#Food");
    expect(cleanTag("💸 #Transfers")).toBe("#Transfers");
  });
});

describe("Paytm passbook export", () => {
  it("picks the history sheet, finds the header below metadata, parses every row or reports it", async () => {
    const sheets = await load("paytm-sample.xlsx");
    expect(sheets.map((s) => s.name)).toEqual(["Summary", "Wallet Payment History", "Passbook Payment History"]);
    const a = analyzeSheets(sheets);
    expect(a.sheet.name).toBe("Passbook Payment History");
    expect(a.needsMapping).toBe(false);
    const r = parseSheet(a, a.map, "paytm.xlsx");
    expect(r.headerRow).toBe(5);

    // invariants from CONTRACT.md
    expect(r.stats).toEqual({ total_inputs: 10, parsed: 8, unparsed: 2, via_llm: 0 });
    expect(r.unparsed.map((u) => [u.index, u.reason])).toEqual([
      [14, "bad_amount"],
      [15, "no_date"],
    ]);

    const by = (d: string) => r.transactions.find((t) => t.raw_description === d)!;
    expect(by("Paid to Burger King")).toMatchObject({ date: "2026-10-02", amount: 22996, direction: "debit", source_kind: "csv", source_file: "paytm.xlsx" });
    expect(by("Money sent to Karan Malhotra")).toMatchObject({ amount: 150000, direction: "debit" });
    expect(by("Received from Ananya Rao")).toMatchObject({ amount: 200000, direction: "credit" });
    expect(by("Paid to Uber India")).toMatchObject({ amount: 18650, direction: "debit" }); // numeric cell, pre-signed
    expect(by("Money sent to Priya")).toMatchObject({ date: "2026-10-21", amount: 30000 }); // native Excel date cell
    expect(by("Cashback received")).toMatchObject({ amount: 2500, direction: "credit" });

    // chronological ids, Date + Time combined in the source line
    expect(r.transactions.map((t) => t.date)).toEqual([...r.transactions.map((t) => t.date)].sort());
    expect(by("Paid to Burger King").source_line.startsWith("02/10/2026,12:41:07,Paid to Burger King")).toBe(true);
    for (const t of r.transactions) {
      expect(Object.keys(t)).toHaveLength(13);
      expect(t.merchant_normalized).toBeNull();
      expect(t.category).toBeNull();
    }
    expect(Object.values(r.tags)).toContain("#Food");
    expect(Object.values(r.tags).join(" ")).not.toMatch(/\p{Extended_Pictographic}/u);

    // the merchant is derived app-side; the raw description keeps the full string
    expect(normalizeMerchant("Paid to Burger King")).toBe("Burger King");
    expect(normalizeMerchant("Money sent to Karan Malhotra")).toBe("Karan Malhotra");
  });

  it("privacy: a person's name and UPI handle never reach the model payload", async () => {
    const sheets = await load("paytm-sample.xlsx");
    const a = analyzeSheets(sheets);
    const r = parseSheet(a, a.map, "paytm.xlsx");
    // the same items categorizeUnmatched() sends, through the same builder the /api/categorize route uses
    const items = r.transactions.map((t, i) => ({
      key: `k${i}`,
      description: t.raw_description,
      direction: t.direction,
      merchant: normalizeMerchant(t.raw_description),
      amount_rupees: Math.round(t.amount / 100),
      day: +t.date.slice(8, 10),
      count: 1,
    }));
    const payload = categorizeLines(items);
    for (const secret of ["Karan", "Malhotra", "Priya", "Ananya", "Rao"]) expect(payload).not.toContain(secret);
    expect(payload).toContain("Money sent to [NAME]");
    expect(payload).toContain("Paid to Burger King"); // merchants stay readable for the model

    // the VPA column lives in source_line; any model call that includes it is masked too
    const lines = r.transactions.map((t) => mask(t.source_line)).join("\n");
    for (const secret of ["3014", "ananya.rao", "9876543210", "Karan", "Priya"]) expect(lines).not.toContain(secret);
    expect(lines).toContain("[UPI-ID]@ptaxi");
  });
});

describe("generic bank exports", () => {
  for (const f of ["bank-sample.xlsx", "bank-sample.xls"]) {
    it(`${f}: preamble, debit/credit columns, account tail`, async () => {
      const a = analyzeSheets(await load(f));
      expect(a.needsMapping).toBe(false);
      const r = parseSheet(a, a.map, f);
      expect(r.stats.parsed).toBe(2);
      expect(r.transactions[0]).toMatchObject({ date: "2026-11-14", amount: 41200, direction: "debit", account_tail: "4821" });
      expect(r.transactions[1]).toMatchObject({ date: "2026-11-15", amount: 8500000, direction: "credit" });
    });
  }

  it("unreadable headers ask the user to map columns, then parse with that mapping", async () => {
    const a = analyzeSheets(await load("unmapped-sample.xlsx"));
    expect(a.needsMapping).toBe(true);
    expect(a.header).toEqual(["When", "What", "How much"]);
    const r = parseSheet(a, { ...a.map, date: 0, description: 1, amount: 2 }, "x.xlsx");
    expect(r.transactions.map((t) => [t.raw_description, t.amount, t.direction])).toEqual([
      ["Coffee", 12000, "debit"],
      ["Refund", 50000, "credit"],
    ]);
  });
});
