import type { Goal, Profile, Scenario } from "./types";

export const DEMO_PROFILE: Profile = {
  monthly_income: null,
  emergency_fund_target: 20000000,
  emergency_fund_current: 12000000,
  current_balance: 24800000,
  currency: "INR",
};

export const DEMO_GOALS: Goal[] = [
  { id: "goal_bike", name: "Bike", target_amount: 12500000, target_date: "2027-06-30", priority: 1, allocated_so_far: 0 },
  { id: "goal_laptop", name: "Laptop", target_amount: 11000000, target_date: "2027-12-31", priority: 2, allocated_so_far: 0 },
];

export const MAIN_SCENARIO: Scenario = {
  id: "main",
  name: "main",
  parent_id: null,
  assumptions: [],
  created_at: "2026-11-20T00:00:00.000Z",
  is_main: true,
};
