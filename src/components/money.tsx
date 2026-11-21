"use client";
import { formatINR } from "@/lib/format";
import { useUi } from "@/lib/ui";

/** Every computed rupee figure renders through this. Click → the rows that produced it (provenance). */
export function Money({
  paise,
  ids,
  title,
  note,
  className = "",
  sign,
}: {
  paise: number;
  ids?: string[];
  title?: string;
  note?: string;
  className?: string;
  sign?: boolean;
}) {
  const show = useUi((s) => s.showProvenance);
  const text = formatINR(paise, { sign });
  if (!ids) return <span className={`num ${className}`}>{text}</span>;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        show(title ?? text, ids, note);
      }}
      className={`num underline decoration-dotted decoration-1 underline-offset-4 hover:decoration-solid ${className}`}
      title="Show the transactions behind this number"
    >
      {text}
    </button>
  );
}
