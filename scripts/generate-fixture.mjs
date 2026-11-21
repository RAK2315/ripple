// Rehaan's fallback fixture generator. Writes contract/fixture.json plus demo inputs
// (public/demo/statement.csv, public/demo/sms-dump.txt) from ONE dataset.
// Deterministic: same seed => same output. Run: node scripts/generate-fixture.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const SEED = 42;
const END = "2026-11-20";
const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];

let s = SEED;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const ri = (a, b) => Math.floor(a + rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const ref = () => String(ri(400000000000, 439999999999));
const pad = (n) => String(n).padStart(2, "0");
const daysIn = (ym) => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const SAV = "4821"; // HDFC savings
const CARD = "7719"; // HDFC debit card
const ICICI = "903"; // ICICI savings (ICICI shows 3 digits)

const rows = [];
function add(date, rupees, direction, desc, tail = SAV) {
  if (date > END) return;
  rows.push({ date, amount: Math.round(rupees * 100), direction, raw_description: desc, account_tail: tail });
}

MONTHS.forEach((ym, i) => {
  const [y, m] = [ym.slice(0, 4), +ym.slice(5, 7)];
  const mon = MON[m - 1];
  const last = ym === "2026-11" ? 20 : daysIn(ym);
  const d = (day) => `${ym}-${pad(Math.min(day, last))}`;

  // Salary, same date each month
  add(d(1), 85000, "credit", `NEFT CR-CITI0000002-ACME TECHNOLOGIES PVT LTD-SALARY ${mon} ${y}`);
  // Clean recurring
  add(d(2), 10000, "debit", `UPI/SUNITA MEHTA/${ref()}/Maa monthly/HDFC`);
  add(d(2), 1299, "debit", `UPI/CUREFIT HEALTHCARE/${ref()}/cult pass elite/HDFC`); // graveyard: never used
  add(d(3), 22000, "debit", `UPI/RAMESH KULKARNI/${ref()}/RENT ${mon}/HDFC`);
  add(d(5), 1200, "debit", `UPI/PUNE METRO RAIL CORP/${ref()}/pass recharge/HDFC`);
  add(d(7), i < 4 ? 199 : 499, "debit", `POS 4591XXXXXXXX${CARD} NETFLIX.COM MUMBAI IN`, CARD); // 199 -> 499 in month 5 (Aug)
  add(d(9), [1452, 1478, 1491, 1466, 1484, 1459, 1470, 1488][i], "debit", `BIL/BPAY/000${ri(100000000, 999999999)}/MSEDCL PUNE ELECTRICITY`);
  add(d(12), 119, "debit", `UPI-AUTOPAY/SPOTIFY INDIA/${ref()}/mandate/HDFC`);
  add(d(14), 349, "debit", `UPI/RELIANCE JIO/${ref()}/Recharge/HDFC`);
  add(d(18), 129, "debit", `GOOGLE*YOUTUBE PREMIUM G.CO/HELPPAY# ${CARD}`, CARD);

  // Dining + delivery, clearly rising month over month (drift nudge)
  const orders = ym === "2026-11" ? 19 : 5 + 2 * i;
  for (let k = 0; k < orders; k++) {
    const day = ri(1, last);
    const r = rnd();
    if (r < 0.45) add(d(day), ri(220, 640), "debit", `UPI/SWIGGY*ORDER/${ri(100, 999)}//HDFC`);
    else if (r < 0.8 || i < 3) add(d(day), ri(240, 690), "debit", `UPI-ZOMATO LTD-ZOMATO.PAYU@HDFCBANK-HDFC0000001-${ref()}-PAYMENT`);
    else add(d(day), ri(600, 2400), "debit", `POS 4591XXXXXXXX${CARD} ${pick(["BARBEQUE NATION PUNE", "STARBUCKS KOREGAON PK", "VAISHALI RESTAURANT", "SOCIAL BANER"])}`, CARD);
  }

  // Groceries
  for (let k = 0; k < ri(4, 6); k++) {
    const day = ri(1, last);
    add(d(day), ri(380, 1900), "debit", pick([
      `UPI/BLINKIT/${ref()}/Order/ICICI`,
      `UPI/ZEPTO MARKETPLACE/${ref()}//ICICI`,
      `UPI/INNOVATIVE RETAIL CONCEPTS/${ref()}/bigbasket/ICICI`,
      `POS 4591XXXXXXXX${CARD} DMART AUNDH PUNE`,
    ]), ICICI);
  }
  // Transport
  for (let k = 0; k < ri(6, 10); k++) {
    add(d(ri(1, last)), ri(90, 420), "debit", pick([`UPI/UBER INDIA/${ref()}/trip/ICICI`, `UPI/ANI TECHNOLOGIES OLA/${ref()}//ICICI`, `UPI/RAPIDO/${ref()}/bike taxi/ICICI`]), ICICI);
  }
  // Fuel, shopping, health, entertainment, cash
  add(d(ri(4, 26)), ri(400, 700), "debit", `POS 4591XXXXXXXX${CARD} HPCL SAI PETROLEUM PUNE`, CARD);
  for (let k = 0; k < ri(1, 3); k++) add(d(ri(1, last)), ri(450, 3200), "debit", pick([`AMAZON PAY INDIA PVT LTD/${ref()}`, `UPI/MYNTRA DESIGNS/${ref()}//HDFC`, `UPI/FLIPKART INTERNET/${ref()}//HDFC`]));
  if (rnd() < 0.8) add(d(ri(1, last)), ri(180, 900), "debit", `UPI/APOLLO PHARMACY/${ref()}//ICICI`, ICICI);
  if (rnd() < 0.7) add(d(ri(1, last)), ri(300, 900), "debit", `UPI/BOOKMYSHOW/${ref()}/tickets/HDFC`);
  add(d(ri(10, 25)), 3000, "debit", `ATW-4591XXXXXXXX${CARD}-S1ANPN04-PUNE`, CARD);

  // Local merchants no rule or starter list will match (correction-loop material)
  if (i < 7) {
    for (let k = 0; k < 2; k++) add(d(ri(3, 26)), ri(110, 180), "debit", `UPI/BHAGWATI TIFFIN SERVICE/${ref()}/lunch/HDFC`); // exactly 14 rows
  }
  if (rnd() < 0.6) add(d(ri(1, last)), ri(150, 600), "debit", `POS 4591XXXXXXXX${CARD} SHREE SAI GENERAL STORES`, CARD);
  if (rnd() < 0.5) add(d(ri(1, last)), ri(80, 450), "debit", `UPI/Q${ri(100000000, 999999999)}@YBL/payment/ICICI`, ICICI);
  if (rnd() < 0.4) add(d(ri(1, last)), ri(200, 800), "debit", `UPI/KAKA HALWAI SWEET MART/${ref()}//HDFC`);
  if (rnd() < 0.5) add(d(ri(1, last)), ri(500, 2500), "debit", `UPI/98${ri(10000000, 99999999)}@YBL/sent via phonepe/HDFC`);
});

// New weekly subscription started in the last 60 days (Country Delight milk, Saturdays from 3 Oct)
for (let t = Date.UTC(2026, 9, 3); ; t += 7 * 86400000) {
  const ds = new Date(t).toISOString().slice(0, 10);
  if (ds > END) break;
  add(ds, 420, "debit", `UPI/COUNTRY DELIGHT/${ref()}/weekly milk/ICICI`, ICICI);
}
// Quarterly interest, a refund, bank charges
add("2026-06-30", 412.55, "credit", "INT.PD:50100234594821:01-04-2026 TO 30-06-2026");
add("2026-09-30", 389.1, "credit", "INT.PD:50100234594821:01-07-2026 TO 30-09-2026");
add("2026-08-21", 1299, "credit", `UPI/AMAZON PAY REFUND/${ref()}/refund/HDFC`);
add("2026-07-01", 17.7, "debit", "SMS CHARGES FOR QTR ENDED JUN26 INCL GST");
add("2026-10-01", 17.7, "debit", "SMS CHARGES FOR QTR ENDED SEP26 INCL GST");

rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

const fmtR = (p) => (p / 100).toFixed(2);
const csvLine = (r) => `${r.date},"${r.raw_description}",${r.direction === "debit" ? "-" : ""}${fmtR(r.amount)}`;

const transactions = rows.map((r, idx) => ({
  id: `syn_${String(idx + 1).padStart(4, "0")}`,
  date: r.date,
  amount: r.amount,
  direction: r.direction,
  raw_description: r.raw_description.replace(/\s+/g, " ").trim(),
  account_tail: r.account_tail,
  source_kind: "synthetic",
  source_file: "synthetic",
  source_line: csvLine(r),
  merchant_normalized: null,
  category: null,
  category_source: null,
  confidence: null,
}));

const advice = [
  { id: "adv_001", date_given: "2026-05-18", text: "Food delivery is at ₹4,900 this month and climbing. Cap it at ₹3,400 a month.", projected_monthly_saving: 150000 },
  { id: "adv_002", date_given: "2026-07-04", text: "Cancel cult.fit Elite. ₹1,299 a month and no fitness-related spending in three months.", projected_monthly_saving: 129900 },
  { id: "adv_003", date_given: "2026-07-04", text: "Cancel YouTube Premium. You already pay for Spotify for music.", projected_monthly_saving: 12900 },
  { id: "adv_004", date_given: "2026-08-22", text: "Netflix went from ₹199 to ₹499 in August. Drop back to the Mobile plan.", projected_monthly_saving: 30000 },
  { id: "adv_005", date_given: "2026-09-15", text: "Dining is up sharply since April. Cooking two more nights a week saves about ₹2,800.", projected_monthly_saving: 280000 },
].map((a) => ({ ...a, accepted: false, acted_on_date: null }));

const fixture = {
  contract_version: "1.0.0",
  generated_at: new Date().toISOString(),
  user: { name: "Aarav Mehta", city: "Pune" },
  transactions,
  advice,
};

// ---- demo inputs from the same dataset ----
const ddmmyy = (ds) => `${ds.slice(8, 10)}/${ds.slice(5, 7)}/${ds.slice(2, 4)}`;
const ddMONyy = (ds) => `${ds.slice(8, 10)}-${MON[+ds.slice(5, 7) - 1]}-${ds.slice(2, 4)}`;
const inr = (p) => (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const payee = (desc) => {
  const m = desc.match(/^UPI(?:-AUTOPAY)?\/([^/]+)\//);
  if (m) return m[1];
  const z = desc.match(/^UPI-([^-]+)-/);
  if (z) return z[1];
  return desc.replace(/^POS \S+ /, "");
};
function sms(t) {
  if (t.direction === "credit") {
    return `Update! INR ${inr(t.amount)} deposited in HDFC Bank A/c XX${SAV} on ${ddMONyy(t.date)} for ${t.raw_description}. Avl bal INR ${inr(ri(4000000, 15000000))}.`;
  }
  if (t.account_tail === ICICI) {
    return `ICICI Bank Acct XX${ICICI} debited for Rs ${fmtR(t.amount)} on ${ddMONyy(t.date)}; ${payee(t.raw_description)} credited. UPI:${ref()}. Call 18002662 for dispute. SMS BLOCK ${ICICI} to 9215676766.`;
  }
  if (t.account_tail === CARD) {
    return `Spent Rs.${fmtR(t.amount)} On HDFC Bank Card ${CARD} At ${payee(t.raw_description)} On ${t.date}:${pad(ri(8, 22))}:${pad(ri(0, 59))}:${pad(ri(0, 59))} Not You? Call 18002586161`;
  }
  return `Sent Rs.${fmtR(t.amount)}\nFrom HDFC Bank A/C *${SAV}\nTo ${payee(t.raw_description)}\nOn ${ddmmyy(t.date)}\nRef ${ref()}\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808`;
}

mkdirSync("public/demo", { recursive: true });
writeFileSync("contract/fixture.json", JSON.stringify(fixture, null, 2) + "\n");
writeFileSync("public/demo/statement.csv", "Date,Narration,Amount\n" + transactions.map((t) => t.source_line).join("\n") + "\n");
// SMS demo dump: the full history, so one paste brings in everything
const recent = transactions;
writeFileSync("public/demo/sms-dump.txt", recent.map(sms).join("\n\n") + "\n");

const by = (pred) => transactions.filter(pred).length;
console.log(`transactions: ${transactions.length}, sms demo msgs: ${recent.length}`);
console.log(`bhagwati: ${by((t) => t.raw_description.includes("BHAGWATI"))}, netflix: ${by((t) => t.raw_description.includes("NETFLIX"))}, country delight: ${by((t) => t.raw_description.includes("COUNTRY DELIGHT"))}`);
for (const ym of MONTHS) {
  const dining = transactions.filter((t) => t.date.startsWith(ym) && /SWIGGY|ZOMATO|BARBEQUE|STARBUCKS|VAISHALI|SOCIAL/.test(t.raw_description)).reduce((a, t) => a + t.amount, 0);
  const out = transactions.filter((t) => t.date.startsWith(ym) && t.direction === "debit").reduce((a, t) => a + t.amount, 0);
  console.log(`${ym} dining ₹${Math.round(dining / 100)} total out ₹${Math.round(out / 100)}`);
}
