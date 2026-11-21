import { describe, it, expect } from "vitest";
import { parseCsv } from "../csv";
import { parseSms } from "../sms";
import { generateSyntheticData } from "../generator";
import type { Transaction } from "../../contract/types";

describe("Contract Shape Verification", () => {
  const EXPECTED_KEYS = [
    "id",
    "date",
    "amount",
    "direction",
    "raw_description",
    "account_tail",
    "source_kind",
    "source_file",
    "source_line",
    "merchant_normalized",
    "category",
    "category_source",
    "confidence",
  ].sort();

  function verifyTransactionShape(t: Transaction) {
    // 1. Keys exactly the 13
    expect(Object.keys(t).sort()).toEqual(EXPECTED_KEYS);

    // 2. id pattern ^[a-z0-9_-]{1,64}$
    expect(t.id).toMatch(/^[a-z0-9_-]{1,64}$/);

    // 3. date pattern ^\d{4}-\d{2}-\d{2}$
    expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // 4. integer amount > 0
    expect(Number.isInteger(t.amount)).toBe(true);
    expect(t.amount).toBeGreaterThan(0);

    // 5. direction is "debit" or "credit"
    expect(["debit", "credit"]).toContain(t.direction);

    // 6. raw_description is not empty
    expect(t.raw_description.length).toBeGreaterThan(0);

    // 7. account_tail is digits only (3 or 4 chars) or null
    if (t.account_tail !== null) {
      expect(t.account_tail).toMatch(/^\d{3,4}$/);
    }

    // 8. categorization fields always null
    expect(t.merchant_normalized).toBeNull();
    expect(t.category).toBeNull();
    expect(t.category_source).toBeNull();
    expect(t.confidence).toBeNull();
  }

  it("9. validates contract shape over all transactions produced by generator, csv parser, and sms parser", async () => {
    // Generator
    const fixture = generateSyntheticData();
    for (const t of fixture.transactions) {
      verifyTransactionShape(t);
    }

    // CSV Parser
    const csvResult = parseCsv(
      `Date,Narration,Amount\n2026-11-14,"SWIGGY",-412.00\n2026-11-01,"SALARY",85000.00`
    );
    for (const t of csvResult.transactions) {
      verifyTransactionShape(t);
    }

    // SMS Parser
    const smsResult = await parseSms(
      `Sent Rs.412.00\nFrom HDFC Bank A/C *4821\nTo SWIGGY\nOn 14/11/26\nRef 431298765432\nNot You?`
    );
    for (const t of smsResult.transactions) {
      verifyTransactionShape(t);
    }
  });
});
