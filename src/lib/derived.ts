"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { useStorageHealth } from "./storage-health";
import { APP_TODAY, PROJECTION_MONTHS } from "./config";
import { categorizeAll } from "./engine/categorize";
import { detectRecurring } from "./engine/recurring";
import { balanceHistory, computeBaseline, project } from "./engine/projection";
import type { Assumption, Scenario } from "./types";

export function chainAssumptions(scenarios: Scenario[], id: string): Assumption[] {
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const chain: Assumption[][] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur.assumptions);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return chain.flat();
}

/** Everything computed from source data. Recomputes when any input changes, so a rule ripples everywhere. */
export function useDerived() {
  const s = useStore();
  const categorized = useMemo(
    () => categorizeAll(s.transactions, s.rules, s.llmCache, s.userOverrides),
    [s.transactions, s.rules, s.llmCache, s.userOverrides],
  );
  const recurring = useMemo(() => detectRecurring(categorized, APP_TODAY, s.markedUnused), [categorized, s.markedUnused]);
  const baseline = useMemo(
    () => computeBaseline(categorized, recurring, s.profile, s.fixedCosts, APP_TODAY),
    [categorized, recurring, s.profile, s.fixedCosts],
  );
  const history = useMemo(() => balanceHistory(categorized, s.profile.current_balance), [categorized, s.profile.current_balance]);
  const projectFor = useMemo(
    () => (scenarioId: string) =>
      project(baseline, chainAssumptions(s.scenarios, scenarioId), s.goals, s.profile.current_balance, APP_TODAY, PROJECTION_MONTHS),
    [baseline, s.scenarios, s.goals, s.profile.current_balance],
  );
  const main = useMemo(() => projectFor("main"), [projectFor]);
  const active = useMemo(() => projectFor(s.activeScenarioId), [projectFor, s.activeScenarioId]);
  const byId = useMemo(() => new Map(categorized.map((t) => [t.id, t])), [categorized]);
  return { categorized, recurring, baseline, history, main, active, projectFor, byId };
}

export function useHydrated(): boolean {
  const [h, setH] = useState(false);
  // unreadable saved state never finishes hydrating: treat that as done so the recovery screen can show
  const broken = useStorageHealth((x) => x.problem === "corrupt");
  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setH(true));
    if (useStore.persist.hasHydrated()) setH(true);
    return unsub;
  }, []);
  return h || broken;
}
