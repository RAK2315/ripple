import { mask } from "./mask";

/** One unique merchant sent for categorization. Built client-side in categorizeUnmatched(). */
export interface CategorizeItem {
  key: string;
  description: string;
  direction: "debit" | "credit";
  merchant: string;
  amount_rupees: number;
  day: number;
  count: number;
}

/**
 * The exact text a categorize batch sends to the model, and that "What the AI sees" shows.
 * Only the masked description, direction and rounded amount leave the server; never the merchant key or source line.
 */
export function categorizeLines(batch: CategorizeItem[]): string {
  return batch.map((it, i) => `${i}. [${it.direction}] ${mask(it.description)} | ~₹${it.amount_rupees} | day ${it.day} | seen ${it.count}x`).join("\n");
}
