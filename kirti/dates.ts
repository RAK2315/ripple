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
 * Validates whether year, month, day form a real calendar date.
 * Rejects impossible dates like 2026-13-45 or 2026-02-31.
 */
export function isValidCalendarDate(
  year: number,
  month: number,
  day: number
): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
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
 * - Year-less: DD MMM, DD-MMM, DD/MM, DD-MM
 *
 * For year-less dates:
 * Resolves year using referenceDate. If the resulting date is after
 * referenceDate, it rolls back by 1 year.
 *
 * Returns null if the date is invalid or impossible (e.g. 2026-02-31).
 */
export function parseIndianDate(
  raw: string,
  referenceDate?: string
): string | null {
  if (!raw) return null;
  const str = raw.trim();

  const ref = referenceDate || "2026-11-21";
  const refYear = parseInt(ref.slice(0, 4), 10);

  // 1. ISO format: YYYY-MM-DD (possibly with time e.g. 2026-11-07:10:12:44)
  const isoMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (!isValidCalendarDate(y, m, d)) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  // 2. Alpha month: 01-NOV-26, 12-Nov-26, 12Nov26, 12 Nov 2026, or year-less 12 Nov, 12-Nov
  const alphaMatch = str.match(
    /^(\d{1,2})[-/\s]?([a-zA-Z]{3})(?:[-/\s]?(\d{2,4}))?/
  );
  if (alphaMatch) {
    const dNum = parseInt(alphaMatch[1], 10);
    const monStr = alphaMatch[2];
    const yRaw = alphaMatch[3];
    const mStr = MONTH_MAP[monStr.toLowerCase()];
    if (mStr) {
      const mNum = parseInt(mStr, 10);
      let y = refYear;
      if (yRaw) {
        y = yRaw.length === 2 ? 2000 + parseInt(yRaw, 10) : parseInt(yRaw, 10);
      } else {
        // Year-less: check roll-back if after referenceDate
        let candidate = `${y}-${mStr}-${pad2(dNum)}`;
        if (candidate > ref) {
          y = refYear - 1;
        }
      }
      if (!isValidCalendarDate(y, mNum, dNum)) return null;
      return `${y}-${mStr}-${pad2(dNum)}`;
    }
  }

  // 3. Day-first numeric with year: DD/MM/YYYY or DD/MM/YY or DD-MM-YYYY or DD-MM-YY
  const numMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (numMatch) {
    const dNum = parseInt(numMatch[1], 10);
    const mNum = parseInt(numMatch[2], 10);
    const yRaw = numMatch[3];
    const y = yRaw.length === 2 ? 2000 + parseInt(yRaw, 10) : parseInt(yRaw, 10);
    if (!isValidCalendarDate(y, mNum, dNum)) return null;
    return `${y}-${pad2(mNum)}-${pad2(dNum)}`;
  }

  // 4. Year-less day/month: DD/MM or DD-MM
  const shortMatch = str.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (shortMatch) {
    const dNum = parseInt(shortMatch[1], 10);
    const mNum = parseInt(shortMatch[2], 10);
    let y = refYear;
    let candidate = `${y}-${pad2(mNum)}-${pad2(dNum)}`;
    if (candidate > ref) {
      y = refYear - 1;
    }
    if (!isValidCalendarDate(y, mNum, dNum)) return null;
    return `${y}-${pad2(mNum)}-${pad2(dNum)}`;
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
