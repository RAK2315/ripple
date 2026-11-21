import type { Category, LlmCategory, Rule, Transaction } from "../types";
import { normalizeMerchant, starterMatch } from "./merchants";
import { formatINR } from "../format";

export function ruleMatches(rule: Rule, t: Transaction, merchant: string): boolean {
  if (!rule.active) return false;
  const p = rule.pattern.trim().toUpperCase();
  if (!p) return false;
  const desc = t.raw_description.toUpperCase();
  switch (rule.type) {
    case "contains":
      return desc.includes(p);
    case "merchant_equals":
      return merchant.toUpperCase() === p;
    case "amount_range":
      return desc.includes(p) && t.amount >= (rule.amount_min ?? 0) && t.amount <= (rule.amount_max ?? Infinity);
    case "recurring_date": {
      const day = +t.date.slice(8, 10);
      return desc.includes(p) && rule.day_of_month != null && Math.abs(day - rule.day_of_month) <= 2;
    }
  }
}

export function ruleToEnglish(rule: Rule): string {
  const cat = rule.category;
  switch (rule.type) {
    case "contains":
      return `If the description contains “${rule.pattern}”, the category is ${cat}.`;
    case "merchant_equals":
      return `If the merchant is “${rule.pattern}”, the category is ${cat}.`;
    case "amount_range":
      return `If the description contains “${rule.pattern}” and the amount is between ${formatINR(rule.amount_min ?? 0)} and ${formatINR(rule.amount_max ?? 0)}, the category is ${cat}.`;
    case "recurring_date":
      return `If “${rule.pattern}” is charged around day ${rule.day_of_month} of the month, the category is ${cat}.`;
  }
}

/** Key used for LLM cache: the normalized merchant (so 14 tiffin rows with different refs cost one lookup). */
export function llmKey(t: Transaction): string {
  return `${t.direction}:${normalizeMerchant(t.raw_description).toUpperCase()}`;
}

/**
 * Three-stage pipeline, pure. Order: user override → learned rules (newest first) → starter list → LLM cache → unknown.
 * Unknown rows get category "Other", confidence 0, so they are flagged for review.
 */
export function categorizeAll(
  txns: Transaction[],
  rules: Rule[],
  llmCache: Record<string, LlmCategory>,
  userOverrides: Record<string, Category>,
): Transaction[] {
  const ordered = [...rules].filter((r) => r.active).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return txns.map((t) => {
    const baseMerchant = normalizeMerchant(t.raw_description);
    const cached = llmCache[llmKey(t)];
    const merchant = starterMatch(t.raw_description)?.name ?? cached?.merchant ?? baseMerchant;
    const out = (category: Category, source: Transaction["category_source"], confidence: number): Transaction => ({
      ...t,
      merchant_normalized: merchant,
      category,
      category_source: source,
      confidence,
    });
    const user = userOverrides[t.id];
    if (user) return out(user, "user", 1);
    const rule = ordered.find((r) => ruleMatches(r, t, merchant));
    if (rule) return out(rule.category, "rule", 1);
    const starter = starterMatch(t.raw_description);
    if (starter) return out(starter.category, "starter_list", 0.95);
    if (cached) return out(cached.category, "llm", cached.confidence);
    if (t.direction === "credit") return out("Income", "starter_list", 0.5);
    return out("Other", "llm", 0);
  });
}

/** Which rows a candidate rule would match, and how many of them would actually change category. */
export function previewRule(rule: Rule, categorized: Transaction[]): { matched: Transaction[]; changed: Transaction[] } {
  const matched = categorized.filter((t) => ruleMatches({ ...rule, active: true }, t, t.merchant_normalized ?? ""));
  const changed = matched.filter((t) => t.category !== rule.category && t.category_source !== "user");
  return { matched, changed };
}
