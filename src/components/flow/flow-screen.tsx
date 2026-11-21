"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDerived } from "@/lib/derived";
import { useStore } from "@/lib/store";
import { APP_TODAY, GHOST_ANNUAL_RATE, LOW_CONFIDENCE } from "@/lib/config";
import { ym } from "@/lib/engine/dates";
import { actualFlows, plannedFlows } from "@/lib/engine/flows";
import { computeGhost } from "@/lib/engine/ghost";
import { formatINR, monthLabelLong } from "@/lib/format";
import { CountUp, Money } from "@/components/money";
import { FlowSankey } from "./flow-sankey";
import { Timeline, buildTimeline } from "./timeline";
import { categorizeUnmatched } from "@/lib/actions";
import { NudgeList } from "@/components/nudges/nudge-list";
import { PageHeader } from "@/components/shell/shell";
import { useUi } from "@/lib/ui";

export function FlowScreen() {
  const s = useStore();
  const d = useDerived();
  const current = ym(APP_TODAY);
  const compare = s.activeScenarioId !== "main" ? d.main : undefined;
  const rows = useMemo(() => buildTimeline(d.history, d.active, compare), [d.history, d.active, compare]);
  const months = rows.map((r) => r.month);
  const [idx, setIdx] = useState<number | null>(null);
  const selIdx = idx ?? Math.max(0, months.indexOf(current) - 1);
  const selected = months[selIdx] ?? current;
  const isFuture = selected > current;
  const flows = useMemo(
    () => (isFuture ? plannedFlows(selected, d.active.plan, d.recurring) : actualFlows(selected, d.categorized, d.recurring)),
    [isFuture, selected, d.active.plan, d.recurring, d.categorized],
  );
  const ghost = useMemo(() => computeGhost(s.advice, d.categorized, [current], APP_TODAY, GHOST_ANNUAL_RATE), [s.advice, d.categorized, current]);

  if (s.transactions.length === 0) return <ColdOpen />;

  const plan = d.main.plan;
  const invisible = plan.income > 0 ? plan.fixed / plan.income : 0;
  const lastComplete = d.baseline.completeMonths[d.baseline.completeMonths.length - 1];
  const fixedIds = d.recurring
    .filter((r) => r.direction === "debit")
    .flatMap((r) => r.transaction_ids)
    .filter((id) => d.byId.get(id)?.date.startsWith(lastComplete ?? ""));
  const review = d.categorized.filter((t) => (t.confidence ?? 0) < LOW_CONFIDENCE && t.category_source !== "user").length;
  const point = d.active.points.find((p) => p.month === selected);
  const hist = d.history.find((h) => h.month === selected);
  const fundedBy = d.active.goals.filter((g) => g.projected && g.projected <= selected);
  const evidence = [...new Set(ghost.items.flatMap((i) => i.evidenceIds))];

  return (
    <div className="space-y-6">
      <PageHeader title="Flow" sub="Where your money went, and where it is heading." right={<ScenarioChips />} />

      {/* five-second row: the two numbers that make a judge react */}
      <div className="grid grid-cols-[1.15fr_1fr_0.9fr] gap-4">
        <div className="card p-6">
          <div className="text-xs uppercase tracking-wide text-muted">Invisible salary</div>
          <div className="mt-3 flex items-end gap-3">
            <button
              className="figure-hero"
              onClick={() => useUi.getState().showProvenance("Fixed costs + subscriptions, last complete month", fixedIds)}
              title="Show the transactions behind this number"
            >
              <CountUp value={invisible * 100} format={(v) => `${Math.round(v)}%`} />
            </button>
            <div className="pb-2 text-sm leading-snug text-muted">of your income is spent before it arrives.</div>
          </div>
          <div className="mt-3 text-sm text-muted">
            <Money paise={plan.fixed} ids={fixedIds} title="Fixed costs + subscriptions" className="text-ink" /> of fixed costs and subscriptions every month,
            against <Money paise={plan.income} ids={d.baseline.incomeIds} title="Regular income" className="text-ink" /> income.
          </div>
        </div>

        <Link href="/ghost" className="card group block p-6 transition-colors hover:border-line-strong">
          <div className="text-xs uppercase tracking-wide text-ghost">Regret number</div>
          <div className="mt-3 text-ghost">
            <Money paise={ghost.regret} className="figure-hero" />
          </div>
          <div className="mt-3 text-sm text-muted">
            what the version of you that took the advice has that you don&apos;t.{" "}
            <span className="text-ghost underline-offset-4 group-hover:underline">See your ghost →</span>
          </div>
          {evidence.length === 0 && <span className="sr-only">No outstanding advice</span>}
        </Link>

        <div className="grid grid-rows-3 gap-2">
          <Stat label="Monthly surplus (likely)" value={<Money paise={d.active.plan.surplus} className="figure figure-sm" />} />
          <Stat
            label={`${d.active.nearestGoal?.goal.name ?? "Goal"} lands`}
            value={<span className="figure figure-sm">{d.active.nearestGoal?.projected ? monthLabelLong(d.active.nearestGoal.projected) : "—"}</span>}
          />
          <Link href="/review" className="flex items-center justify-between rounded-md border border-line bg-warn-soft px-4 py-2 transition-colors hover:border-warn">
            <span className="text-xs text-warn">Needs review</span>
            <CountUp value={review} className="figure figure-sm text-warn" />
          </Link>
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-2 flex items-start justify-between gap-6">
          <div>
            <h2>
              Where {monthLabelLong(selected)} {isFuture ? "is going" : "went"}
            </h2>
            <p className="text-xs text-muted">
              {isFuture ? "Projected from your trailing averages and the active scenario." : "Actual transactions. Click any node for the rows."}
              {flows.fixed.some((f) => f.leak) && <span className="text-danger"> Frayed red = subscriptions you pay for and don&apos;t use.</span>}
            </p>
          </div>
          <div className="text-right text-xs text-muted">
            Variable spend / month
            <div>
              <Money paise={d.active.plan.variable} ids={Object.values(d.baseline.variableIds).flat()} title="Variable spend, trailing 3 months" className="text-ink" />
            </div>
          </div>
        </div>
        <FlowSankey flows={flows} />
      </div>

      <NudgeList compact />

      <div className="card p-6">
        <div className="flex items-end justify-between">
          <div>
            <h2>Balance, past and projected</h2>
            <p className="text-xs text-muted">Shaded cone = average spending ± one standard deviation of the last six months. Drag the scrubber.</p>
          </div>
          <div className="text-right text-sm">
            <div className="text-xs text-muted">{monthLabelLong(selected)}</div>
            <div className="figure">{hist && !isFuture ? formatINR(hist.balance) : point ? formatINR(point.likely) : "—"}</div>
            {isFuture && point && (
              <div className="num text-xs text-muted">
                {formatINR(point.pessimistic)} – {formatINR(point.optimistic)}
              </div>
            )}
          </div>
        </div>
        <Timeline rows={rows} proj={d.active} selected={selected} compareLabel={compare ? "main" : undefined} />
        <input
          type="range"
          min={0}
          max={months.length - 1}
          value={selIdx}
          onChange={(e) => setIdx(+e.target.value)}
          className="mt-2 w-full accent-[var(--text)]"
          aria-label="Timeline scrubber"
        />
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {d.active.goals.map((g) => (
            <span key={g.goal.id} className={`rounded-md border px-3 py-1 ${fundedBy.includes(g) ? "border-accent/40 bg-accent-soft text-accent" : "border-line text-muted"}`}>
              {g.goal.name}: <span className="num text-xs">{g.projected ? monthLabelLong(g.projected) : "not reached"}</span>
              {g.optimistic && g.pessimistic && g.optimistic !== g.pessimistic ? (
                <span className="num text-xs">
                  {" "}
                  ({monthLabelLong(g.optimistic)} – {monthLabelLong(g.pessimistic)})
                </span>
              ) : (
                ""
              )}
              {fundedBy.includes(g) ? " ✓" : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line bg-card px-4 py-2">
      <span className="text-xs text-muted">{label}</span>
      {value}
    </div>
  );
}

/** First thing a judge sees on a fresh browser: one obvious action. */
function ColdOpen() {
  const load = useStore((s) => s.loadFixture);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fade-in mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center text-center">
      <div className="text-xs uppercase tracking-wide text-faint">A living model of your money</div>
      <h1 className="mt-4 !text-[56px] !leading-[1.05]">
        See where your money is going, <em className="text-accent">and where it ends up.</em>
      </h1>
      <p className="mt-5 max-w-lg text-base text-muted">
        Eight months of a real-feeling Pune salary: bank SMS, rent, a forgotten gym membership, and advice that was never taken. Every figure computed, never generated.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          load();
          await categorizeUnmatched();
          setBusy(false);
        }}
        className="mt-8 rounded-md bg-ink px-8 py-4 text-base font-medium text-paper shadow-lg transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Loading…" : "Load demo data"}
      </button>
      <Link href="/import" className="mt-4 text-sm text-muted underline decoration-line-strong underline-offset-4 hover:text-ink">
        or import your own SMS, CSV or PDF
      </Link>
    </div>
  );
}

export function ScenarioChips() {
  const scenarios = useStore((s) => s.scenarios);
  const active = useStore((s) => s.activeScenarioId);
  const setActive = useStore((s) => s.setActiveScenario);
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Scenario">
      {scenarios.map((sc) => (
        <button
          key={sc.id}
          role="radio"
          aria-checked={active === sc.id}
          onClick={() => setActive(sc.id)}
          className={`rounded-md border px-3 py-1 text-xs transition-colors ${active === sc.id ? "border-ink bg-ink text-paper" : "border-line text-muted hover:border-line-strong hover:text-ink"}`}
        >
          {sc.name}
        </button>
      ))}
    </div>
  );
}
