import { CATEGORIES } from "../../../contract/types";
import type { Transaction } from "../types";

/**
 * Plain-language bulk rules ("put all entries of Maheshwari Mart and Pintu Kumar as stationery"). Pure.
 * The model (or the deterministic parser below, when it's unavailable) reads the sentence; this file decides what
 * is real: a merchant must exist in the user's data, a category is matched to an existing one or created by name.
 * Nothing is applied here: the Review screen previews every rule, editable, and the user confirms.
 */

export interface BulkRuleDraft {
  /** the merchant as it appears in the user's data (merchant_normalized) */
  merchant: string;
  category: string;
  /** true when the category doesn't exist yet and will be created on confirm */
  isNew: boolean;
}

export interface BulkParse {
  rules: BulkRuleDraft[];
  /** phrases we could not resolve to a merchant or a category: shown, never guessed */
  unresolved: string[];
}

/** Built-in plus the user's own categories. */
export function allCategories(custom: string[] = []): string[] {
  return [...CATEGORIES, ...custom.filter((c) => !(CATEGORIES as readonly string[]).includes(c))];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const title = (s: string) => s.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Existing category with that name (case-insensitive, "eating out" → Dining-style synonyms not attempted), or a new one. */
export function resolveCategory(name: string, categories: string[]): { category: string; isNew: boolean } | null {
  const n = norm(name);
  if (!n || n.length < 2) return null;
  const hit = categories.find((c) => norm(c) === n) ?? categories.find((c) => norm(c) === n.replace(/s$/, "") || norm(c).replace(/s$/, "") === n);
  return hit ? { category: hit, isNew: false } : { category: title(name).slice(0, 30), isNew: true };
}

/** Unique merchants in the data with their row counts, biggest first. */
export function merchantList(txns: Transaction[]): { merchant: string; count: number }[] {
  const m = new Map<string, number>();
  for (const t of txns) {
    const k = t.merchant_normalized ?? t.raw_description;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([merchant, count]) => ({ merchant, count })).sort((a, b) => b.count - a.count);
}

/** The merchant in the user's data that a phrase names, or null. Exact (case-insensitive) first, then containment. */
export function findMerchant(phrase: string, merchants: string[]): string | null {
  const p = norm(phrase);
  if (p.length < 3) return null;
  return merchants.find((m) => norm(m) === p) ?? merchants.find((m) => norm(m).includes(p) || (norm(m).length >= 4 && p.includes(norm(m)))) ?? null;
}

const LEAD = /^(?:please\s+)?(?:put|move|mark|tag|set|make|categori[sz]e|classify|file|treat|change|label)\s+(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:entries|transactions|payments|rows|everything)?\s*(?:of|from|for|to|at)?\s*/i;

/** Deterministic reading of "<verb> <merchants> as|to|under|into <category>", several clauses joined by ";" or "and then". */
export function parseInstruction(text: string, merchants: string[], categories: string[]): BulkParse {
  const rules: BulkRuleDraft[] = [];
  const unresolved: string[] = [];
  for (const clause of text.split(/;|\.\s+|\band then\b|\balso\b/i).map((c) => c.trim()).filter(Boolean)) {
    const m = clause.match(/^(.*)\s+(?:as|to|under|into|in)\s+(?:the\s+)?(?:category\s+)?["“]?([A-Za-z][A-Za-z &'-]{1,30}?)["”]?(?:\s+categor(?:y|ies))?\s*[.!]?$/i);
    if (!m) {
      unresolved.push(clause);
      continue;
    }
    const cat = resolveCategory(m[2], categories);
    const subject = m[1].replace(LEAD, "");
    const phrases = subject.split(/\s*(?:,|\band\b|&|\+)\s*/i).map((x) => x.trim()).filter(Boolean);
    if (!cat) {
      unresolved.push(m[2]);
      continue;
    }
    for (const ph of phrases) {
      const merchant = findMerchant(ph, merchants);
      if (merchant) {
        if (!rules.some((r) => r.merchant === merchant)) rules.push({ merchant, category: cat.category, isNew: cat.isNew });
      } else unresolved.push(ph);
    }
  }
  return { rules, unresolved };
}

/** Check what the model returned against the data: only real merchants survive; categories resolve the same way. */
export function validateModelRules(raw: { merchant: string; category: string }[], merchants: string[], categories: string[]): BulkParse {
  const rules: BulkRuleDraft[] = [];
  const unresolved: string[] = [];
  for (const r of raw) {
    const merchant = findMerchant(r.merchant ?? "", merchants);
    const cat = resolveCategory(r.category ?? "", categories);
    if (!merchant) unresolved.push(r.merchant);
    else if (!cat) unresolved.push(`${r.merchant} → ${r.category}`);
    else if (!rules.some((x) => x.merchant === merchant)) rules.push({ merchant, category: cat.category, isNew: cat.isNew });
  }
  return { rules, unresolved };
}
