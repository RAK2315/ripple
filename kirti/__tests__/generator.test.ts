import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { generateSyntheticData, renderCsv, renderSmsDump } from "../generator";

describe("Synthetic Data Generator", () => {
  it("8. satisfies all generator requirements and generates samples", () => {
    const f1 = generateSyntheticData({ seed: 42 });
    const f2 = generateSyntheticData({ seed: 42 });

    // Deterministic for same seed
    expect(f1.transactions).toEqual(f2.transactions);
    expect(f1.advice).toEqual(f2.advice);
    expect(f1.user).toEqual({ name: "Aarav Mehta", city: "Pune" });
    expect(f1.contract_version).toBe("1.0.0");

    // Exactly 14 Bhagwati rows
    const bhagwati = f1.transactions.filter((t) =>
      t.raw_description.includes("BHAGWATI")
    );
    expect(bhagwati).toHaveLength(14);
    for (const b of bhagwati) {
      expect(b.amount).toBeGreaterThanOrEqual(11000);
      expect(b.amount).toBeLessThanOrEqual(18000);
    }

    // Netflix: 19900 before Aug (Apr, May, Jun, Jul), 49900 from Aug (Aug, Sep, Oct, Nov)
    const netflix = f1.transactions.filter((t) =>
      t.raw_description.includes("NETFLIX")
    );
    expect(netflix.length).toBeGreaterThanOrEqual(8);
    for (const n of netflix) {
      if (n.date < "2026-08-01") {
        expect(n.amount).toBe(19900);
      } else {
        expect(n.amount).toBe(49900);
      }
    }

    // 5 advice items all accepted: false, acted_on_date: null
    expect(f1.advice).toHaveLength(5);
    for (const a of f1.advice) {
      expect(a.accepted).toBe(false);
      expect(a.acted_on_date).toBeNull();
      expect(a.projected_monthly_saving).toBeGreaterThan(0);
      expect(a.id).toMatch(/^adv_[a-z0-9_-]+$/);
    }

    // All transactions have all 13 keys with the four categorization fields null, dates valid, positive integers
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

    for (const t of f1.transactions) {
      expect(Object.keys(t).sort()).toEqual(EXPECTED_KEYS);
      expect(t.merchant_normalized).toBeNull();
      expect(t.category).toBeNull();
      expect(t.category_source).toBeNull();
      expect(t.confidence).toBeNull();
      expect(t.id).toMatch(/^syn_\d{4}$/);
      expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isInteger(t.amount)).toBe(true);
      expect(t.amount).toBeGreaterThan(0);
      expect(["debit", "credit"]).toContain(t.direction);
    }

    // Render CSV and SMS dump
    const csv = renderCsv(f1);
    expect(csv).toContain("Date,Narration,Amount\n");
    expect(csv.split("\n").length).toBe(f1.transactions.length + 2); // header + rows + trailing newline

    const smsDump = renderSmsDump(f1);
    const smsBlocks = smsDump.trim().split(/\n\n+/);
    expect(smsBlocks.length).toBe(f1.transactions.length);

    // Write samples to kirti/samples/
    const samplesDir = resolve(__dirname, "../samples");
    mkdirSync(samplesDir, { recursive: true });
    writeFileSync(resolve(samplesDir, "synthetic.json"), JSON.stringify(f1, null, 2));
    writeFileSync(resolve(samplesDir, "synthetic.csv"), csv);
    writeFileSync(resolve(samplesDir, "synthetic-sms.txt"), smsDump);
  });
});
