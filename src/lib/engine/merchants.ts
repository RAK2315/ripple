import type { Category } from "../types";

/** [token found in uppercased raw description, clean merchant name, category] */
type Entry = [string, string, Category];

const E = (cat: Category, list: [string, string][]): Entry[] => list.map(([t, n]) => [t, n, cat]);

export const STARTER_MERCHANTS: Entry[] = [
  ...E("Dining", [
    ["SWIGGY", "Swiggy"], ["ZOMATO", "Zomato"], ["DOMINOS", "Domino's"], ["PIZZA HUT", "Pizza Hut"], ["MCDONALD", "McDonald's"],
    ["KFC", "KFC"], ["BURGER KING", "Burger King"], ["STARBUCKS", "Starbucks"], ["CAFE COFFEE DAY", "Cafe Coffee Day"], ["CCD ", "Cafe Coffee Day"],
    ["CHAAYOS", "Chaayos"], ["CHAI POINT", "Chai Point"], ["BARBEQUE NATION", "Barbeque Nation"], ["HALDIRAM", "Haldiram's"], ["SUBWAY", "Subway"],
    ["BEHROUZ", "Behrouz Biryani"], ["FAASOS", "Faasos"], ["EATSURE", "EatSure"], ["BOX8", "Box8"], ["THIRD WAVE", "Third Wave Coffee"],
    ["SOCIAL ", "Social"], ["VAISHALI", "Vaishali"], ["BLUE TOKAI", "Blue Tokai"], ["WOW MOMO", "Wow! Momo"], ["BIRYANI BY KILO", "Biryani By Kilo"],
  ]),
  ...E("Groceries", [
    ["BLINKIT", "Blinkit"], ["GROFERS", "Blinkit"], ["ZEPTO", "Zepto"], ["BIGBASKET", "BigBasket"], ["INNOVATIVE RETAIL", "BigBasket"],
    ["DMART", "DMart"], ["AVENUE SUPERMARTS", "DMart"], ["RELIANCE FRESH", "Reliance Fresh"], ["RELIANCE SMART", "Reliance Smart"], ["JIOMART", "JioMart"],
    ["MORE RETAIL", "More"], ["SPENCER", "Spencer's"], ["NATURE S BASKET", "Nature's Basket"], ["NATURES BASKET", "Nature's Basket"], ["SWIGGY INSTAMART", "Instamart"],
    ["INSTAMART", "Instamart"], ["DUNZO", "Dunzo"], ["COUNTRY DELIGHT", "Country Delight"], ["MILKBASKET", "Milkbasket"], ["STAR BAZAAR", "Star Bazaar"],
  ]),
  ...E("Transport", [
    ["UBER", "Uber"], [" OLA ", "Ola"], ["/OLA/", "Ola"], ["ANI TECHNOLOGIES", "Ola"], ["RAPIDO", "Rapido"], ["NAMMA YATRI", "Namma Yatri"],
    ["METRO", "Metro"], ["IRCTC", "IRCTC"], ["REDBUS", "redBus"], ["FASTAG", "FASTag"], ["BLUSMART", "BluSmart"], ["YULU", "Yulu"], ["BEST BUS", "BEST"],
  ]),
  ...E("Travel", [
    ["MAKEMYTRIP", "MakeMyTrip"], ["GOIBIBO", "Goibibo"], ["INDIGO", "IndiGo"], ["AIR INDIA", "Air India"], ["VISTARA", "Vistara"],
    ["AKASA", "Akasa Air"], ["SPICEJET", "SpiceJet"], [" OYO ", "OYO"], ["CLEARTRIP", "Cleartrip"], ["IXIGO", "ixigo"], ["AIRBNB", "Airbnb"],
  ]),
  ...E("Fuel", [
    ["HPCL", "HP Petrol"], ["BPCL", "Bharat Petroleum"], ["INDIAN OIL", "Indian Oil"], ["IOCL", "Indian Oil"], ["SHELL", "Shell"], ["PETROL", "Petrol pump"], ["NAYARA", "Nayara"],
  ]),
  ...E("Shopping", [
    ["AMAZON PAY INDIA", "Amazon"], ["AMAZON", "Amazon"], ["FLIPKART", "Flipkart"], ["MYNTRA", "Myntra"], ["AJIO", "AJIO"], ["MEESHO", "Meesho"],
    ["NYKAA", "Nykaa"], ["TATA CLIQ", "Tata CLiQ"], ["CROMA", "Croma"], ["RELIANCE DIGITAL", "Reliance Digital"], ["DECATHLON", "Decathlon"],
    ["IKEA", "IKEA"], ["LIFESTYLE", "Lifestyle"], ["WESTSIDE", "Westside"], ["ZARA", "Zara"], ["H&M", "H&M"], ["LENSKART", "Lenskart"], ["FIRSTCRY", "FirstCry"], ["PEPPERFRY", "Pepperfry"], ["URBAN COMPANY", "Urban Company"],
  ]),
  ...E("Subscriptions", [
    ["NETFLIX", "Netflix"], ["SPOTIFY", "Spotify"], ["YOUTUBE", "YouTube Premium"], ["HOTSTAR", "Disney+ Hotstar"], ["JIOCINEMA", "JioCinema"],
    ["PRIME VIDEO", "Prime Video"], ["SONYLIV", "SonyLIV"], ["ZEE5", "ZEE5"], ["APPLE.COM", "Apple"], ["GOOGLE PLAY", "Google Play"],
    ["GOOGLE ONE", "Google One"], ["AUDIBLE", "Audible"], ["LINKEDIN", "LinkedIn Premium"], ["CHATGPT", "ChatGPT"], ["OPENAI", "OpenAI"], ["ANTHROPIC", "Claude"], ["NOTION", "Notion"], ["CANVA", "Canva"],
  ]),
  ...E("Fitness", [
    ["CUREFIT", "cult.fit"], ["CULTFIT", "cult.fit"], ["CULT.FIT", "cult.fit"], ["GOLDS GYM", "Gold's Gym"], ["ANYTIME FITNESS", "Anytime Fitness"], ["HEALTHIFYME", "HealthifyMe"],
  ]),
  ...E("Phone & Internet", [
    ["RELIANCE JIO", "Jio"], ["JIO PREPAID", "Jio"], ["AIRTEL", "Airtel"], ["VODAFONE", "Vi"], ["VI PREPAID", "Vi"], ["BSNL", "BSNL"],
    ["ACT FIBERNET", "ACT Fibernet"], ["HATHWAY", "Hathway"], ["TATA PLAY", "Tata Play"], ["EXCITEL", "Excitel"],
  ]),
  ...E("Utilities", [
    ["MSEDCL", "MSEDCL Electricity"], ["BESCOM", "BESCOM Electricity"], ["TATA POWER", "Tata Power"], ["ADANI ELECTRICITY", "Adani Electricity"], ["BSES", "BSES"],
    ["TORRENT POWER", "Torrent Power"], ["MAHANAGAR GAS", "Mahanagar Gas"], ["INDANE", "Indane Gas"], ["BHARAT GAS", "Bharat Gas"], ["ELECTRICITY", "Electricity"], ["WATER BILL", "Water"],
  ]),
  ...E("Health", [
    ["APOLLO", "Apollo Pharmacy"], ["PHARMEASY", "PharmEasy"], ["NETMEDS", "Netmeds"], ["1MG", "Tata 1mg"], ["MEDPLUS", "MedPlus"], ["PRACTO", "Practo"], ["DR LAL", "Dr Lal PathLabs"], ["THYROCARE", "Thyrocare"],
  ]),
  ...E("Entertainment", [
    ["BOOKMYSHOW", "BookMyShow"], ["PVR", "PVR"], ["INOX", "INOX"], ["DISTRICT", "District"], ["STEAM", "Steam"], ["PLAYSTATION", "PlayStation"],
  ]),
  ...E("Education", [["UDEMY", "Udemy"], ["COURSERA", "Coursera"], ["BYJU", "BYJU'S"], ["UNACADEMY", "Unacademy"], ["UPGRAD", "upGrad"]]),
  ...E("Insurance", [["LIC ", "LIC"], ["HDFC LIFE", "HDFC Life"], ["ICICI PRU", "ICICI Prudential"], ["STAR HEALTH", "Star Health"], ["ACKO", "Acko"], ["POLICYBAZAAR", "PolicyBazaar"]]),
  ...E("EMI & Loans", [[" EMI ", "Loan EMI"], ["BAJAJ FIN", "Bajaj Finance"], ["LOAN", "Loan"], ["CRED CLUB", "CRED"]]),
  ...E("Cash Withdrawal", [["ATW-", "ATM withdrawal"], ["ATM WDL", "ATM withdrawal"], ["NWD-", "ATM withdrawal"]]),
  ...E("Fees & Charges", [["SMS CHARGES", "Bank charges"], ["CHRG", "Bank charges"], ["ANNUAL FEE", "Card annual fee"], ["INCL GST", "Bank charges"]]),
  ...E("Income", [["SALARY", "Salary"], ["INT.PD", "Interest"], ["REFUND", "Refund"], ["CASHBACK", "Cashback"]]),
];

