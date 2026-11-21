"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useDerived } from "@/lib/derived";
import { callApi } from "@/lib/api";
import { APP_TODAY } from "@/lib/config";
import { detectShifts, replan, type Shift } from "@/lib/engine/shifts";
import { goalImpactDays } from "@/lib/engine/projection";
import { dateLabel, formatINR, monthLabelLong } from "@/lib/format";
import { Money } from "@/components/money";
import { NudgeList } from "@/components/nudges/nudge-list";
import type { Recurring } from "@/lib/types";

const STATUS_STYLE: Record<Recurring["status"], string> = {
  active: "bg-paper text-muted",
  changed: "bg-warn-soft text-warn",
  new: "bg-accent-soft text-accent",
  unused: "bg-danger-soft text-danger",
};

export function SubscriptionsScreen() {
  const s = useStore();
  const d = useDerived();
  const debits = d.recurring.filter((r) => r.direction === "debit");
  const unused = debits.filter((r) => r.status === "unused");
  const changed = debits.filter((r) => r.status === "changed");
  const fresh = debits.filter((r) => r.status === "new");
  const yearly = unused.reduce((a, r) => a + r.monthly_amount * 12, 0);
  const shifts = useMemo(() => detectShifts(d.recurring, APP_TODAY).filter((x) => !s.nudgeAcks[x.id]), [d.recurring, s.nudgeAcks]);
  const asked = useRef(false);

  // one model call for the "why it changed" lines; cached in the store, template fallback inside the route
  useEffect(() => {
    if (asked.current) return;
    const missing = changed.filter((r) => !s.recurringNotes[r.id] && r.previous_amount != null);
    if (!missing.length) return;
    asked.current = true;
    callApi<Record<string, { why: string; source: string }>>("explain", {
      items: missing.map((r) => ({
        id: r.id,
        merchant: r.merchant_normalized,
        category: r.category,
        before_rupees: Math.round(r.previous_amount! / 100),
        after_rupees: Math.round(r.amount / 100),
        changed_on: r.changed_on,
      })),
    }).then((res) => {
      if (res.ok && res.data) for (const [id, v] of Object.entries(res.data)) s.setRecurringNote(id, v.why);
    });
  }, [changed, s]);

  if (s.transactions.length === 0) {
    return (
      <div className="card mx-auto mt-16 max-w-xl p-10 text-center">
        <h1 className="text-xl font-semibold">Recurring payments are detected from your history.</h1>
        <Link href="/import" className="mt-5 inline-block rounded-lg bg-ink px-5 py-3 text-sm text-paper">
          Import transactions
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Subscriptions & alerts</h1>
        <p className="text-sm text-muted">
          Detected from your history: 3+ charges at a steady interval and amount. A bank statement cannot show whether you use something, so RIPPLE infers it and asks you.
        </p>
      </div>

      {shifts.map((sh) => (
        <ShiftCard key={sh.id} shift={sh} />
      ))}

      <NudgeList />

      <div className="grid grid-cols-[1fr_1.4fr] gap-6">
        <div className="card overflow-hidden" data-testid="graveyard">
          <div className="bg-danger-soft/60 p-6">
            <div className="text-xs uppercase tracking-wide text-danger">Subscription graveyard</div>
            <Money
              paise={yearly}
              ids={unused.flatMap((r) => r.transaction_ids)}
              title="Unused subscriptions, all charges"
              note="Yearly total = monthly amount × 12 for each subscription marked or inferred unused."
              className="figure-hero mt-2 block text-danger"
            />
            <div className="mt-1 text-sm text-muted">a year on things you don&apos;t use</div>
          </div>
          <div className="divide-y divide-line">
            {unused.length === 0 && <div className="p-6 text-sm text-muted">Nothing here. Mark a subscription unused from the list.</div>}
            {unused.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-6 py-3">
                <div className="flex-1">
                  <div className="text-sm font-medium">{r.merchant_normalized}</div>
                  <div className="text-xs text-muted">
                    {r.inferred_unused ? `Inferred: no other ${r.category} spending alongside it` : "You marked this unused"} · since {dateLabel(r.first_seen)}
                  </div>
                </div>
                <div className="num text-right text-sm">
                  {formatINR(r.monthly_amount)}/mo
                  <div className="text-[11px] text-danger">{formatINR(r.monthly_amount * 12)}/yr</div>
                </div>
                <button onClick={() => s.setUnused(r.id, false)} className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-ink">
                  I use it
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {changed.map((r) => (
            <div key={r.id} className="card border-l-4 border-l-warn p-5" data-testid="changed-alert">
              <div className="text-xs uppercase tracking-wide text-warn">Price changed</div>
              <div className="mt-1 text-sm">
                <b>{r.merchant_normalized}</b> went from <span className="num">{formatINR(r.previous_amount ?? 0)}</span> to{" "}
                <Money paise={r.amount} ids={r.transaction_ids} title={`${r.merchant_normalized} charges`} className="font-semibold" /> on {dateLabel(r.changed_on ?? "")}.{" "}
                <span className="text-muted">That is {formatINR((r.amount - (r.previous_amount ?? 0)) * 12)} more a year.</span>
              </div>
              {s.recurringNotes[r.id] ? <div className="mt-1 text-sm text-muted">{s.recurringNotes[r.id]}</div> : <div className="skeleton mt-2 h-4 w-3/4" aria-busy="true" />}
            </div>
          ))}
          {fresh.map((r) => (
            <div key={r.id} className="card border-l-4 border-l-accent p-5">
              <div className="text-xs uppercase tracking-wide text-accent">New recurring payment</div>
              <div className="mt-1 text-sm">
                <b>{r.merchant_normalized}</b> started on {dateLabel(r.first_seen)}: <Money paise={r.monthly_amount} ids={r.transaction_ids} title={r.merchant_normalized} />
                /month. Is this one you meant to sign up for?
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="px-6 py-4">
          <h2 className="text-lg font-semibold">Everything you pay for regularly</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-line text-left text-xs text-muted">
              <th className="px-6 py-2 font-normal">Merchant</th>
              <th className="py-2 font-normal">Category</th>
              <th className="py-2 font-normal">Every</th>
              <th className="py-2 text-right font-normal">Per month</th>
              <th className="py-2 text-right font-normal">Goal impact</th>
              <th className="py-2 pl-6 font-normal">Status</th>
              <th className="px-6 py-2 text-right font-normal">Use it?</th>
            </tr>
          </thead>
          <tbody>
            {debits.map((r) => {
              const days = goalImpactDays(r.monthly_amount, d.main.plan.surplus);
              return (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-6 py-2 font-medium">{r.merchant_normalized}</td>
                  <td className="py-2 text-muted">{r.category}</td>
                  <td className="py-2 text-muted">{r.cadence.replace("ly", "")}</td>
                  <td className="py-2 text-right">
                    <Money paise={r.monthly_amount} ids={r.transaction_ids} title={r.merchant_normalized} />
                  </td>
                  <td className="py-2 text-right text-xs text-muted" title="amount ÷ monthly surplus × 30">
                    {days != null && d.main.nearestGoal ? `${d.main.nearestGoal.goal.name} +${days < 10 ? days.toFixed(1) : Math.round(days)}d/mo` : "—"}
                  </td>
                  <td className="py-2 pl-6">
                    <span className={`rounded-full px-2 py-1 text-xs ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="px-6 py-2 text-right">
                    <button
                      onClick={() => s.setUnused(r.id, r.status !== "unused")}
                      className={`rounded-md border px-2 py-1 text-xs ${r.status === "unused" ? "border-danger text-danger" : "border-line text-muted hover:text-ink"}`}
                    >
                      {r.status === "unused" ? "Unused" : "Mark unused"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShiftCard({ shift }: { shift: Shift }) {
  const s = useStore();
  const d = useDerived();
  const [open, setOpen] = useState(false);
  const moves = useMemo(() => replan(shift, d.baseline, s.goals, s.profile.current_balance, APP_TODAY), [shift, d.baseline, s.goals, s.profile.current_balance]);
  const up = shift.after > shift.before;
  return (
    <div className="card border-l-4 border-l-ink p-5" data-testid="shift">
      <div className="flex items-start gap-4">
        <div className="flex-1 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted">{shift.kind === "income" ? "Income shift" : "Fixed cost shift"}</div>
          <p className="mt-1">
            <b>{shift.label}</b> moved from <span className="num">{formatINR(shift.before)}</span> to{" "}
            <Money paise={shift.after} ids={shift.ids} title={shift.label} className="font-semibold" />
            /month on {dateLabel(shift.changedOn)} ({up ? "+" : ""}
            {Math.round(shift.pct * 100)}%). Your plan should run on the new number.
          </p>
          {open && (
            <div className="mt-3 rounded-lg bg-paper p-3">
              <div className="mb-1 text-xs text-muted">Re-planned on the new amount. Goal dates before → after:</div>
              {moves.map((m) => (
                <div key={m.goal} className="text-sm">
                  {m.goal}: {m.before ? monthLabelLong(m.before) : "not reached"} →{" "}
                  <b className={m.before !== m.after ? "text-warn" : ""}>{m.after ? monthLabelLong(m.after) : "not reached"}</b>
                  {m.before === m.after && <span className="text-muted"> (no change)</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {!open ? (
            <button onClick={() => setOpen(true)} className="rounded-lg bg-ink px-3 py-2 text-xs text-paper">
              Re-plan
            </button>
          ) : (
            <button onClick={() => s.ackNudge(shift.id)} className="rounded-lg border border-line px-3 py-2 text-xs">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
