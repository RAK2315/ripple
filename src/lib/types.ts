import type { Advice, Category, Transaction } from "../../contract/types";

export type { Advice, Category, Transaction };

export type RuleType = "contains" | "merchant_equals" | "amount_range" | "recurring_date";

export interface Rule {
  id: string;
  type: RuleType;
  /** contains: substring of raw_description (case-insensitive). merchant_equals: merchant_normalized. amount_range / recurring_date: substring too. */
  pattern: string;
  category: Category;
  /** paise, amount_range only */
  amount_min?: number;
  amount_max?: number;
  /** recurring_date only: day of month ±2 */
  day_of_month?: number;
  learned_from_transaction_id: string | null;
  created_at: string;
  active: boolean;
  /** how the rule was made: learned from one correction, or typed as a plain-language instruction on Review */
  source?: "correction" | "instruction";
  /** the instruction it came from, when source = "instruction" */
  instruction?: string;
}

export interface LlmCategory {
  category: Category;
  confidence: number;
  merchant: string;
}

export type Cadence = "weekly" | "monthly" | "yearly";
export type RecurringStatus = "active" | "changed" | "unused" | "new";

export interface Recurring {
  id: string;
  merchant_normalized: string;
  category: Category;
  amount: number;
  previous_amount: number | null;
  changed_on: string | null;
  cadence: Cadence;
  first_seen: string;
  last_seen: string;
  status: RecurringStatus;
  direction: "debit" | "credit";
  transaction_ids: string[];
  /** monthly-equivalent paise */
  monthly_amount: number;
  /** true when "unused" was inferred, not confirmed by the user */
  inferred_unused: boolean;
}

export interface FixedCost {
  id: string;
  name: string;
  amount: number;
  linked_recurring_id: string | null;
}

export interface Goal {
  id: string;
  name: string;
  target_amount: number;
  target_date: string; // YYYY-MM-DD
  priority: number; // 1 = first funded
  allocated_so_far: number;
}

export interface Profile {
  /** null = derived from data */
  monthly_income: number | null;
  emergency_fund_target: number;
  emergency_fund_current: number;
  /** account balance as of APP_TODAY, paise */
  current_balance: number;
  currency: "INR";
}

/** `from` = first month ("YYYY-MM") the assumption applies; omitted = from now. Amounts in paise. */
export type Assumption =
  | { kind: "category_pct"; category: Category; pct: number; from?: string }
  | { kind: "category_abs"; category: Category; amount: number; from?: string }
  | { kind: "category_set"; category: Category; amount: number; from?: string }
  | { kind: "income_change"; amount: number; from?: string }
  | { kind: "one_off"; label: string; amount: number; date: string }
  | { kind: "add_recurring"; label: string; amount: number; from?: string }
  | { kind: "remove_recurring"; label: string; amount: number; recurring_id?: string; from?: string }
  | { kind: "goal_change"; goal_id: string; target_amount?: number; target_date?: string };

export interface Scenario {
  id: string;
  name: string;
  parent_id: string | null;
  assumptions: Assumption[];
  created_at: string;
  is_main: boolean;
}

export interface AiPayloadLog {
  id: string;
  at: string;
  route: string;
  masked_payload: string;
}

export interface RefusalLog {
  id: string;
  at: string;
  question: string;
}
