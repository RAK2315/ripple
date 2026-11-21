/** Guardrails + the arithmetic the coach shows instead of a product name. Pure. */

const SECURITIES =
  /\b(mutual ?funds?|\bmf\b|sip in|which sip|which fund|index fund|elss|etf|stocks?|shares?|equity|nifty|sensex|crypto|bitcoin|bonds?|insurance (policy|plan)|term (plan|insurance)|ulip|lic policy|smallcase|portfolio|invest(ing)? in (?!my|a goal))\b/i;
const PICK = /\b(which|what|best|top|recommend|suggest|should i (buy|invest|pick|get)|good)\b/i;

/** True when the question asks us to pick or recommend a security, fund or insurance product (out of scope, spec §3.8). */
export function isSecuritiesQuestion(q: string): boolean {
  return SECURITIES.test(q) && (PICK.test(q) || /\bbuy\b|\binvest\b/i.test(q));
}

/** Monthly amount that grows from `have` to `target` in `months`, at `annualRate` (0 = plain saving). Paise. */
export function monthlyToReach(target: number, have: number, months: number, annualRate: number): number {
  const need = Math.max(0, target - have);
  if (months <= 0) return need;
  const r = annualRate / 12;
  if (r === 0) return Math.ceil(need / months);
  const g = Math.pow(1 + r, months);
  const pmt = ((target - have * g) * r) / (g - 1);
  return Math.max(0, Math.ceil(pmt));
}

export function monthsUntil(fromYm: string, toDate: string): number {
  return (+toDate.slice(0, 4) - +fromYm.slice(0, 4)) * 12 + (+toDate.slice(5, 7) - +fromYm.slice(5, 7));
}

/**
 * The model writes words with {placeholders}; our code fills them with computed figures.
 * Returns null if the model wrote any digit itself or used an unknown placeholder, so the caller falls back to a template.
 */
export function fillPlaceholders(text: string, facts: Record<string, string>): string | null {
  if (/\d/.test(text.replace(/\{[a-z0-9_]+\}/gi, ""))) return null;
  let ok = true;
  const out = text.replace(/\{([a-z0-9_]+)\}/gi, (_, k: string) => {
    if (!(k in facts)) {
      ok = false;
      return "";
    }
    return facts[k];
  });
  return ok ? out : null;
}
