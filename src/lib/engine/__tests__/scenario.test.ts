import { describe, it, expect } from "vitest";
import fixture from "../../../../contract/fixture.json";
import type { Transaction } from "../../types";
import { categorizeAll } from "../categorize";
import { detectRecurring } from "../recurring";
import { computeBaseline, project } from "../projection";
import { convertRaw } from "../scenario";
import { regexScenario } from "../../scenario-parse";
import { DEMO_GOALS, DEMO_PROFILE } from "../../seed";

const T = "2026-11-20";
const cat = categorizeAll(fixture.transactions as Transaction[], [], {}, {});
const rec = detectRecurring(cat, T);
const base = computeBaseline(cat, rec, DEMO_PROFILE, [], T);

describe("scenario conversion", () => {
  it("regex fallback parses the demo sentence and converts to paise", () => {
    const raw = regexScenario("what if rent goes up by 6000 and I cut eating out by a third", [], T);
    const a = convertRaw(raw, { recurring: rec, income: base.income, today: T });
    expect(a).toEqual([
      { kind: "category_abs", category: "Rent", amount: 600000 },
      { kind: "category_pct", category: "Dining", pct: -33.3 },
    ]);
  });

  it("income_stop becomes a dated negative income change; income_pct is computed from baseline", () => {
    const a = convertRaw(
      [
        { kind: "income_stop", from_month: "2027-03" },
        { kind: "income_pct", pct: 10 },
      ],
      { recurring: rec, income: 5000000, today: T },
    );
    expect(a[0]).toEqual({ kind: "income_change", amount: -5000000, from: "2027-03" });
    expect(a[1]).toEqual({ kind: "income_change", amount: 500000 });
  });

  it("remove_recurring uses the detected monthly amount, drops unknown ids", () => {
    const r = rec.find((x) => x.direction === "debit")!;
    const a = convertRaw(
      [
        { kind: "remove_recurring", recurring_id: r.id },
        { kind: "remove_recurring", recurring_id: "nope" },
      ],
      { recurring: rec, income: 0, today: T },
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: "remove_recurring", amount: r.monthly_amount, recurring_id: r.id });
  });

  it("demo scenario pushes the bike goal later", () => {
    const raw = regexScenario("what if rent goes up by 6000 and I cut eating out by a third", [], T);
    const a = convertRaw(raw, { recurring: rec, income: base.income, today: T });
    const main = project(base, [], DEMO_GOALS, DEMO_PROFILE.current_balance, T, 24);
    const b = project(base, a, DEMO_GOALS, DEMO_PROFILE.current_balance, T, 24);
    const bikeA = main.goals.find((g) => g.goal.id === "goal_bike")!.projected!;
    const bikeB = b.goals.find((g) => g.goal.id === "goal_bike")!.projected!;
    console.log("bike main", bikeA, "scenario", bikeB);
    expect(bikeB >= bikeA).toBe(true);
  });
});
