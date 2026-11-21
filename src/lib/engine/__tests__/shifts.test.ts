import { describe, it, expect } from "vitest";
import fixture from "../../../../contract/fixture.json";
import type { Transaction } from "../../types";
import { categorizeAll } from "../categorize";
import { detectRecurring } from "../recurring";
import { computeBaseline } from "../projection";
import { detectShifts, replan } from "../shifts";
import { computeNudges } from "../nudges";
import { DEMO_GOALS, DEMO_PROFILE } from "../../seed";

const T = "2026-11-20";

function salary(amounts: number[]): Transaction[] {
  return amounts.map((a, i) => ({
    id: `s${i}`,
    date: `2026-${String(i + 4).padStart(2, "0")}-01`,
    amount: a,
    direction: "credit",
    raw_description: "NEFT CR ACME SALARY",
    account_tail: null,
    source_kind: "synthetic",
    source_file: "x",
    source_line: "x",
    merchant_normalized: "Acme",
    category: "Income",
    category_source: "rule",
    confidence: 1,
  })) as Transaction[];
}

describe("shifts", () => {
  it("fixture: Netflix 199 → 499 is a fixed-cost shift", () => {
    const cat = categorizeAll(fixture.transactions as Transaction[], [], {}, {});
    const rec = detectRecurring(cat, T);
    const s = detectShifts(rec, T);
    const nf = s.find((x) => x.label.toLowerCase().includes("netflix"))!;
    expect(nf.kind).toBe("fixed");
    expect(nf.before).toBe(19900);
    expect(nf.after).toBe(49900);
  });

  it("salary cut of 20% is an income shift; 5% is not", () => {
    const cut = detectShifts(detectRecurring(salary([8500000, 8500000, 8500000, 8500000, 6800000, 6800000, 6800000]), T), T);
    expect(cut).toHaveLength(1);
    expect(cut[0]).toMatchObject({ kind: "income", before: 8500000, after: 6800000 });
    expect(cut[0].pct).toBeCloseTo(-0.2);
    const small = detectShifts(detectRecurring(salary([8500000, 8500000, 8500000, 8500000, 8100000, 8100000, 8100000]), T), T);
    expect(small).toHaveLength(0);
  });

  it("replan shows goal dates before vs after the change", () => {
    const cat = categorizeAll(fixture.transactions as Transaction[], [], {}, {});
    const rec = detectRecurring(cat, T);
    const base = computeBaseline(cat, rec, DEMO_PROFILE, [], T);
    const shift = { ...detectShifts(rec, T)[0], kind: "income" as const, before: base.income + 2000000, after: base.income };
    const r = replan(shift, base, DEMO_GOALS, DEMO_PROFILE.current_balance, T);
    expect(r[0].before! < r[0].after!).toBe(true);
  });
});

describe("nudges", () => {
  it("fixture November: Dining drifts, small or single-row categories do not", () => {
    const cat = categorizeAll(fixture.transactions as Transaction[], [], {}, {});
    const rec = detectRecurring(cat, T);
    const base = computeBaseline(cat, rec, DEMO_PROFILE, [], T);
    const n = computeNudges(cat, rec, base, DEMO_GOALS, DEMO_PROFILE.current_balance, T);
    const cats = n.map((x) => x.category);
    expect(cats).toContain("Dining");
    expect(cats).not.toContain("Fuel");
    expect(cats).not.toContain("Cash Withdrawal");
  });
});
