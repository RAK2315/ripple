import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import fixture from "../../../../contract/fixture.json";
import type { Advice, Transaction } from "../../types";
import { categorizeAll } from "../../engine/categorize";
import { detectRecurring } from "../../engine/recurring";
import { computeBaseline } from "../../engine/projection";
import { findOpportunities } from "../../engine/opportunities";
import { runTool, type InvestigateCtx } from "../../engine/investigate";
import { DEMO_GOALS, DEMO_PROFILE } from "../../seed";
import { personNames, protect } from "../protect";

/**
 * D6: no person's name from the demo data reaches ANY model call, on every route, including the investigation
 * agent and derived identifiers (rec_ramesh_kulkarni). generateText is mocked so this captures exactly what each
 * route would send; every body goes through protect() with the names callApi derives, as the browser does.
 */
const sent: string[] = [];
vi.mock("ai", async (orig) => {
  const real = await orig<typeof import("ai")>();
  return {
    ...real,
    generateText: vi.fn(async (opts: { system?: string; prompt?: unknown; messages?: unknown }) => {
      sent.push(JSON.stringify({ system: opts.system, prompt: opts.prompt, messages: opts.messages }));
      throw new Error("mocked: no network in tests");
    }),
  };
});

const NAMES = /ramesh|kulkarni|sunita|mehta|aarav/i;
const T = "2026-11-20";
const sms = readFileSync("public/demo/sms-dump.txt", "utf8");
const txns = categorizeAll(fixture.transactions as Transaction[], [], {}, {});
const rec = detectRecurring(txns, T);
const names = personNames([...txns.map((t) => t.raw_description), ...sms.split(/\n\s*\n/)]);

async function call(route: string, body: unknown) {
  const { POST } = await import(`@/app/api/${route}/route`);
  const p = protect(body, names);
  const payload = route === "vision" ? { ...(p.body as object), _names: names } : p.body;
  const before = sent.length;
  const res: Response = await POST(new Request(`http://test/api/${route}`, { method: "POST", body: JSON.stringify(payload) }));
  const json = await res.json();
  return { json, calls: sent.slice(before) };
}

beforeAll(() => {
  process.env.GROQ_API_KEY = "test-key";
});

describe("privacy: every model payload", () => {
  it("the demo data really contains these people (so the test can fail)", () => {
    expect(names.join("|")).toMatch(/ramesh kulkarni/i);
    expect(names.join("|")).toMatch(/sunita mehta/i);
    expect(rec.map((r) => r.id)).toContain("rec_ramesh_kulkarni");
    expect(sms).toMatch(NAMES);
  });

  it("no route sends a name, in text or in a derived id", async () => {
    const ramesh = txns.find((t) => /RAMESH/i.test(t.raw_description))!;
    const r = rec.find((x) => x.id === "rec_ramesh_kulkarni")!;
    const opps = findOpportunities(txns, rec, T);
    const ctx: InvestigateCtx = {
      txns,
      recurring: rec,
      baseline: computeBaseline(txns, rec, DEMO_PROFILE, [], T),
      goals: DEMO_GOALS,
      profile: DEMO_PROFILE,
      mainAssumptions: [],
      advice: fixture.advice as Advice[],
      today: T,
    };
    const steps = (["get_recurring", "get_profile", "query_transactions"] as const).map((t) => runTool(ctx, t, { category: "Other" }));
    const routes: [string, unknown][] = [
      ["categorize", { items: txns.slice(0, 120).map((t, i) => ({ key: `${t.direction}:${t.raw_description.toUpperCase()}`, description: t.raw_description, direction: t.direction, merchant: t.merchant_normalized, amount_rupees: 100, day: 1, count: 1 + i })) }],
      ["sms-fallback", { messages: sms.split(/\n\s*\n/).slice(0, 40) }],
      ["propose-rule", { description: ramesh.raw_description, merchant: ramesh.merchant_normalized, amount: ramesh.amount, date: ramesh.date, oldCategory: "Other", newCategory: "Rent", examples: txns.filter((t) => t.merchant_normalized === ramesh.merchant_normalized).map((t) => t.raw_description) }],
      ["scenario", { text: "what if I stop paying Ramesh Kulkarni and Sunita", recurring: rec.map((x) => ({ id: x.id, merchant: x.merchant_normalized, category: x.category })), goals: DEMO_GOALS.map((g) => ({ id: g.id, name: g.name })), categoriesWithSpend: ["Rent", "Dining"], today: T }],
      ["explain", { items: [{ id: r.id, merchant: r.merchant_normalized, category: r.category, before_rupees: 18000, after_rupees: 20000, changed_on: "2026-09-01" }] }],
      ["advice", { candidates: [...opps.slice(0, 3), { ...opps[0], key: `unused_${r.id}`, label: r.merchant_normalized, action: `Stop paying ${r.merchant_normalized}` }].map((o) => ({ key: o.key, kind: o.kind, label: o.label, action: o.action, category: o.category, facts: { saving: "₹1,000" } })) }],
      ["coach", { question: "Why do I pay Ramesh Kulkarni so much? Ask Sunita Mehta.", facts: { goal_name: "Bike", surplus: "₹19,664" } }],
      ["narrative", { facts: { month: "Oct 2026", opportunity: `stopping payments for ${r.merchant_normalized}` } }],
      ["investigate", { question: "Why do I pay Ramesh Kulkarni so much?", steps: steps.map((s) => ({ tool: s.tool, args: s.args, data: s.data })), mustConclude: false, context: { today: T, goals: [] } }],
      ["vision", { kind: "pdf", data: readFileSync("public/demo/statement-oct.pdf").toString("base64"), mediaType: "application/pdf", fileName: "statement-oct.pdf" }],
    ];
    const leaks: string[] = [];
    for (const [route, body] of routes) {
      const { json, calls } = await call(route, body);
      expect(calls.length, `${route} made no model call`).toBeGreaterThan(0);
      for (const c of calls) if (NAMES.test(c)) leaks.push(`${route}: ${c.match(new RegExp(`.{0,60}(${NAMES.source}).{0,40}`, "i"))?.[0]}`);
      // "What the AI sees" shows the same masked text
      if (json.masked && NAMES.test(json.masked)) leaks.push(`${route} (panel): ${json.masked.match(new RegExp(`.{0,60}(${NAMES.source}).{0,40}`, "i"))?.[0]}`);
    }
    expect(leaks).toEqual([]);
  }, 60000);

  it("ids the model hands back still resolve to the real recurring id", () => {
    const p = protect({ recurring: [{ id: "rec_ramesh_kulkarni", merchant: "Ramesh Kulkarni" }] }, names);
    const sentId = (p.body as { recurring: { id: string }[] }).recurring[0].id;
    expect(sentId).not.toMatch(NAMES);
    expect(p.restore({ recurring_id: sentId })).toEqual({ recurring_id: "rec_ramesh_kulkarni" });
  });
});
