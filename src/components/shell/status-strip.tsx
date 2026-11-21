"use client";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useDerived } from "@/lib/derived";
import { useAiStatus } from "@/lib/ai-status";
import { useStorageHealth } from "@/lib/storage-health";

/** D5: income is never a silent ₹0. When no salary can be detected, every screen says so and points to the fix. */
export function IncomeBanner() {
  const has = useStore((s) => s.transactions.length > 0);
  const d = useDerived();
  if (!has || d.baseline.incomeSource !== "none") return null;
  const m = d.baseline.historyMonths;
  return (
    <div className="mb-6 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm" role="status" data-testid="income-missing">
      <span className="font-medium">Income not detected.</span> RIPPLE finds your salary as a regular monthly credit, which needs about three months of
      history; this import covers {m} month{m === 1 ? "" : "s"}. Until then projections, goals and surplus would be computed against ₹0.{" "}
      <Link href="/goals" className="font-medium underline underline-offset-2">
        Enter your monthly income
      </Link>
      .
    </div>
  );
}

const LABEL = {
  fallback: "Running on fallback model",
  template: "AI unavailable · running on templates",
} as const;

/** Calm, visible degradation: when the last AI-backed feature used a fallback model or a template, say so. */
export function AiStatusPill() {
  const last = useAiStatus((s) => s.last);
  if (!last || last.mode === "model") return null;
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-xs text-muted"
      title={`Last AI call (${last.route}) ${last.mode === "fallback" ? "was answered by a fallback model" : "had no model available, so a built-in template was used"}. Every figure is computed by code either way.`}
      data-testid="ai-status"
    >
      <span className={`inline-block h-2 w-2 rounded-full ${last.mode === "fallback" ? "bg-accent" : "bg-warn"}`} aria-hidden />
      <span>
        {LABEL[last.mode]}
        <br />
        <span className="text-faint">figures unaffected</span>
      </span>
    </div>
  );
}

export function ClearedNotice() {
  const problem = useStorageHealth((s) => s.problem);
  if (problem !== "cleared-old") return null;
  return (
    <div className="mb-6 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-muted" role="status">
      Saved data from an earlier version of RIPPLE was cleared so it can&apos;t break this one. Import again, or load the demo from the Import screen.
    </div>
  );
}