const GENERIC = new Set(["UPI", "POS", "HDFC", "ICICI", "SBI", "AXIS", "PAYMENT", "NEFT", "IMPS", "AUTOPAY", "BANK"]);

export function starterMatch(raw: string): { name: string; category: Category } | null {
  const u = ` ${raw.toUpperCase()} `;
  for (const [token, name, category] of STARTER_MERCHANTS) {
    if (u.includes(token)) return { name, category };
  }
  return null;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).trim();
}

/** Deterministic merchant normalizer. The LLM may improve names later; this never fails. */
export function normalizeMerchant(raw: string): string {
  const starter = starterMatch(raw);
  if (starter) return starter.name;
  const u = raw.toUpperCase().trim();
  let m: RegExpMatchArray | null;
  if ((m = u.match(/^UPI(?:-AUTOPAY)?\/([^/]+)\//))) return cleanPayee(m[1]);
  if ((m = u.match(/^UPI-([^-]+)-/))) return cleanPayee(m[1]);
  if ((m = u.match(/^POS \S+ (.+)$/))) return titleCase(m[1].replace(/\b(PUNE|MUMBAI|BANGALORE|BENGALURU|DELHI|IN)\b/g, ""));
  if (/@[A-Z]+$/.test(u) && !u.includes(" ")) return cleanPayee(u);
  if ((m = u.match(/^NEFT CR-[A-Z0-9]+-([^-]+)/))) return titleCase(m[1]);
  if ((m = u.match(/^BIL\/BPAY\/\d+\/(.+)$/))) return titleCase(m[1]);
  if (u.includes("/")) return titleCase(u.split("/")[0]);
  return titleCase(u.slice(0, 40));
}

function cleanPayee(p: string): string {
  if (/^Q\d+@/.test(p)) return "PhonePe QR merchant";
  if (/^\d{10}@|^\d{8,}@/.test(p)) return "UPI transfer";
  return titleCase(p.replace(/@.*/, ""));
}

/** Tokens a learned rule may use: drop generic and short tokens. */
export function meaningfulTokens(raw: string): string[] {
  return raw
    .toUpperCase()
    .split(/[^A-Z0-9.&]+/)
    .filter((t) => t.length >= 4 && !GENERIC.has(t) && !/^\d+$/.test(t));
}

export function isGenericToken(t: string): boolean {
  return t.trim().length < 4 || GENERIC.has(t.trim().toUpperCase());
}
