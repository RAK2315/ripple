const MONTH_NAMES = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
] as const;

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

export function pad2(n: number | string): string {
  return String(n).padStart(2, "0");
}

/**
 * Returns today's date in IST formatted as YYYY-MM-DD.
 */
export function getTodayIst(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "11";
  const d = parts.find((p) => p.type === "day")?.value ?? "21";
  return `${y}-${m}-${d}`;
}

/**
 * Parses date strings commonly found in Indian bank statements & SMS.
 * Indian banks are ALWAYS day-first: 14/11/26 => 2026-11-14.
 *
 * Supported formats:
 * - YYYY-MM-DD (e.g. 2026-11-07, 2026-04-01)
 * - DD/MM/YY or DD/MM/YYYY (e.g. 14/11/26, 02/04/26)
 * - DD-MM-YYYY or DD-MM-YY (e.g. 05-11-26, 18-11-26)
 * - DD-MMM-YY or DD-MMM-YYYY (e.g. 01-NOV-26, 12-Nov-26, 21-Aug-26)
 * - DD MMM YY or DD MMM YYYY (e.g. 12 Nov 2026)
 * - DDMMMYY or DDMMMYYYY (e.g. 12Nov26, 15Nov26)
 * - DD/MM or DD-MM (resolves year using referenceDate)
 */
export function parseIndianDate(
  raw: string,
  referenceDate?: string
): string | null {
  if (!raw) return null;
  const str = raw.trim();

  const ref = referenceDate || "2026-11-21";
  const refYear = ref.slice(0, 4);

  // 1. ISO format: YYYY-MM-DD (possibly with time e.g. 2026-11-07:10:12:44)
  const isoMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  // 2. Alpha month: 01-NOV-26, 12-Nov-26, 12Nov26, 12 Nov 2026
  const alphaMatch = str.match(
    /^(\d{1,2})[-/\s]?([a-zA-Z]{3})[-/\s]?(\d{2,4})?/
  );
  if (alphaMatch) {
    const [, d, monStr, yRaw] = alphaMatch;
    const m = MONTH_MAP[monStr.toLowerCase()];
    if (m) {
      let y = refYear;
      if (yRaw) {
        y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
      }
      return `${y}-${m}-${pad2(d)}`;
    }
  }

  // 3. Day-first numeric with year: DD/MM/YYYY or DD/MM/YY or DD-MM-YYYY or DD-MM-YY
  const numMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (numMatch) {
    const [, d, m, yRaw] = numMatch;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  // 4. Year-less day/month: DD/MM or DD-MM
  const shortMatch = str.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (shortMatch) {
    const [, d, m] = shortMatch;
    return `${refYear}-${pad2(m)}-${pad2(d)}`;
  }

  return null;
}

export function formatDayMonYear(dateStr: string): string {
  // dateStr is "YYYY-MM-DD"
  const [y, m, d] = dateStr.split("-");
  const mon = MONTH_NAMES[parseInt(m, 10) - 1];
  return `${d}-${mon}-${y.slice(2, 4)}`;
}

export function formatDaySlashMonSlashYear(dateStr: string): string {
  // dateStr is "YYYY-MM-DD"
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y.slice(2, 4)}`;
}
