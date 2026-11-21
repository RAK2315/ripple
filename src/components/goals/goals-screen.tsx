"use client";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useDerived } from "@/lib/derived";
import { formatINR, monthLabelLong, uid } from "@/lib/format";
import { Money } from "@/components/money";
import type { Goal } from "@/lib/types";

const input = "rounded-md border border-line bg-raised px-2 py-2 text-sm";
const toR = (p: number) => Math.round(p / 100);
const toP = (v: string) => Math.round((+v || 0) * 100);

export function GoalsScreen() {
  const s = useStore();
  const d = useDerived();
  const derivedIncome = d.recurring.filter((r) => r.direction === "credit").sort((a, b) => b.monthly_amount - a.monthly_amount)[0];
  const detectedFixed = d.recurring.filter((r) => r.direction === "debit" && r.status !== "unused");
  const manual = s.fixedCosts.filter((f) => !f.linked_recurring_id);
  const goals = [...s.goals].sort((a, b) => a.priority - b.priority);

  const setGoal = (id: string, patch: Partial<Goal>) => s.setGoals(s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const move = (id: string, dir: -1 | 1) => {
    const i = goals.findIndex((g) => g.id === id);
    const j = i + dir;
    if (j < 0 || j >= goals.length) return;
    const next = [...goals];
    [next[i], next[j]] = [next[j], next[i]];
    s.setGoals(next.map((g, k) => ({ ...g, priority: k + 1 })));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Goals & Profile</h1>
        <p className="text-sm text-muted">Pre-filled from your transactions. Edit anything; every screen recomputes.</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card space-y-4 p-6">
          <h2 className="text-lg font-semibold">Money in and on hand</h2>
          <Field label="Monthly income">
            <input
              type="number"
              className={`${input} num w-36`}
              value={s.profile.monthly_income != null ? toR(s.profile.monthly_income) : ""}
              placeholder={derivedIncome ? String(toR(derivedIncome.monthly_amount)) : "0"}
              onChange={(e) => s.setProfile({ monthly_income: e.target.value === "" ? null : toP(e.target.value) })}
              aria-label="Monthly income"
            />
            <span className="text-xs text-muted">
              {s.profile.monthly_income == null ? (
                <>
                  Detected from <Money paise={derivedIncome?.monthly_amount ?? 0} ids={derivedIncome?.transaction_ids} title="Largest regular credit" /> ({derivedIncome?.merchant_normalized})
                </>
              ) : (
                <button className="underline" onClick={() => s.setProfile({ monthly_income: null })}>
                  use detected
                </button>
              )}
            </span>
          </Field>
          <Field label="Account balance today">
            <input type="number" className={`${input} num w-36`} value={toR(s.profile.current_balance)} onChange={(e) => s.setProfile({ current_balance: toP(e.target.value) })} />
          </Field>
          <Field label="Emergency fund">
            <input type="number" className={`${input} num w-28`} value={toR(s.profile.emergency_fund_current)} onChange={(e) => s.setProfile({ emergency_fund_current: toP(e.target.value) })} />
            <span className="text-xs text-muted">of</span>
            <input type="number" className={`${input} num w-28`} value={toR(s.profile.emergency_fund_target)} onChange={(e) => s.setProfile({ emergency_fund_target: toP(e.target.value) })} />
            <span className="text-xs text-muted">
              {s.profile.emergency_fund_target > 0 ? `${Math.round((s.profile.emergency_fund_current / s.profile.emergency_fund_target) * 100)}%` : ""}
            </span>
          </Field>
          <div className="rounded-lg bg-paper p-3 text-sm">
            Monthly surplus on this profile: <Money paise={d.main.plan.surplus} className="font-semibold" />
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold">Fixed costs</h2>
          <p className="text-xs text-muted">
            Detected recurring payments (edit or mark unused in <Link href="/subscriptions" className="underline">Subscriptions</Link>) plus anything else you pay that the bank data cannot see.
          </p>
          <div className="mt-3 divide-y divide-line text-sm">
            {detectedFixed.map((r) => (
              <div key={r.id} className="flex justify-between py-2">
                <span>
                  {r.merchant_normalized} <span className="text-xs text-muted">· {r.category} · detected</span>
                </span>
                <Money paise={r.monthly_amount} ids={r.transaction_ids} title={r.merchant_normalized} />
              </div>
            ))}
            {manual.map((f) => (
              <div key={f.id} className="flex items-center gap-2 py-2">
                <input className={`${input} flex-1`} value={f.name} onChange={(e) => s.setFixedCosts(s.fixedCosts.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)))} />
                <input
                  type="number"
                  className={`${input} num w-28`}
                  value={toR(f.amount)}
                  onChange={(e) => s.setFixedCosts(s.fixedCosts.map((x) => (x.id === f.id ? { ...x, amount: toP(e.target.value) } : x)))}
                />
                <button className="text-xs text-muted hover:text-danger" onClick={() => s.setFixedCosts(s.fixedCosts.filter((x) => x.id !== f.id))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => s.setFixedCosts([...s.fixedCosts, { id: uid("fc"), name: "e.g. house help (cash)", amount: 0, linked_recurring_id: null }])}
            className="mt-3 rounded-md border border-dashed border-line px-3 py-1 text-xs text-muted hover:text-ink"
          >
            + Add a fixed cost
          </button>
          <div className="mt-3 flex justify-between border-t border-line pt-2 text-sm font-medium">
            <span>Total fixed / month</span>
            <Money paise={d.main.plan.fixed} />
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold">Goals</h2>
        <p className="text-xs text-muted">Funded in priority order from the monthly surplus. Projected dates are computed, not guessed.</p>
        <div className="mt-4 space-y-2">
          {goals.map((g, i) => {
            const r = d.main.goals.find((x) => x.goal.id === g.id);
            return (
              <div key={g.id} className="grid grid-cols-[50px_1fr_150px_160px_190px_40px] items-center gap-3 rounded-lg bg-paper px-3 py-2" data-testid="goal-row">
                <div className="flex flex-col text-xs text-muted">
                  <button onClick={() => move(g.id, -1)} disabled={i === 0} className="disabled:opacity-20" aria-label="Move up">
                    ▲
                  </button>
                  <button onClick={() => move(g.id, 1)} disabled={i === goals.length - 1} className="disabled:opacity-20" aria-label="Move down">
                    ▼
                  </button>
                </div>
                <input className={input} value={g.name} onChange={(e) => setGoal(g.id, { name: e.target.value })} aria-label="Goal name" />
                <label className="flex items-center gap-1 text-xs text-muted">
                  ₹
                  <input type="number" className={`${input} num w-full`} value={toR(g.target_amount)} onChange={(e) => setGoal(g.id, { target_amount: toP(e.target.value) })} />
                </label>
                <input type="date" className={input} value={g.target_date} onChange={(e) => setGoal(g.id, { target_date: e.target.value })} />
                <div className="text-xs">
                  {r?.projected ? (
                    <span className={r.onTrack ? "text-accent" : "text-warn"}>
                      lands {monthLabelLong(r.projected)} {r.onTrack ? "✓ on time" : `· ${r.monthsLate} mo late`}
                    </span>
                  ) : (
                    <span className="text-danger">not reached at this surplus</span>
                  )}
                </div>
                <button className="text-xs text-muted hover:text-danger" onClick={() => s.setGoals(s.goals.filter((x) => x.id !== g.id))} aria-label={`Delete ${g.name}`}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        <button
          onClick={() =>
            s.setGoals([...s.goals, { id: uid("goal"), name: "New goal", target_amount: 5000000, target_date: "2027-12-31", priority: s.goals.length + 1, allocated_so_far: 0 }])
          }
          className="mt-3 rounded-md border border-dashed border-line px-3 py-1 text-xs text-muted hover:text-ink"
        >
          + Add a goal
        </button>
        <p className="mt-3 text-xs text-muted">Total of goal targets: {formatINR(goals.reduce((a, g) => a + g.target_amount, 0))}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
