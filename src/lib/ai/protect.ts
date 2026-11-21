import { mask } from "./mask";

/**
 * Privacy at the point of payload construction. Every request body bound for a model route passes through
 * protect() in callApi (src/lib/api.ts) before it leaves the browser: each person's name found in the user's own
 * data is replaced by a token, in every form our code derives from it: the name as written ("Ramesh Kulkarni"),
 * upper case ("RAMESH KULKARNI"), and slugged inside identifiers ("rec_ramesh_kulkarni" → "rec_name_1"). This
 * covers fields built from names (recurring ids, advice keys, cache keys), not just descriptions. restore() maps
 * tokens back in the response, so ids the model returns still resolve. The server's mask() stays as a second layer.
 */

const SPLIT = /\s*(?:[/|,;:*#]|\s-\s|-(?=[A-Za-z])|\b(?:to|from|by|via|for|paid|sent|received|transferred|money)\b)\s*/i;

/** Person names in the user's data: whole values, or parts of descriptions, that mask() treats as a bare name. */
export function personNames(strings: Iterable<string>): string[] {
  const out = new Set<string>();
  const consider = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (t.length >= 4 && !t.includes("[") && mask(t) === "[NAME]") out.add(t);
  };
  for (const s of strings) {
    if (!s) continue;
    consider(s);
    for (const part of s.split(SPLIT)) consider(part);
  }
  // each part of a person's name on its own too ("ask Sunita"), so free text can't leak a first name or surname
  for (const n of [...out]) for (const w of n.split(" ")) if (w.length >= 4) out.add(w);
  // longest first, so "Aarav Mehta" is replaced before a shorter overlapping name
  return [...out].sort((a, b) => b.length - a.length);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface Protection {
  /** the body with every name replaced */
  body: unknown;
  /** maps tokens in a response back to the original strings */
  restore: <T>(v: T) => T;
  /** how many distinct name forms were replaced */
  replaced: number;
}

export function protect(body: unknown, names: string[]): Protection {
  const forward = new Map<string, string>(); // exact variant -> token
  const back = new Map<string, string>(); // token -> exact variant
  let n = 0;
  const tokenFor = (variant: string, isSlug: boolean) => {
    let t = forward.get(variant);
    if (!t) {
      n++;
      t = isSlug ? `name_${n}` : `[NAME_${n}]`;
      forward.set(variant, t);
      back.set(t, variant);
    }
    return t;
  };
  const patterns = names
    .filter((x) => x.trim().length >= 4)
    .flatMap((name) => [
      { re: new RegExp(`(?<![A-Za-z])${escapeRe(name).replace(/\\? /g, "\\s+")}(?![A-Za-z])`, "gi"), isSlug: false },
      { re: new RegExp(`(?<![a-z0-9])${escapeRe(slug(name))}(?![a-z0-9])`, "g"), isSlug: true },
    ]);
  const scrub = (s: string) => patterns.reduce((acc, p) => acc.replace(p.re, (m) => tokenFor(m, p.isSlug)), s);
  const walk = (v: unknown, f: (s: string) => string): unknown => {
    if (typeof v === "string") return f(v);
    if (Array.isArray(v)) return v.map((x) => walk(x, f));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [f(k), walk(x, f)]));
    return v;
  };
  const out = patterns.length ? walk(body, scrub) : body;
  const tokenRe = /\[NAME_\d+\]|(?<![a-z0-9])name_\d+(?![0-9])/g;
  const unscrub = (s: string) => (back.size ? s.replace(tokenRe, (t) => back.get(t) ?? t) : s);
  return { body: out, restore: <T>(v: T) => walk(v, unscrub) as T, replaced: n };
}
