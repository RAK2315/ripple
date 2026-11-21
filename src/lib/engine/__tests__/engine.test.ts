import { describe, it, expect } from "vitest";
import fixture from "../../../../contract/fixture.json";
import type { Transaction } from "../../types";
import { categorizeAll, previewRule } from "../categorize";
import { detectRecurring } from "../recurring";
import { computeBaseline, project, balanceHistory, goalImpactDays } from "../projection";
import { DEMO_GOALS, DEMO_PROFILE } from "../../seed";

const raw = fixture.transactions as Transaction[];
const T = "2026-11-20";
const cat = categorizeAll(raw, [], {}, {});
const rec = detectRecurring(cat, T);

describe("engine on fixture", () => {
  it("categorizes known merchants via starter list, leaves locals flagged", () => {
    const sw = cat.find((t) => t.raw_description.includes("SWIGGY"))!;
    expect(sw.category).toBe("Dining");
    expect(sw.category_source).toBe("starter_list");
    const bt = cat.filter((t) => t.raw_description.includes("BHAGWATI"));
    expect(bt).toHaveLength(14);
    expect(bt.every((t) => t.confidence === 0)).toBe(true);
  });
  it("detects recurring with netflix changed and country delight new", () => {
    const nf = rec.find((r) => r.merchant_normalized === "Netflix")!;
    expect(nf.status).toBe("changed");
    expect(nf.previous_amount).toBe(19900);
    expect(nf.amount).toBe(49900);
    expect(nf.changed_on).toBe("2026-08-07");
    expect(rec.find((r) => r.merchant_normalized === "Country Delight")?.status).toBe("new");
    expect(rec.find((r) => r.merchant_normalized === "Swiggy")).toBeUndefined();
    console.log(rec.map((r) => `${r.merchant_normalized} ${r.cadence} ${r.amount / 100} ${r.status} ${r.category}`).join("\n"));
  });
  it("rule preview matches 14 tiffin rows", () => {
    const p = previewRule({ id: "r", type: "contains", pattern: "BHAGWATI TIFFIN", category: "Dining", learned_from_transaction_id: null, created_at: "x", active: true }, cat);
    expect(p.matched).toHaveLength(14);
    expect(p.changed).toHaveLength(14);
  });
  it("projects", () => {
    const base = computeBaseline(cat, rec, DEMO_PROFILE, [], T);
    const pr = project(base, [], DEMO_GOALS, DEMO_PROFILE.current_balance, T, 24);
    console.log("income", base.income / 100, "plan", JSON.stringify(pr.plan), "sigma", base.variableSigma / 100);
    console.log(pr.goals.map((g) => `${g.goal.name} ${g.projected} (${g.optimistic}..${g.pessimistic})`).join("\n"));
    const sc = project(base, [{ kind: "category_abs", category: "Rent", amount: 600000 }, { kind: "category_pct", category: "Dining", pct: -33.3 }], DEMO_GOALS, DEMO_PROFILE.current_balance, T, 24);
    console.log("scenario", sc.goals.map((g) => `${g.goal.name} ${g.projected}`).join(" | "));
    console.log("history", balanceHistory(cat, DEMO_PROFILE.current_balance).map((h) => `${h.month}:${h.balance / 100}`).join(" "));
    expect(goalImpactDays(240000, pr.plan.surplus)).toBeGreaterThan(0);
  });
});
