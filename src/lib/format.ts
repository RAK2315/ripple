const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** paise -> "₹1,23,456" */
export function formatINR(paise: number, opts: { sign?: boolean } = {}): string {
  const r = Math.round(paise / 100);
  const s = `₹${inr.format(Math.abs(r))}`;
  if (r < 0) return `−${s}`;
  return opts.sign && r > 0 ? `+${s}` : s;
}

/** paise -> "₹1.2L" / "₹45k" for axes */
export function formatINRShort(paise: number): string {
  const r = paise / 100;
  const a = Math.abs(r);
  const sign = r < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sign}₹${Math.round(a / 1e3)}k`;
  return `${sign}₹${Math.round(a)}`;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(ym: string): string {
  return `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(2, 4)}`;
}

export function monthLabelLong(ym: string): string {
  return `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
}

export function dateLabel(d: string): string {
  return `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}`;
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
