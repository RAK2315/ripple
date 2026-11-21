"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDerived } from "@/lib/derived";
import { useStore } from "@/lib/store";
import { APP_TODAY, LOW_CONFIDENCE } from "@/lib/config";
import { ym } from "@/lib/engine/dates";
import { actualFlows, plannedFlows } from "@/lib/engine/flows";
import { formatINR, monthLabelLong } from "@/lib/format";
import { Money } from "@/components/money";
import { FlowSankey } from "./flow-sankey";
import { Timeline, buildTimeline } from "./timeline";
import { categorizeUnmatched } from "@/lib/actions";
import { NudgeList } from "@/components/nudges/nudge-list";
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

  if (s.transactions.length === 0) {
    return (
      <div className="card mx-auto mt-16 max-w-xl p-10 text-center">
        <h1 className="text-2xl font-semibold">Start with how you actually see your money.</h1>
        <p className="mt-3 text-muted">Paste your bank SMS alerts, drop a statement CSV, a PDF or a UPI screenshot.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/import" className="rounded-lg bg-ink px-5 py-2.5 text-sm text-white">
            Import transactions
          </Link>
          <button
            onClick={async () => {
              s.loadFixture();
              await categorizeUnmatched();
            }}
            className="rounded-lg border border-line px-5 py-2.5 text-sm"
          >
            Load demo profile
          </button>
        </div>
      </div>
    );
  }

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[1.2fr_1fr] gap-6">
        <div className="card p-6">
          <div className="text-xs uppercase tracking-wide text-muted">Invisible salary</div>
          <div className="mt-2 flex items-baseline gap-3">
            <button
              className="num text-6xl font-semibold tracking-tight"
              onClick={() => useUi.getState().showProvenance("Fixed costs + subscriptions, last complete month", fixedIds)}
              title="Show the transactions behind this number"
            >
              {Math.round(invisible * 100)}%
            </button>
            <div className="text-sm text-muted">of your income is spent before it arrives.</div>
          </div>
          <div className="mt-3 text-sm text-muted">
            <Money paise={plan.fixed} ids={fixedIds} title="Fixed costs + subscriptions" className="text-ink" /> of fixed costs and subscriptions every month,
            against <Money paise={plan.income} ids={d.baseline.incomeIds} title="Regular income" className="text-ink" /> income.
          </div>
        </div>
        <div className="card grid grid-cols-2 gap-4 p-6">
          <Stat label="Monthly surplus (likely)" value={<Money paise={d.active.plan.surplus} />} />
          <Stat
            label="Variable spend / month"
            value={<Money paise={d.active.plan.variable} ids={Object.values(d.baseline.variableIds).flat()} title="Variable spend, trailing 3 months" />}
          />
          <Stat
            label={`${d.active.nearestGoal?.goal.name ?? "Goal"} lands`}
            value={d.active.nearestGoal?.projected ? monthLabelLong(d.active.nearestGoal.projected) : "—"}
          />
          <Link href="/review" className="rounded-lg bg-warn-soft p-3 text-sm">
            <div className="text-xs text-warn">Needs review</div>
            <div className="num text-xl font-semibold text-warn">{review}</div>
          </Link>
        </div>
      </div>

      <NudgeList compact />

      <div className="card p-6">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Where {monthLabelLong(selected)} {isFuture ? "is going" : "went"}
            </h2>
            <p className="text-xs text-muted">
              {isFuture ? "Projected from your trailing averages and the active scenario." : "Actual transactions. Click any node for the rows."}
              {flows.fixed.some((f) => f.leak) && <span className="text-danger"> Red = subscriptions you pay for and don&apos;t use.</span>}
            </p>
          </div>
          <ScenarioChips />
        </div>
        <FlowSankey flows={flows} />
      </div>

      <div className="card p-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">Balance, past and projected</h2>
            <p className="text-xs text-muted">Shaded cone = average spending ± one standard deviation of the last six months. Drag the scrubber.</p>
          </div>
          <div className="text-right text-sm">
            <div className="text-muted">{monthLabelLong(selected)}</div>
            <div className="num text-xl font-semibold">
              {hist && !isFuture ? formatINR(hist.balance) : point ? formatINR(point.likely) : "—"}
            </div>
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
          className="mt-2 w-full accent-[#16182b]"
          aria-label="Timeline scrubber"
        />
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {d.active.goals.map((g) => (
            <span key={g.goal.id} className={`rounded-full px-3 py-1 ${fundedBy.includes(g) ? "bg-accent-soft text-accent" : "bg-paper text-muted"}`}>
              {g.goal.name}: {g.projected ? monthLabelLong(g.projected) : "not reached"}
              {g.optimistic && g.pessimistic && g.optimistic !== g.pessimistic ? ` (${monthLabelLong(g.optimistic)} – ${monthLabelLong(g.pessimistic)})` : ""}
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
    <div className="rounded-lg bg-paper p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-semibold">{value}</div>
    </div>
  );
}

export function ScenarioChips() {
  const scenarios = useStore((s) => s.scenarios);
  const active = useStore((s) => s.activeScenarioId);
  const setActive = useStore((s) => s.setActiveScenario);
  return (
    <div className="flex flex-wrap gap-1.5">
      {scenarios.map((sc) => (
        <button
          key={sc.id}
          onClick={() => setActive(sc.id)}
          className={`rounded-full border px-3 py-1 text-xs ${active === sc.id ? "border-ink bg-ink text-white" : "border-line text-muted hover:text-ink"}`}
        >
          {sc.name}
        </button>
      ))}
    </div>
  );
}
