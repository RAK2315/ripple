import type {
  Fixture,
  GenerateOptions,
  Transaction,
  Advice,
} from "../contract/types";
import {
  formatRupees,
  formatInr,
} from "./money";
import {
  formatDayMonYear,
  formatDaySlashMonSlashYear,
  pad2,
} from "./dates";

const SAV = "4821"; // HDFC savings
const CARD = "7719"; // HDFC debit card
const ICICI = "903"; // ICICI savings (ICICI shows 3 digits)

const MON = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function daysIn(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function computeMonths(endDate: string, count: number): string[] {
  const [endY, endM] = endDate.split("-").map(Number);
  const result: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    let m = endM - i;
    let y = endY;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    result.push(`${y}-${pad2(m)}`);
  }
  return result;
}

export function generateSyntheticData(opts?: GenerateOptions): Fixture {
  const seed = opts?.seed ?? 42;
  const monthsCount = opts?.months ?? 8;
  const endDate = opts?.endDate ?? "2026-11-20";

  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const ri = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const ref = () => String(ri(400000000000, 439999999999));

  const months = computeMonths(endDate, monthsCount);
  const rows: Array<{
    date: string;
    amount: number;
    direction: "debit" | "credit";
    raw_description: string;
    account_tail: string | null;
  }> = [];

  function add(
    date: string,
    rupees: number,
    direction: "debit" | "credit",
    desc: string,
    tail: string | null = SAV
  ) {
    if (date > endDate) return;
    rows.push({
      date,
      amount: Math.round(rupees * 100),
      direction,
      raw_description: desc,
      account_tail: tail,
    });
  }

  months.forEach((ym, i) => {
    const [y, m] = [ym.slice(0, 4), parseInt(ym.slice(5, 7), 10)];
    const mon = MON[m - 1];
    const maxDays = daysIn(ym);
    const last =
      ym === endDate.slice(0, 7)
        ? Math.min(parseInt(endDate.slice(8, 10), 10), maxDays)
        : maxDays;
    const d = (day: number) => `${ym}-${pad2(Math.min(day, last))}`;

    // 1. Salary, same date each month
    add(
      d(1),
      85000,
      "credit",
      `NEFT CR-CITI0000002-ACME TECHNOLOGIES PVT LTD-SALARY ${mon} ${y}`
    );

    // 2. Clean recurring
    add(d(2), 10000, "debit", `UPI/SUNITA MEHTA/${ref()}/Maa monthly/HDFC`);
    add(
      d(2),
      1299,
      "debit",
      `UPI/CUREFIT HEALTHCARE/${ref()}/cult pass elite/HDFC`
    ); // unused subscription
    add(d(3), 22000, "debit", `UPI/RAMESH KULKARNI/${ref()}/RENT ${mon}/HDFC`);
    add(
      d(5),
      1200,
      "debit",
      `UPI/PUNE METRO RAIL CORP/${ref()}/pass recharge/HDFC`
    );
    // 4. Changed subscription: Netflix 199 for months 0..3, 499 from month 4 (August)
    add(
      d(7),
      i < 4 ? 199 : 499,
      "debit",
      `POS 4591XXXXXXXX${CARD} NETFLIX.COM MUMBAI IN`,
      CARD
    );
    add(
      d(9),
      [1452, 1478, 1491, 1466, 1484, 1459, 1470, 1488][i % 8],
      "debit",
      `BIL/BPAY/000${ri(100000000, 999999999)}/MSEDCL PUNE ELECTRICITY`
    );
    add(
      d(12),
      119,
      "debit",
      `UPI-AUTOPAY/SPOTIFY INDIA/${ref()}/mandate/HDFC`
    );
    add(d(14), 349, "debit", `UPI/RELIANCE JIO/${ref()}/Recharge/HDFC`);
    add(
      d(18),
      129,
      "debit",
      `GOOGLE*YOUTUBE PREMIUM G.CO/HELPPAY# ${CARD}`,
      CARD
    );

    // 6. Dining + delivery, clearly rising month over month
    const orders = ym === endDate.slice(0, 7) ? 19 : 5 + 2 * i;
    for (let k = 0; k < orders; k++) {
      const day = ri(1, last);
      const r = rnd();
      if (r < 0.45) {
        add(
          d(day),
          ri(220, 640),
          "debit",
          `UPI/SWIGGY*ORDER/${ri(100, 999)}//HDFC`
        );
      } else if (r < 0.8 || i < 3) {
        add(
          d(day),
          ri(240, 690),
          "debit",
          `UPI-ZOMATO LTD-ZOMATO.PAYU@HDFCBANK-HDFC0000001-${ref()}-PAYMENT`
        );
      } else {
        add(
          d(day),
          ri(600, 2400),
          "debit",
          `POS 4591XXXXXXXX${CARD} ${pick([
            "BARBEQUE NATION PUNE",
            "STARBUCKS KOREGAON PK",
            "VAISHALI RESTAURANT",
            "SOCIAL BANER",
          ])}`,
          CARD
        );
      }
    }

    // 7. Groceries
    for (let k = 0; k < ri(4, 6); k++) {
      const day = ri(1, last);
      add(
        d(day),
        ri(380, 1900),
        "debit",
        pick([
          `UPI/BLINKIT/${ref()}/Order/ICICI`,
          `UPI/ZEPTO MARKETPLACE/${ref()}//ICICI`,
          `UPI/INNOVATIVE RETAIL CONCEPTS/${ref()}/bigbasket/ICICI`,
          `POS 4591XXXXXXXX${CARD} DMART AUNDH PUNE`,
        ]),
        ICICI
      );
    }

    // Transport
    for (let k = 0; k < ri(6, 10); k++) {
      add(
        d(ri(1, last)),
        ri(90, 420),
        "debit",
        pick([
          `UPI/UBER INDIA/${ref()}/trip/ICICI`,
          `UPI/ANI TECHNOLOGIES OLA/${ref()}//ICICI`,
          `UPI/RAPIDO/${ref()}/bike taxi/ICICI`,
        ]),
        ICICI
      );
    }

    // Fuel, shopping, health, entertainment, cash
    add(
      d(ri(4, 26)),
      ri(400, 700),
      "debit",
      `POS 4591XXXXXXXX${CARD} HPCL SAI PETROLEUM PUNE`,
      CARD
    );
    for (let k = 0; k < ri(1, 3); k++) {
      add(
        d(ri(1, last)),
        ri(450, 3200),
        "debit",
        pick([
          `AMAZON PAY INDIA PVT LTD/${ref()}`,
          `UPI/MYNTRA DESIGNS/${ref()}//HDFC`,
          `UPI/FLIPKART INTERNET/${ref()}//HDFC`,
        ])
      );
    }
    if (rnd() < 0.8) {
      add(
        d(ri(1, last)),
        ri(180, 900),
        "debit",
        `UPI/APOLLO PHARMACY/${ref()}//ICICI`,
        ICICI
      );
    }
    if (rnd() < 0.7) {
      add(
        d(ri(1, last)),
        ri(300, 900),
        "debit",
        `UPI/BOOKMYSHOW/${ref()}/tickets/HDFC`
      );
    }
    add(
      d(ri(10, 25)),
      3000,
      "debit",
      `ATW-4591XXXXXXXX${CARD}-S1ANPN04-PUNE`,
      CARD
    );

    // 8. Local merchants no rule will match (correction loop demo: exactly 14 Bhagwati rows)
    if (i < 7) {
      for (let k = 0; k < 2; k++) {
        add(
          d(ri(3, 26)),
          ri(110, 180),
          "debit",
          `UPI/BHAGWATI TIFFIN SERVICE/${ref()}/lunch/HDFC`
        );
      }
    }
    if (rnd() < 0.6) {
      add(
        d(ri(1, last)),
        ri(150, 600),
        "debit",
        `POS 4591XXXXXXXX${CARD} SHREE SAI GENERAL STORES`,
        CARD
      );
    }
    if (rnd() < 0.5) {
      add(
        d(ri(1, last)),
        ri(80, 450),
        "debit",
        `UPI/Q${ri(100000000, 999999999)}@YBL/payment/ICICI`,
        ICICI
      );
    }
    if (rnd() < 0.4) {
      add(
        d(ri(1, last)),
        ri(200, 800),
        "debit",
        `UPI/KAKA HALWAI SWEET MART/${ref()}//HDFC`
      );
    }
    if (rnd() < 0.5) {
      add(
        d(ri(1, last)),
        ri(500, 2500),
        "debit",
        `UPI/98${ri(10000000, 99999999)}@YBL/sent via phonepe/HDFC`
      );
    }
  });

  // 9. New weekly subscription: Country Delight milk, Saturdays from 3 Oct 2026
  for (let t = Date.UTC(2026, 9, 3); ; t += 7 * 86400000) {
    const ds = new Date(t).toISOString().slice(0, 10);
    if (ds > endDate) break;
    add(
      ds,
      420,
      "debit",
      `UPI/COUNTRY DELIGHT/${ref()}/weekly milk/ICICI`,
      ICICI
    );
  }

  // 10. Quarterly interest, refund, bank charges
  add("2026-06-30", 412.55, "credit", "INT.PD:50100234594821:01-04-2026 TO 30-06-2026");
  add("2026-09-30", 389.1, "credit", "INT.PD:50100234594821:01-07-2026 TO 30-09-2026");
  add("2026-08-21", 1299, "credit", `UPI/AMAZON PAY REFUND/${ref()}/refund/HDFC`);
  add("2026-07-01", 17.7, "debit", "SMS CHARGES FOR QTR ENDED JUN26 INCL GST");
  add("2026-10-01", 17.7, "debit", "SMS CHARGES FOR QTR ENDED SEP26 INCL GST");

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const csvLine = (r: (typeof rows)[0]) =>
    `${r.date},"${r.raw_description}",${r.direction === "debit" ? "-" : ""}${formatRupees(
      r.amount
    )}`;

  const transactions: Transaction[] = rows.map((r, idx) => ({
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

  const advice: Advice[] = [
    {
      id: "adv_001",
      date_given: "2026-05-18",
      text: "Food delivery is at ₹4,900 this month and climbing. Cap it at ₹3,400 a month.",
      projected_monthly_saving: 150000,
    },
    {
      id: "adv_002",
      date_given: "2026-07-04",
      text: "Cancel cult.fit Elite. ₹1,299 a month and no fitness-related spending in three months.",
      projected_monthly_saving: 129900,
    },
    {
      id: "adv_003",
      date_given: "2026-07-04",
      text: "Cancel YouTube Premium. You already pay for Spotify for music.",
      projected_monthly_saving: 12900,
    },
    {
      id: "adv_004",
      date_given: "2026-08-22",
      text: "Netflix went from ₹199 to ₹499 in August. Drop back to the Mobile plan.",
      projected_monthly_saving: 30000,
    },
    {
      id: "adv_005",
      date_given: "2026-09-15",
      text: "Dining is up sharply since April. Cooking two more nights a week saves about ₹2,800.",
      projected_monthly_saving: 280000,
    },
  ].map((a) => ({ ...a, accepted: false, acted_on_date: null }));

  return {
    contract_version: "1.0.0",
    generated_at: new Date().toISOString(),
    user: { name: "Aarav Mehta", city: "Pune" },
    transactions,
    advice,
  };
}

export function renderCsv(fixture: Fixture): string {
  return (
    "Date,Narration,Amount\n" +
    fixture.transactions.map((t) => t.source_line).join("\n") +
    "\n"
  );
}

const extractPayee = (desc: string): string => {
  const m = desc.match(/^UPI(?:-AUTOPAY)?\/([^/]+)\//);
  if (m) return m[1];
  const z = desc.match(/^UPI-([^-]+)-/);
  if (z) return z[1];
  return desc.replace(/^POS \S+ /, "");
};

export function renderSmsDump(fixture: Fixture): string {
  // Deterministic helper for fake ref / bal / time based on transaction index & id
  return (
    fixture.transactions
      .map((t, idx) => {
        const hash = (idx * 9301 + 49297) % 233280;
        const refNum = String(400000000000 + ((idx * 1234567) % 39999999999));
        const avlBal = 4000000 + (hash * 350) % 11000000;
        const hh = pad2(8 + (idx % 14));
        const mm = pad2((idx * 7) % 60);
        const ss = pad2((idx * 13) % 60);

        if (t.direction === "credit") {
          return `Update! INR ${formatInr(t.amount)} deposited in HDFC Bank A/c XX${SAV} on ${formatDayMonYear(
            t.date
          )} for ${t.raw_description}. Avl bal INR ${formatInr(avlBal)}.`;
        }
        if (t.account_tail === ICICI) {
          return `ICICI Bank Acct XX${ICICI} debited for Rs ${formatRupees(
            t.amount
          )} on ${formatDayMonYear(t.date)}; ${extractPayee(
            t.raw_description
          )} credited. UPI:${refNum}. Call 18002662 for dispute. SMS BLOCK ${ICICI} to 9215676766.`;
        }
        if (t.account_tail === CARD) {
          return `Spent Rs.${formatRupees(
            t.amount
          )} On HDFC Bank Card ${CARD} At ${extractPayee(
            t.raw_description
          )} On ${t.date}:${hh}:${mm}:${ss} Not You? Call 18002586161`;
        }
        return `Sent Rs.${formatRupees(t.amount)}\nFrom HDFC Bank A/C *${SAV}\nTo ${extractPayee(
          t.raw_description
        )}\nOn ${formatDaySlashMonSlashYear(t.date)}\nRef ${refNum}\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808`;
      })
      .join("\n\n") + "\n"
  );
}
