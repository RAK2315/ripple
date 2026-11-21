"use client";
import { useDerived } from "@/lib/derived";
import { useUi } from "@/lib/ui";
import { dateLabel, formatINR } from "@/lib/format";

export function ProvenanceDrawer() {
  const p = useUi((s) => s.provenance);
  const close = useUi((s) => s.closeProvenance);
  const { byId } = useDerived();
  if (!p) return null;
  const rows = p.ids.map((id) => byId.get(id)).filter((t) => !!t);
  const total = rows.reduce((a, t) => a + (t.direction === "debit" ? t.amount : -t.amount), 0);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/20" onClick={close}>
      <div className="h-full w-[460px] overflow-y-auto bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Provenance</div>
            <h3 className="mt-1 text-lg font-semibold">{p.title}</h3>
          </div>
          <button onClick={close} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>
        {p.note && <p className="mt-2 text-sm text-muted">{p.note}</p>}
        <div className="mt-4 text-sm text-muted">
          {rows.length} transaction{rows.length === 1 ? "" : "s"} · net out <span className="num font-medium text-ink">{formatINR(total)}</span>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {rows.map((t) => (
            <li key={t.id} className="py-2.5">
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-medium">{t.merchant_normalized}</span>
                <span className={`num ${t.direction === "credit" ? "text-accent" : ""}`}>
                  {t.direction === "credit" ? "+" : ""}
                  {formatINR(t.amount)}
                </span>
              </div>
              <div className="mt-0.5 flex justify-between gap-3 text-xs text-muted">
                <span className="truncate font-mono">{t.raw_description}</span>
                <span className="shrink-0">
                  {dateLabel(t.date)} · {t.category}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {rows.length === 0 && <p className="mt-4 text-sm text-muted">This figure is a plan input, not derived from transactions.</p>}
      </div>
    </div>
  );
}
