/**
 * Privacy pipeline: runs on every string before it is sent to a model.
 * Account numbers → XX1234, phone numbers → [PHONE], person names → [NAME].
 * Merchants (Swiggy, Netflix, Bhagwati Tiffin Service) are kept: the model needs them to categorize.
 */
const BUSINESS = /\b(LTD|LIMITED|PVT|PRIVATE|SERVICES?|STORES?|CORP|CORPORATION|RESTAURANT|CAFE|MART|INDIA|TECHNOLOGIES|TECH|HEALTHCARE|RETAIL|ENTERPRISES?|TRADERS|FOODS?|MEDICAL|PHARMACY|HOSPITAL|CLINIC|BANK|MOTORS|AGENCY|CENTRE|CENTER|SHOP|HOTEL|BAKERY|SWEETS?|TIFFIN|DAIRY|KIRANA|GENERAL|MARKETPLACE|CONCEPTS|RAIL|METRO|PETROLEUM|ELECTRICITY|JIO|INTERNET|DELIGHT|PREMIUM|HALWAI|ORDER|AUTOPAY)\b/i;

const KNOWN_NAMES = ["AARAV MEHTA", "AARAV"];

function looksLikePerson(s: string): boolean {
  const t = s.trim();
  if (BUSINESS.test(t)) return false;
  const words = t.split(/\s+/);
  return words.length >= 2 && words.length <= 3 && words.every((w) => /^[A-Za-z]{2,}$/.test(w));
}

/** Wallet/UPI P2P phrasing (Paytm, PhonePe exports). "Money sent to" is always a person; the others are when the payee reads like one. */
const P2P_ALWAYS = /\b(Money sent to|Money transferred to)\s+([A-Za-z][A-Za-z.' ]{0,60}?)(?=\s*$|\s*[|,;]|\s+(?:via|on|ref|upi|using)\b)/gi;
const P2P_MAYBE = /\b(Received from|Money received from|Sent to|Transferred to|Transfer to|Paid by)\s+([A-Za-z][A-Za-z.' ]{0,60}?)(?=\s*$|\s*[|,;]|\s+(?:via|on|ref|upi|using)\b)/gi;

function looksLikeSingleName(s: string): boolean {
  return /^[A-Za-z]{2,}$/.test(s.trim()) && !BUSINESS.test(s);
}

export function mask(text: string): string {
  let out = text;
  for (const n of KNOWN_NAMES) out = out.replace(new RegExp(`\\b${n}\\b`, "gi"), "[NAME]");
  out = out.replace(P2P_ALWAYS, (_m, lead: string) => `${lead} [NAME]`);
  out = out.replace(P2P_MAYBE, (m, lead: string, who: string) => (looksLikePerson(who) || looksLikeSingleName(who) ? `${lead} [NAME]` : m));
  // phone numbers (Indian mobiles), including as UPI VPA local part
  out = out.replace(/(\+91[\s-]?)?\b[6-9]\d{9}\b/g, "[PHONE]");
  // UPI IDs / VPAs (ananya.rao@okicici, ******3014@ptaxi): the handle identifies a person, so only the provider survives
  out = out.replace(/(?<![\w[\]])[A-Za-z0-9._*-]+@([A-Za-z][A-Za-z0-9.-]{1,30})\b/g, "[UPI-ID]@$1");
  // long digit runs: account numbers, card numbers, UPI refs → keep last 4
  out = out.replace(/\b\d{9,18}\b/g, (m) => `XX${m.slice(-4)}`);
  // card numbers with X padding: 4591XXXXXXXX7719 → XX7719
  out = out.replace(/\b\d{4}X{4,}(\d{4})\b/gi, "XX$1");
  // person names as UPI payees: UPI/RAMESH KULKARNI/...
  out = out.replace(/(UPI(?:-AUTOPAY)?\/)([^/]+)(\/)/gi, (m, a, name, b) => (looksLikePerson(name) ? `${a}[NAME]${b}` : m));
  // "To NAME" / "trf to NAME" / IMPS/P2A/ref/NAME
  out = out.replace(/(\bTo |trf to |P2A\/XX\d{4}\/)([A-Za-z]+(?: [A-Za-z]+){1,2})/g, (m, a, name) => (looksLikePerson(name) ? `${a}[NAME]` : m));
  // a bare payee name as the whole description (SMS parser output: "SUNITA MEHTA")
  if (looksLikePerson(out)) out = "[NAME]";
  out = out.replace(/\bDear ([A-Z][a-z]+)\b(?! (Customer|UPI|User|SBI))/g, "Dear [NAME]");
  return out;
}
