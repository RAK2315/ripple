import { describe, it, expect } from "vitest";
import fixture from "../../../../contract/fixture.json";
import type { Advice, Transaction } from "../../types";
import { categorizeAll } from "../categorize";
import { computeGhost, potAt, adviceEvidence, ghostSeries } from "../ghost";

const T = "2026-11-20";
const cat = categorizeAll(fixture.transactions as Transaction[], [], {}, {});
const advice = fixture.advice as Advice[];

describe("ghost", () => {
  it("pot with zero rate is saving × months after the advice month", () => {
    expect(potAt(150000, "2026-05", "2026-11", 0)).toBe(150000 * 6);
    expect(potAt(150000, "2026-05", "2026-05", 0)).toBe(0);
  });

  it("compounding adds a little on top", () => {
    const flat = potAt(100000, "2026-01", "2026-12", 0);
    const grown = potAt(100000, "2026-01", "2026-12", 0.06);
    expect(grown).toBeGreaterThan(flat);
    expect(grown).toBeLessThan(flat * 1.04);
  });

  it("accepted advice leaves the regret", () => {
    const all = computeGhost(advice, cat, ["2026-11"], T, 0);
    const some = computeGhost(advice.map((a, i) => (i === 0 ? { ...a, accepted: true, acted_on_date: T } : a)), cat, ["2026-11"], T, 0);
    expect(all.regret).toBe(9000_00 + 4 * 1299_00 + 4 * 129_00 + 3 * 300_00 + 2 * 2800_00);
    expect(some.regret).toBe(all.regret - 9000_00);
    expect(all.potByMonth["2026-11"]).toBe(all.regret);
  });

  it("finds evidence that cult.fit advice was not followed", () => {
    const cult = advice.find((a) => a.text.includes("cult.fit"))!;
    const ids = adviceEvidence(cult, cat);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => cat.find((t) => t.id === id)!.date > cult.date_given)).toBe(true);
  });

  it("ghost series is real + pot, never below real", () => {
    const rows = ghostSeries([{ month: "2026-10", balance: 100 }], [{ month: "2026-11", likely: 200, optimistic: 0, pessimistic: 0 }], { "2026-10": 5, "2026-11": 9 });
    expect(rows).toEqual([
      { month: "2026-10", real: 100, ghost: 105, future: false },
      { month: "2026-11", real: 200, ghost: 209, future: true },
    ]);
  });
});
