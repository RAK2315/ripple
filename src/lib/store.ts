"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import fixture from "../../contract/fixture.json";
import type { Advice, AiPayloadLog, Category, FixedCost, Goal, LlmCategory, Profile, RefusalLog, Rule, Scenario, Transaction } from "./types";
import { DEMO_GOALS, DEMO_PROFILE, MAIN_SCENARIO } from "./seed";
import { STORE_KEY } from "./config";
import { normalizeMerchant } from "./engine/merchants";

/** Source data only. Everything derived is computed in engine/ via useDerived(). */
interface State {
  transactions: Transaction[];
  rules: Rule[];
  llmCache: Record<string, LlmCategory>;
  userOverrides: Record<string, Category>;
  profile: Profile;
  fixedCosts: FixedCost[];
  goals: Goal[];
  scenarios: Scenario[];
  advice: Advice[];
  /** evidence rows for advice generated live (seeded advice is matched by text) */
  adviceEvidence: Record<string, string[]>;
  markedUnused: Record<string, boolean>;
  nudgeAcks: Record<string, boolean>;
  refusals: RefusalLog[];
  aiLog: AiPayloadLog[];
  recurringNotes: Record<string, string>;
  activeScenarioId: string;
  lastImport: { at: string; source: string; parsed: number; unparsed: number } | null;
}

interface Actions {
  loadFixture: () => void;
  addTransactions: (txns: Transaction[], source: string, unparsed: number) => { added: number; duplicates: number };
  resetDemo: () => void;
  setLlmCache: (entries: Record<string, LlmCategory>) => void;
  setOverride: (id: string, category: Category) => void;
  addRule: (r: Rule) => void;
  updateRule: (id: string, patch: Partial<Rule>) => void;
  deleteRule: (id: string) => void;
  setProfile: (p: Partial<Profile>) => void;
  setGoals: (g: Goal[]) => void;
  setFixedCosts: (f: FixedCost[]) => void;
  upsertScenario: (s: Scenario) => void;
  deleteScenario: (id: string) => void;
  setActiveScenario: (id: string) => void;
  acceptAdvice: (id: string, date: string) => void;
  addAdvice: (a: Advice[]) => void;
  addLiveAdvice: (items: { advice: Advice; evidence: string[] }[]) => number;
  setUnused: (recurringId: string, unused: boolean) => void;
  ackNudge: (id: string) => void;
  logRefusal: (q: string) => void;
  logAi: (route: string, payload: string) => void;
  setRecurringNote: (id: string, note: string) => void;
}

const empty: State = {
  transactions: [],
  rules: [],
  llmCache: {},
  userOverrides: {},
  profile: DEMO_PROFILE,
  fixedCosts: [],
  goals: DEMO_GOALS,
  scenarios: [MAIN_SCENARIO],
  advice: [],
  adviceEvidence: {},
  markedUnused: {},
  nudgeAcks: {},
  refusals: [],
  aiLog: [],
  recurringNotes: {},
  activeScenarioId: "main",
  lastImport: null,
};

const dedupKey = (t: Transaction) => `${t.date}|${t.amount}|${t.direction}|${normalizeMerchant(t.raw_description).toUpperCase()}`;

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...empty,
      loadFixture: () =>
        set({
          transactions: fixture.transactions as Transaction[],
          advice: fixture.advice as Advice[],
          lastImport: { at: new Date().toISOString(), source: "fixture", parsed: fixture.transactions.length, unparsed: 0 },
        }),
      addTransactions: (txns, source, unparsed) => {
        const existing = new Set(get().transactions.map(dedupKey));
        const fresh = txns.filter((t) => !existing.has(dedupKey(t)));
        const ids = new Set(get().transactions.map((t) => t.id));
        const renamed = fresh.map((t) => (ids.has(t.id) ? { ...t, id: `${t.id}_${Math.random().toString(36).slice(2, 6)}` } : t));
        set((s) => ({
          transactions: [...s.transactions, ...renamed].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
          advice: s.advice.length ? s.advice : (fixture.advice as Advice[]),
          lastImport: { at: new Date().toISOString(), source, parsed: txns.length, unparsed },
        }));
        return { added: renamed.length, duplicates: txns.length - renamed.length };
      },
      resetDemo: () => set({ ...empty, llmCache: get().llmCache }),
      setLlmCache: (entries) => set((s) => ({ llmCache: { ...s.llmCache, ...entries } })),
      setOverride: (id, category) => set((s) => ({ userOverrides: { ...s.userOverrides, [id]: category } })),
      addRule: (r) => set((s) => ({ rules: [r, ...s.rules] })),
      updateRule: (id, patch) => set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      deleteRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
      setGoals: (goals) => set({ goals }),
      setFixedCosts: (fixedCosts) => set({ fixedCosts }),
      upsertScenario: (sc) =>
        set((s) => ({ scenarios: s.scenarios.some((x) => x.id === sc.id) ? s.scenarios.map((x) => (x.id === sc.id ? sc : x)) : [...s.scenarios, sc] })),
      deleteScenario: (id) =>
        set((s) => ({
          scenarios: s.scenarios.filter((x) => x.id !== id || x.is_main),
          activeScenarioId: s.activeScenarioId === id ? "main" : s.activeScenarioId,
        })),
      setActiveScenario: (activeScenarioId) => set({ activeScenarioId }),
      acceptAdvice: (id, date) => set((s) => ({ advice: s.advice.map((a) => (a.id === id ? { ...a, accepted: true, acted_on_date: date } : a)) })),
      addLiveAdvice: (items) => {
        const fresh = items.filter((x) => !get().advice.some((a) => a.id === x.advice.id));
        // appended after the seeded history, never replacing it
        set((s) => ({
          advice: [...s.advice, ...fresh.map((x) => x.advice)],
          adviceEvidence: { ...s.adviceEvidence, ...Object.fromEntries(fresh.map((x) => [x.advice.id, x.evidence])) },
        }));
        return fresh.length;
      },
      addAdvice: (a) => set((s) => ({ advice: [...s.advice, ...a.filter((x) => !s.advice.some((y) => y.text === x.text))] })),
      setUnused: (rid, unused) => set((s) => ({ markedUnused: { ...s.markedUnused, [rid]: unused } })),
      ackNudge: (id) => set((s) => ({ nudgeAcks: { ...s.nudgeAcks, [id]: true } })),
      logRefusal: (question) => set((s) => ({ refusals: [{ id: crypto.randomUUID(), at: new Date().toISOString(), question }, ...s.refusals] })),
      logAi: (route, masked_payload) =>
        set((s) => ({ aiLog: [{ id: crypto.randomUUID(), at: new Date().toISOString(), route, masked_payload }, ...s.aiLog].slice(0, 30) })),
      setRecurringNote: (id, note) => set((s) => ({ recurringNotes: { ...s.recurringNotes, [id]: note } })),
    }),
    { name: STORE_KEY, version: 1 },
  ),
);
