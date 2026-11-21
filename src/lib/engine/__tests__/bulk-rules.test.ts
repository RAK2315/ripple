import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import fixture from "../../../../contract/fixture.json";
import type { Category, Rule, Transaction } from "../../types";
import { fallbackParseSms } from "../../ingest/fallback";
import { categorizeAll, previewRule } from "../categorize";
import { detectRecurring } from "../recurring";
import { computeBaseline } from "../projection";
import { actualFlows } from "../flows";
import { runTool, type InvestigateCtx } from "../investigate";
import { allCategories, merchantList, parseInstruction, validateModelRules } from "../bulk-rules";
import { DEMO_GOALS, DEMO_PROFILE } from "../../seed";

const T = "2026-11-20";

async function data() {
  const shops = await fallbackParseSms(readFileSync("public/demo/sms-shops.txt", "utf8"), { referenceDate: T });
  return [...(fixture.transactions as Transaction[]), ...shops.transactions];
}

const rule = (merchant: string, category: string): Rule => ({
  id: `r_${merchant}`,
  type: "merchant_equals",
  pattern: merchant.toUpperCase(),
  category: category as Category,
  learned_from_transaction_id: null,
  created_at: "2026-11-20T10:00:00.000Z",
  active: true,
  source: "instruction",
});

describe("plain-language bulk rules", () => {
  it("worked example: two merchants, one new category, previews, then recategorizes", async () => {
    const raw = await data();
    const cat = categorizeAll(raw, [], {}, {});
    const merchants = merchantList(cat).map((m) => m.merchant);
    const parsed = parseInstruction("put all entries of Maheshwari Mart and Pintu Kumar as stationery", merchants, allCategories([]));
    expect(parsed.unresolved).toEqual([]);
    expect(parsed.rules.map((r) => [r.merchant.toUpperCase(), r.category, r.isNew])).toEqual([
      ["MAHESHWARI MART", "Stationery", true],
      ["PINTU KUMAR", "Stationery", true],
    ]);
    // preview: how many existing rows each rule matches
    const rules = parsed.rules.map((r) => rule(r.merchant, r.category));
    expect(rules.map((r) => previewRule(r, cat).matched.length)).toEqual([3, 2]);
    // confirm: rows recategorize
    const after = categorizeAll(raw, rules, {}, {});
    const stationery = after.filter((t) => (t.category as string) === "Stationery");
    expect(stationery).toHaveLength(5);
    expect(stationery.every((t) => t.category_source === "rule")).toBe(true);
  });

  it("a custom category is treated like any other: flows, baseline, the agent's trend tool", async () => {
    const raw = await data();
    const rules = [rule("Maheshwari Mart", "Stationery"), rule("Pintu Kumar", "Stationery")];
    const cat = categorizeAll(raw, rules, {}, {});
    const rec = detectRecurring(cat, T);
    const base = computeBaseline(cat, rec, DEMO_PROFILE, [], T);
    expect((base.variableByCategory as Record<string, number>).Stationery).toBeGreaterThan(0);
    const flows = actualFlows("2026-10", cat, rec);
    expect(JSON.stringify(flows)).toContain("Stationery");
    const ctx: InvestigateCtx = { txns: cat, recurring: rec, baseline: base, goals: DEMO_GOALS, profile: DEMO_PROFILE, mainAssumptions: [], advice: [], today: T, categories: ["Stationery"] };
    const trend = runTool(ctx, "get_category_trend", { category: "stationery", months: 3 });
    expect(trend.error).toBeFalsy();
    expect(trend.ids).toHaveLength(3); // the three October rows; November is not a complete month yet
    expect(runTool({ ...ctx, categories: [] }, "get_category_trend", { category: "Stationery" }).error).toBe(true);
  });

  it("says what it could not resolve instead of guessing, and uses existing categories when they match", () => {
    const merchants = ["Swiggy", "Zomato", "Maheshwari Mart"];
    const p = parseInstruction("put Swiggy and Dominos as dining", merchants, allCategories([]));
    expect(p.rules).toEqual([{ merchant: "Swiggy", category: "Dining", isNew: false }]);
    expect(p.unresolved).toEqual(["Dominos"]);
    expect(parseInstruction("make it better", merchants, allCategories([])).rules).toEqual([]);
    // the model's answer is checked against the data: an invented merchant does not survive
    const v = validateModelRules([{ merchant: "Maheshwari Mart", category: "stationery" }, { merchant: "Big Bazaar", category: "Groceries" }], merchants, allCategories(["Stationery"]));
    expect(v.rules).toEqual([{ merchant: "Maheshwari Mart", category: "Stationery", isNew: false }]);
    expect(v.unresolved).toEqual(["Big Bazaar"]);
  });
});
