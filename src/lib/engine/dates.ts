export const ym = (d: string) => d.slice(0, 7);

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function addDays(d: string, n: number): string {
  return new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
}

export function addMonths(ymKey: string, n: number): string {
  const y = +ymKey.slice(0, 4);
  const m = +ymKey.slice(5, 7) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}

export function daysInMonth(ymKey: string): number {
  return new Date(+ymKey.slice(0, 4), +ymKey.slice(5, 7), 0).getDate();
}

export function monthsBetween(a: string, b: string): number {
  return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
}
