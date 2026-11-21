import type { Category } from "../types";

/** Deterministic fallbacks used when the model is unavailable. Lower confidence so rows still get reviewed. */
export function heuristicCategory(
  desc: string,
  direction: "debit" | "credit",
  hint: { amount_rupees?: number; day?: number; count?: number } = {},
): { category: Category; confidence: number } {
  const u = desc.toUpperCase();
  if (direction === "credit") return { category: "Income", confidence: 0.6 };
  if (/\bRENT\b/.test(u)) return { category: "Rent", confidence: 0.75 };
  if (/\b(MAA|MOM|MUMMY|PAPA|DAD|FAMILY)\b/.test(u)) return { category: "Family Transfer", confidence: 0.7 };
  if (/SENT VIA|@YBL\/SENT|P2A|UPI TRANSFER/.test(u)) return { category: "Transfers", confidence: 0.55 };
  if (/SWEET|HALWAI|BAKERY|RESTAURANT|CAFE|DHABA/.test(u)) return { category: "Dining", confidence: 0.6 };
  if (/GENERAL STORES|KIRANA|PROVISION|SUPERMARKET/.test(u)) return { category: "Groceries", confidence: 0.6 };
  // a large, repeated payment early in the month is probably rent; flagged (0.55) so the user confirms
  if ((hint.count ?? 0) >= 3 && (hint.amount_rupees ?? 0) >= 15000 && (hint.day ?? 31) <= 7) return { category: "Rent", confidence: 0.55 };
  return { category: "Other", confidence: 0.3 };
}
