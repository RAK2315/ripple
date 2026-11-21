import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCsv } from "../csv";

describe("CSV Parser", () => {
  it("1. passes the worked example from BRIEF.md with full toEqual", () => {
    const text = `Txn Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance\n14/11/26,UPI/SWIGGY*ORDER/412//HDFC,0000431298765432,"1,234.50",,"45,120.10"`;

    const res = parseCsv(text, { sourceFile: "hdfc_nov.csv" });

    expect(res).toEqual({
      transactions: [
        {
          id: "csv_0001",
          date: "2026-11-14",
          amount: 123450,
          direction: "debit",
          raw_description: "UPI/SWIGGY*ORDER/412//HDFC",
          account_tail: null,
          source_kind: "csv",
          source_file: "hdfc_nov.csv",
          source_line:
            '14/11/26,UPI/SWIGGY*ORDER/412//HDFC,0000431298765432,"1,234.50",,"45,120.10"',
          merchant_normalized: null,
          category: null,
          category_source: null,
          confidence: null,
        },
      ],
      unparsed: [],
      stats: { total_inputs: 1, parsed: 1, unparsed: 0, via_llm: 0 },
    });
  });

  it("2. handles separate debit/credit column CSV with header on line 4 and shuffled columns", () => {
    const csv = [
      "Account No : XXXXXXXX4821",
      "Customer: Aarav Mehta",
      "Branch: Pune Main",
      "Deposit Amt,Particulars,Closing Balance,Txn Date,Withdrawal Amt",
      ',"UPI/RAMESH KULKARNI/RENT/HDFC","30,000.00",03/04/26,"22,000.00"',
      '"85,000.00","SALARY CREDIT ACME","1,15,000.00",01/04/26,',
    ].join("\n");

    const res = parseCsv(csv, { sourceFile: "bank_statement.csv" });

    expect(res.stats).toEqual({
      total_inputs: 2,
      parsed: 2,
      unparsed: 0,
      via_llm: 0,
    });
    expect(res.transactions).toHaveLength(2);
    expect(res.transactions[0]).toMatchObject({
      id: "csv_0001",
      date: "2026-04-03",
      amount: 2200000,
      direction: "debit",
      raw_description: "UPI/RAMESH KULKARNI/RENT/HDFC",
      account_tail: "4821",
    });
    expect(res.transactions[1]).toMatchObject({
      id: "csv_0002",
      date: "2026-04-01",
      amount: 8500000,
      direction: "credit",
      raw_description: "SALARY CREDIT ACME",
      account_tail: "4821",
    });
  });

  it("3. handles signed-amount CSV with Dr/Cr suffixes and ₹ prefixes", () => {
    const csv = [
      "Date,Description,Amount",
      "14/11/2026,SWIGGY ORDER,₹ 412.00 Dr",
      '15/11/2026,SALARY CREDIT,"₹ 85,000.00 Cr"',
      '16/11/2026,AMAZON SHOPPING,"- ₹ 1,234.50"',
    ].join("\n");

    const res = parseCsv(csv);

    expect(res.stats).toEqual({
      total_inputs: 3,
      parsed: 3,
      unparsed: 0,
      via_llm: 0,
    });
    expect(res.transactions[0]).toMatchObject({
      date: "2026-11-14",
      amount: 41200,
      direction: "debit",
      raw_description: "SWIGGY ORDER",
    });
    expect(res.transactions[1]).toMatchObject({
      date: "2026-11-15",
      amount: 8500000,
      direction: "credit",
      raw_description: "SALARY CREDIT",
    });
    expect(res.transactions[2]).toMatchObject({
      date: "2026-11-16",
      amount: 123450,
      direction: "debit",
      raw_description: "AMAZON SHOPPING",
    });
  });

  it("4. parses public/demo/statement.csv with 361 parsed and 0 unparsed", () => {
    const filePath = resolve(__dirname, "../../public/demo/statement.csv");
    const text = readFileSync(filePath, "utf-8");
    const res = parseCsv(text, { sourceFile: "statement.csv" });

    expect(res.stats.total_inputs).toBe(361);
    expect(res.stats.parsed).toBe(361);
    expect(res.stats.unparsed).toBe(0);
    expect(res.transactions).toHaveLength(361);
    expect(res.unparsed).toHaveLength(0);

    // Verify first transaction matches fixture
    expect(res.transactions[0]).toMatchObject({
      id: "csv_0001",
      date: "2026-04-01",
      amount: 8500000,
      direction: "credit",
      raw_description:
        "NEFT CR-CITI0000002-ACME TECHNOLOGIES PVT LTD-SALARY APR 2026",
    });
  });
});
