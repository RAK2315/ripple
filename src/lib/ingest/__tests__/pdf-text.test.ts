import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractText, getDocumentProxy } from "unpdf";
import { parsePdfText } from "../pdf-text";

describe("text-layer PDF, deterministic floor (no model)", () => {
  it("reads every row of the demo statement with exact amounts and directions", async () => {
    const pdf = await getDocumentProxy(new Uint8Array(readFileSync("public/demo/statement-oct.pdf")));
    const text = (await extractText(pdf, { mergePages: true })).text as string;
    const r = parsePdfText(text, "statement-oct.pdf");
    expect(r.transactions).toHaveLength(55); // the model path also reads 55/55 on this file
    expect(r.unparsed).toEqual([]);
    const salary = r.transactions.find((t) => /SALARY/.test(t.raw_description))!;
    expect(salary).toMatchObject({ date: "2026-10-01", amount: 8500000, direction: "credit", source_kind: "pdf" });
    expect(r.transactions.find((t) => /RAMESH KULKARNI/.test(t.raw_description))).toMatchObject({ amount: 2200000, direction: "debit", date: "2026-10-03" });
    expect(r.transactions.find((t) => /ZOMATO/.test(t.raw_description))!.amount).toBe(60300);
    expect(r.transactions.filter((t) => t.direction === "credit")).toHaveLength(1);
    expect(r.transactions.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isInteger(t.amount) && t.amount > 0)).toBe(true);
  });

  it("uses a running balance column for direction when present, and reports rows without an amount", () => {
    const text = [
      "Date Narration Amount Balance",
      "01/10/2026 Opening Balance 50,000.00",
      "02/10/2026 UPI/SWIGGY/123 450.00 49,550.00",
      "03/10/2026 IMPS-REFUND FROM SHOP 200.00 49,750.00",
      "04/10/2026 MYSTERY ROW WITH NO AMOUNT",
    ].join("\n");
    const r = parsePdfText(text, "s.pdf");
    expect(r.transactions.map((t) => [t.raw_description, t.amount, t.direction])).toEqual([
      ["UPI/SWIGGY/123", 45000, "debit"],
      ["IMPS-REFUND FROM SHOP", 20000, "credit"],
    ]);
    expect(r.unparsed.map((u) => u.reason)).toEqual(["no_amount"]);
  });
});
