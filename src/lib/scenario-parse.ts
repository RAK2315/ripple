import type { Category } from "./types";

/** What the model (or the regex fallback) returns: parameters lifted from the user's sentence, never computed figures. */
export interface RawAssumption {
  kind: "category_pct" | "category_abs" | "category_set" | "income_change" | "income_pct" | "income_stop" | "one_off" | "add_recurring" | "remove_recurring" | "goal_change";
  category?: Category | null;
  pct?: number | null;
  amount_rupees?: number | null;
  label?: string | null;
  date?: string | null;
  from_month?: string | null;
  recurring_id?: string | null;
  goal_id?: string | null;
  target_amount_rupees?: number | null;
  target_date?: string | null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function num(s: string): number {
  const m = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k|thousand|l|lakh|lac)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const u = (m[2] ?? "").toLowerCase();
  return u === "k" || u === "thousand" ? n * 1000 : u.startsWith("l") ? n * 100000 : n;
}

const CAT_WORDS: [RegExp, Category][] = [
  [/eating out|dining|food delivery|swiggy|zomato|restaurants?|takeout/, "Dining"],
  [/groceries|grocery/, "Groceries"],
  [/rent/, "Rent"],
  [/shopping|amazon|clothes/, "Shopping"],
  [/transport|cabs?|uber|ola|commute/, "Transport"],
  [/travel|trips?|holidays?/, "Travel"],
  [/subscriptions?|ott|streaming/, "Subscriptions"],
  [/fuel|petrol/, "Fuel"],
];

/** Regex fallback for common phrasings, so the demo never depends on the model. */
export function regexScenario(text: string, recurring: { id: string; merchant: string }[], today: string): RawAssumption[] {
  const t = text.toLowerCase();
  const out: RawAssumption[] = [];
  const clauses = t.split(/\band\b|,|;/);
  for (const c of clauses) {
    const cat = CAT_WORDS.find(([re]) => re.test(c))?.[1];
    let m: RegExpMatchArray | null;
    if (/quit|lose my job|resign|laid off|no income/.test(c)) {
      const mi = MONTHS.findIndex((mo) => new RegExp(`\\b${mo}`).test(c));
      const year = mi >= 0 && mi + 1 <= +today.slice(5, 7) ? +today.slice(0, 4) + 1 : +today.slice(0, 4);
      out.push({ kind: "income_stop", from_month: mi >= 0 ? `${year}-${String(mi + 1).padStart(2, "0")}` : null });
      continue;
    }
    if ((m = c.match(/(salary|income|pay)\D*(up|increase|rise|hike)\D*?(\d+(?:\.\d+)?)\s*(%|percent)/))) {
      out.push({ kind: "income_pct", pct: +m[3] });
      continue;
    }
    if (/metro pass|gym|netflix|spotify|youtube|cult/.test(c) && /lose|cancel|drop|stop|without|no more/.test(c)) {
      const key = c.match(/metro|gym|cult|netflix|spotify|youtube/)![0];
      const r = recurring.find((x) => x.merchant.toLowerCase().includes(key === "gym" ? "cult" : key));
      if (r) out.push({ kind: "remove_recurring", recurring_id: r.id, label: r.merchant });
      continue;
    }
    if (!cat) continue;
    if ((m = c.match(/by (a third|third|half|a quarter|quarter|\d+(?:\.\d+)?\s*(%|percent))/)) && /cut|reduce|lower|less|down|drop/.test(c)) {
      const w = m[1];
      const pct = /third/.test(w) ? 33.3 : /half/.test(w) ? 50 : /quarter/.test(w) ? 25 : parseFloat(w);
      out.push({ kind: "category_pct", category: cat, pct: -pct });
    } else if ((m = c.match(/(up|increase|rise|more|goes up)\D*by\s*(₹|rs\.?\s*)?([\d,.]+\s*(k|thousand|l|lakh)?)/))) {
      out.push({ kind: "category_abs", category: cat, amount_rupees: num(m[3]) });
    } else if ((m = c.match(/(goes to|becomes|to|=)\s*(₹|rs\.?\s*)?([\d,.]+\s*(k|thousand|l|lakh)?)/))) {
      out.push({ kind: "category_set", category: cat, amount_rupees: num(m[3]) });
    } else if ((m = c.match(/(\d+(?:\.\d+)?)\s*(%|percent)/))) {
      out.push({ kind: "category_pct", category: cat, pct: /cut|reduce|less|down/.test(c) ? -+m[1] : +m[1] });
    }
  }
  return out;
}
