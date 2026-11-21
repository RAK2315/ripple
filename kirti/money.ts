import type { Direction } from "../contract/types";

/**
 * Formats paise as decimal string with 2 decimal places.
 * e.g. 123450 => "1234.50"
 */
export function formatRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/**
 * Formats paise using Indian number grouping (e.g. 85,000.00 or 1,12,430.55).
 */
export function formatInr(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export interface ParsedMoney {
  amount: number; // positive integer paise
  direction?: Direction;
}

/**
 * Parses monetary strings from CSVs or SMS.
 * Handles Indian grouping (1,12,430.55), currency prefixes (₹, Rs., INR),
 * and suffixes (Dr, Cr).
 *
 * Strictly rejects non-numeric amounts like "12abc" returning null.
 */
export function parseMoneyString(raw: string): ParsedMoney | null {
  if (!raw) return null;
  let str = raw.trim();

  let direction: Direction | undefined;

  // Check for Dr / Cr suffix or prefix
  if (/\b(?:Dr|dr|DR)\b/.test(str)) {
    direction = "debit";
    str = str.replace(/\b(?:Dr|dr|DR)\b/g, "");
  } else if (/\b(?:Cr|cr|CR)\b/.test(str)) {
    direction = "credit";
    str = str.replace(/\b(?:Cr|cr|CR)\b/g, "");
  }

  // Remove currency symbols & labels
  str = str.replace(/₹|Rs\.?|INR/gi, "").trim();

  // Check leading negative sign
  if (str.startsWith("-") || str.startsWith("–") || str.startsWith("—")) {
    direction = "debit";
    str = str.replace(/^[-–—]\s*/, "");
  } else if (str.startsWith("+")) {
    direction = "credit";
    str = str.replace(/^\+\s*/, "");
  }

  // Remove commas and spaces
  const clean = str.replace(/,/g, "").trim();
  if (!clean) return null;

  // Strict numeric validation: only digits with optional single decimal point
  // Rejects strings like "12abc" or "12.34.56"
  if (!/^(?:\d+|\d+\.\d+|\.\d+)$/.test(clean)) {
    return null;
  }

  const num = parseFloat(clean);
  if (isNaN(num)) return null;

  // Amount in integer paise, always positive
  const amount = Math.round(Math.abs(num) * 100);
  if (amount <= 0) return null;

  return {
    amount,
    direction,
  };
}
