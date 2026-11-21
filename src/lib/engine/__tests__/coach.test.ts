import { describe, it, expect } from "vitest";
import { fillPlaceholders, isSecuritiesQuestion, monthlyToReach } from "../coach";

describe("coach guardrails", () => {
  it("flags requests to pick securities", () => {
    expect(isSecuritiesQuestion("which mutual fund should I buy")).toBe(true);
    expect(isSecuritiesQuestion("Which mutual fund should I buy for my bike?")).toBe(true);
    expect(isSecuritiesQuestion("should I invest in Reliance shares")).toBe(true);
    expect(isSecuritiesQuestion("best term insurance plan?")).toBe(true);
    expect(isSecuritiesQuestion("how can I save more on dining")).toBe(false);
    expect(isSecuritiesQuestion("when will I afford the bike")).toBe(false);
  });

  it("monthly amount to reach a goal", () => {
    expect(monthlyToReach(12000000, 0, 12, 0)).toBe(1000000);
    expect(monthlyToReach(12000000, 2000000, 10, 0)).toBe(1000000);
    const withRate = monthlyToReach(12000000, 0, 12, 0.06);
    expect(withRate).toBeLessThan(1000000);
    expect(withRate).toBeGreaterThan(960000);
    expect(monthlyToReach(100, 200, 12, 0)).toBe(0);
  });

  it("fills placeholders and rejects model-written digits", () => {
    expect(fillPlaceholders("You need {monthly} a month.", { monthly: "₹10,000" })).toBe("You need ₹10,000 a month.");
    expect(fillPlaceholders("You need 10000 a month.", {})).toBeNull();
    expect(fillPlaceholders("You need {nope}.", {})).toBeNull();
  });
});

import fixture from "../../../../contract/fixture.json";
import type { Transaction } from "../../types";
import { categorizeAll } from "../categorize";
import { detectRecurring } from "../recurring";
import { monthReview } from "../review";

describe("monthly review", () => {
  it("October: totals add up, categories compare with September", () => {
    const cat = categorizeAll(fixture.transactions as Transaction[], [], {}, {});
    const rec = detectRecurring(cat, "2026-11-20");
    const r = monthReview(cat, rec, "2026-10");
    expect(r.prevMonth).toBe("2026-09");
    expect(r.income).toBe(8500000 + cat.filter((t) => t.date.startsWith("2026-10") && t.direction === "credit" && t.amount !== 8500000).reduce((a, t) => a + t.amount, 0));
    expect(r.categories.reduce((a, c) => a + c.amount, 0)).toBe(r.spend);
    expect(r.net).toBe(r.income - r.spend);
    expect(r.opportunity).not.toBeNull();
  });
});
