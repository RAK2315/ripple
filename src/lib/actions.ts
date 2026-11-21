"use client";
import { useStore } from "./store";
import { callApi } from "./api";
import { categorizeAll, llmKey } from "./engine/categorize";
import { normalizeMerchant } from "./engine/merchants";
import type { Advice, LlmCategory } from "./types";
import { detectRecurring } from "./engine/recurring";
import { adviceId, findOpportunities, freshOpportunities, type Opportunity } from "./engine/opportunities";
import { APP_TODAY } from "./config";
import { dateLabel, formatINR } from "./format";

/** Stage 3 of categorization: send rows no rule or starter entry matched to the model, one entry per unique merchant. */
export async function categorizeUnmatched(): Promise<{ sent: number; usedModel: boolean }> {
  const s = useStore.getState();
  const cat = categorizeAll(s.transactions, s.rules, s.llmCache, s.userOverrides);
  const pending = new Map<string, { key: string; description: string; direction: "debit" | "credit"; merchant: string; amount_rupees: number; day: number; count: number }>();
  for (const t of cat) {
    if (t.category_source !== "llm" || t.confidence !== 0) continue;
    const key = llmKey(t);
    if (s.llmCache[key]) continue;
    const p = pending.get(key);
    if (p) p.count++;
    else pending.set(key, { key, description: t.raw_description, direction: t.direction, merchant: normalizeMerchant(t.raw_description), amount_rupees: Math.round(t.amount / 100), day: +t.date.slice(8, 10), count: 1 });
  }
  if (pending.size === 0) return { sent: 0, usedModel: false };
  const res = await callApi<Record<string, LlmCategory>>("categorize", { items: [...pending.values()] });
  if (res.ok && res.data) useStore.getState().setLlmCache(res.data);
  return { sent: pending.size, usedModel: !!res.usedModel };
}


/**
 * Live advice agent: our engine finds and prices the savings opportunities in the history; the model picks the
 * top three and words them (figures only via placeholders). Appended after the seeded advice, dated today.
 */
export async function generateAdvice(): Promise<{ added: number; usedModel: boolean; covered: number }> {
  const s = useStore.getState();
  const cat = categorizeAll(s.transactions, s.rules, s.llmCache, s.userOverrides);
  const rec = detectRecurring(cat, APP_TODAY, s.markedUnused);
  const all = findOpportunities(cat, rec, APP_TODAY);
  const fresh = freshOpportunities(all, s.advice).slice(0, 6);
  if (!fresh.length) return { added: 0, usedModel: false, covered: all.length };
  const money = (k: string, v: number | string) =>
    typeof v === "number" && !/per_month|pct|share/.test(k) ? formatINR(v) : /since|changed_on/.test(k) && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? dateLabel(String(v)) : String(v);
  const facts = (o: Opportunity) => ({ saving: formatINR(o.monthly_saving), ...Object.fromEntries(Object.entries(o.facts).map(([k, v]) => [k, money(k, v)])) });
  const res = await callApi<{ key: string; text: string; source: string }[]>("advice", {
    candidates: fresh.map((o) => ({ key: o.key, kind: o.kind, label: o.label, action: o.action, category: o.category, facts: facts(o) })),
  });
  const picks = res.ok && res.data ? res.data : [];
  const items = picks
    .map((p) => {
      const o = fresh.find((x) => x.key === p.key);
      if (!o) return null;
      const advice: Advice = { id: adviceId(o), date_given: APP_TODAY, text: p.text, projected_monthly_saving: o.monthly_saving, accepted: false, acted_on_date: null };
      return { advice, evidence: o.evidence_ids };
    })
    .filter((x): x is { advice: Advice; evidence: string[] } => !!x);
  return { added: useStore.getState().addLiveAdvice(items), usedModel: !!res.usedModel, covered: all.length - fresh.length };
}
