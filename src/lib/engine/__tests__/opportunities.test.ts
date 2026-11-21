import { describe, it, expect } from "vitest";
import fixture from "../../../../contract/fixture.json";
import type { Advice, Transaction } from "../../types";
import { categorizeAll } from "../categorize";
import { detectRecurring } from "../recurring";
import { adviceId, findOpportunities, freshOpportunities } from "../opportunities";
import { computeGhost } from "../ghost";

const T = "2026-11-20";
const cat = categorizeAll(fixture.transactions as Transaction[], [], {}, {});
const rec = detectRecurring(cat, T);
const seeded = fixture.advice as Advice[];
const all = findOpportunities(cat, rec, T);
const fresh = freshOpportunities(all, seeded);

describe("live advice: opportunities are found and priced by our code", () => {
  it("finds the known patterns with computed monthly savings", () => {
    const by = (k: string) => all.find((o) => o.key.startsWith(k))!;
    expect(by("unused_rec_cult_fit").monthly_saving).toBe(129900);
    expect(by("price_rec_netflix").monthly_saving).toBe(30000);
    expect(by("growth_Dining").monthly_saving).toBeGreaterThan(0);
    expect(all.every((o) => Number.isInteger(o.monthly_saving) && o.monthly_saving > 0 && o.evidence_ids.length > 0)).toBe(true);
  });

  it("does not repeat what the seeded advice already covers", () => {
    expect(fresh.map((o) => o.kind).sort()).toEqual(["marketplace_orders", "new_subscription", "rides_with_pass"]);
    expect(fresh.find((o) => o.kind === "new_subscription")!.label).toBe("Country Delight");
    const rides = fresh.find((o) => o.kind === "rides_with_pass")!;
    expect(rides.monthly_saving).toBe(Math.round((rides.facts.ride_spend as number) * 0.5));
    const orders = fresh.find((o) => o.kind === "marketplace_orders")!;
    expect(orders.monthly_saving).toBe(orders.facts.avg_order);
  });

  it("an opportunity is never added twice", () => {
    const live: Advice[] = fresh.map((o) => ({ id: adviceId(o), date_given: T, text: o.label, projected_monthly_saving: o.monthly_saving, accepted: false, acted_on_date: null }));
    expect(freshOpportunities(all, [...seeded, ...live])).toHaveLength(0);
  });
});

describe("live advice in the Regret Engine", () => {
  const live: Advice[] = fresh.map((o) => ({ id: adviceId(o), date_given: T, text: `${o.label}.`, projected_monthly_saving: o.monthly_saving, accepted: false, acted_on_date: null }));
  const months = ["2026-11", "2027-02"];
  const base = computeGhost(seeded, cat, months, T, 0.06);
  const withLive = computeGhost([...seeded, ...live], cat, months, T, 0.06);

  it("appending advice dated today leaves today's regret unchanged and widens the future gap", () => {
    expect(withLive.regret).toBe(base.regret);
    expect(withLive.monthlyGap).toBe(base.monthlyGap + live.reduce((a, x) => a + x.projected_monthly_saving, 0));
    expect(withLive.potByMonth["2027-02"]).toBeGreaterThan(base.potByMonth["2027-02"]);
  });

  it("accepting a live piece moves the gap exactly as accepting a seeded one does", () => {
    const acceptLive = computeGhost([...seeded, { ...live[0], accepted: true, acted_on_date: T }, ...live.slice(1)], cat, months, T, 0.06);
    expect(withLive.monthlyGap - acceptLive.monthlyGap).toBe(live[0].projected_monthly_saving);
    const acceptSeeded = computeGhost([{ ...seeded[0], accepted: true, acted_on_date: T }, ...seeded.slice(1), ...live], cat, months, T, 0.06);
    expect(withLive.monthlyGap - acceptSeeded.monthlyGap).toBe(seeded[0].projected_monthly_saving);
  });

  it("uses the evidence rows recorded for live advice", () => {
    const g = computeGhost([...seeded, ...live], cat, months, T, 0.06, { [live[0].id]: ["x1", "x2"] });
    expect(g.items.find((i) => i.advice.id === live[0].id)!.evidenceIds).toEqual(["x1", "x2"]);
  });
});
