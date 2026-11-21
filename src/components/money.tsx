"use client";
import { formatINR } from "@/lib/format";
import { useUi } from "@/lib/ui";
import { useCountUp } from "@/lib/use-count-up";

/** Every computed rupee figure renders through this. Click → the rows that produced it (provenance). Counts up on mount and change. */
export function Money({
  paise,
  ids,
  title,
  note,
  className = "",
  sign,
  animate = true,
}: {
  paise: number;
  ids?: string[];
  title?: string;
  note?: string;
  className?: string;
  sign?: boolean;
  animate?: boolean;
}) {
  const show = useUi((s) => s.showProvenance);
  const shown = useCountUp(paise);
  const text = formatINR(animate ? shown : paise, { sign });
  // figures set in the serif voice (hero/stat) keep their own font; everything else is mono
  const cls = /figure/.test(className) ? className : `num ${className}`;
  if (!ids) return <span className={cls}>{text}</span>;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        show(title ?? formatINR(paise, { sign }), ids, note);
      }}
      className={`${cls} underline decoration-line-strong decoration-dotted decoration-1 underline-offset-4 transition-colors hover:decoration-ink`}
      title="Show the transactions behind this number"
    >
      {text}
    </button>
  );
}

/** Animated plain number (percentages, counts) for hero figures. */
export function CountUp({ value, format = (v) => String(Math.round(v)), className = "" }: { value: number; format?: (v: number) => string; className?: string }) {
  const shown = useCountUp(value);
  return <span className={className}>{format(shown)}</span>;
}
