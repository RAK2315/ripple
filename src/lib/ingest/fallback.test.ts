import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fallbackParseCsv, fallbackParseSms, parseDate } from "./fallback";

it("parses the whole demo SMS dump", async () => {
  const r = await fallbackParseSms(readFileSync("public/demo/sms-dump.txt", "utf8"));
  expect(r.unparsed).toEqual([]);
  expect(r.stats.parsed).toBe(361);
  expect(r.transactions.find((t) => t.raw_description === "BHAGWATI TIFFIN SERVICE")?.account_tail).toBe("4821");
});
it("parses the demo CSV", () => {
  const r = fallbackParseCsv(readFileSync("public/demo/statement.csv", "utf8"), { sourceFile: "statement.csv" });
  expect(r.stats.parsed).toBe(361);
});

// ---- Fixes ported after reviewing kirti/ (PR #1). Each case below was wrong in this parser before. ----

const one = async (sms: string, ref = "2026-11-20") => fallbackParseSms(sms, { referenceDate: ref });
const csv = (text: string) => fallbackParseCsv(text, { sourceFile: "x.csv" });

describe("SMS: never silently drop a real transaction", () => {
  it("keeps a debit at a merchant named BEST OFFERS MART", async () => {
    const r = await one("ICICI Bank Acct XX903 debited for Rs 300.00 on 12-Nov-26; BEST OFFERS MART credited. UPI:431209876543.");
    expect(r.transactions[0]).toMatchObject({ amount: 30000, direction: "debit", raw_description: "BEST OFFERS MART" });
  });
  it("keeps a refund credit for a failed txn", async () => {
    const r = await one("Refund of Rs 499.00 for failed txn credited to your A/c XX4821 on 12-11-26. -HDFC Bank");
    expect(r.transactions[0]).toMatchObject({ amount: 49900, direction: "credit", account_tail: "4821", date: "2026-11-12" });
  });
  it("keeps a real alert that only mentions OTP in its safety footer", async () => {
    const r = await one("Sent Rs.412.00\nFrom HDFC Bank A/C *4821\nTo SWIGGY\nOn 14/11/26\nRef 431298765432\nNever share your OTP or PIN with anyone.");
    expect(r.stats).toMatchObject({ parsed: 1, unparsed: 0 });
  });
  it("still rejects OTPs, scheduled debits, declines, offers, bill reminders and balance-only messages", async () => {
    for (const m of [
      "Your OTP for txn of Rs 2,000 at AMAZON is 482913. Do not share.",
      "Rs 499 will be debited from your a/c XX4821 on 20-11-26 towards NETFLIX autopay.",
      "Txn of Rs 2,000.00 at AMAZON on your HDFC Card 7719 declined due to insufficient balance.",
      "Congratulations! You are eligible for a pre-approved personal loan of Rs 5,00,000. Apply now.",
      "Your credit card bill of Rs 8,400 is due on 25-11-26. Pay now to avoid charges.",
      "Available balance in your A/c XX4821 is Rs 12,000.00 as on 20-11-26.",
    ])
      expect((await one(m)).unparsed[0]?.reason, m).toBe("not_a_transaction");
  });
});

describe("SMS: CONTRACT 6b and coverage", () => {
  it("a single multi-line SMS pasted alone is one transaction (6b)", async () => {
    const r = await one("Sent Rs.412.00\nFrom HDFC Bank A/C *4821\nTo SWIGGY\nOn 14/11/26\nRef 431298765432\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808");
    expect(r.stats).toEqual({ total_inputs: 1, parsed: 1, unparsed: 0, via_llm: 0 });
    expect(r.transactions[0]).toMatchObject({ date: "2026-11-14", amount: 41200, direction: "debit", raw_description: "SWIGGY", account_tail: "4821" });
  });
  it("a list of one-line alerts is never merged into one message", async () => {
    const r = await one(
      "ICICI Bank Acct XX903 debited for Rs 250.00 on 12-Nov-26; ZOMATO LTD credited. UPI:431209876543.\nICICI Bank Acct XX903 debited for Rs 300.00 on 13-Nov-26; SWIGGY credited. UPI:431209876544.",
    );
    expect(r.stats.parsed).toBe(2);
  });
  it("Axis multi-line pasted alone", async () => {
    const r = await one("INR 1200.00 debited\nA/c no. XX4821\n05-11-26, 10:15:32\nUPI/P2M/431298765432/PUNE METRO RAIL\nNot you? SMS BLOCK 4821 to 919951860002\nAxis Bank");
    expect(r.transactions[0]).toMatchObject({ amount: 120000, direction: "debit", raw_description: "PUNE METRO RAIL" });
  });
  it("SBI UPI credit with no payee keeps its own reference as the description", async () => {
    const r = await one("Dear SBI UPI User, ur A/cX4821 credited by Rs500 on 15Nov26 by (Ref no 431298712345)");
    expect(r.transactions[0]).toMatchObject({ date: "2026-11-15", amount: 50000, direction: "credit", account_tail: "4821", raw_description: "by (Ref no 431298712345)" });
  });
  it("generic fallback for an unlisted bank, description verbatim", async () => {
    const k = await one("Sent Rs.500.00 from Kotak Bank AC X1234 to swiggy@icici on 12-11-26.UPI Ref 431298765432. Not you, https://kotak.com/fraud");
    expect(k.transactions[0]).toMatchObject({ amount: 50000, direction: "debit", raw_description: "swiggy@icici", date: "2026-11-12" });
    const p = await one("Your A/c XXXXXX5678 is debited for Rs.1,200.00 on 12-11-2026 and credited to A/c XXXX9999 (UPI Ref no 431212345678)-PNB");
    expect(p.transactions[0]).toMatchObject({ amount: 120000, direction: "debit", account_tail: "5678" });
    expect(p.transactions[0].raw_description).not.toBe("Rs");
    expect(p.transactions[0].source_line.replace(/\s+/g, " ")).toContain(p.transactions[0].raw_description);
  });
  it("year-less dates resolve against the reference date, rolling back a year when needed", async () => {
    const nov = await one("Rs 2,400.00 spent on your SBI Credit Card ending 5521 at TOIT BREWPUB on 12 Nov. Avl Lmt Rs 45,000");
    expect(nov.transactions[0]).toMatchObject({ date: "2026-11-12", amount: 240000, direction: "debit", account_tail: "5521", raw_description: "TOIT BREWPUB" });
    const dec = await one("Rs 2,400.00 spent on your SBI Credit Card ending 5521 at TOIT on 28 Dec. Avl Lmt Rs 45,000", "2027-01-05");
    expect(dec.transactions[0].date).toBe("2026-12-28");
  });
  it("impossible dates are bad_date, never a transaction", async () => {
    const r = await one("Sent Rs.412.00\nFrom HDFC Bank A/C *4821\nTo SWIGGY\nOn 45/13/26\nRef 431298765432");
    expect(r.transactions).toHaveLength(0);
    expect(parseDate("45/13/26")).toBeNull();
    expect(parseDate("31/02/2026")).toBeNull();
  });
});

describe("CSV: fixes and coverage", () => {
  it("Dr/Cr type column sets the direction", () => {
    const r = csv("Txn Date,Particulars,Amount,Dr/Cr\n14-Nov-26,SWIGGY,412.00,DR\n15-Nov-26,REFUND AMAZON,999.00,CR");
    expect(r.transactions.map((t) => t.direction)).toEqual(["debit", "credit"]);
  });
  it("transaction date is preferred over value date", () => {
    const r = csv("Value Date,Txn Date,Narration,Debit,Credit\n15/11/26,14/11/26,SWIGGY,412.00,");
    expect(r.transactions[0].date).toBe("2026-11-14");
  });
  it("impossible dates are bad_date and garbage amounts are bad_amount", () => {
    expect(csv("Date,Narration,Amount\n31/02/26,SWIGGY,-412.00").unparsed[0].reason).toBe("bad_date");
    expect(csv("Date,Narration,Amount\n14/11/26,SWIGGY,12abc").unparsed[0].reason).toBe("bad_amount");
    expect(csv("Date,Narration,Amount\n14/11/26,SWIGGY,").unparsed[0].reason).toBe("no_amount");
  });
  it("account tail from the preamble, escaped quotes, (Dr)/(Cr) headers, footer rows", () => {
    const pre = csv('HDFC BANK LTD\nAccount No : XXXXXXXX4821\n\nDate,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance\n14/11/26,UPI/SWIGGY*ORDER/412//HDFC,0000431298765432,"1,234.50",,"45,120.10"');
    expect(pre.transactions[0]).toMatchObject({ amount: 123450, direction: "debit", account_tail: "4821", raw_description: "UPI/SWIGGY*ORDER/412//HDFC" });
    expect(csv('Date,Narration,Amount\n14/11/26,"PAYMENT TO ""RAJU"" STORES",-120.00').transactions[0].raw_description).toBe('PAYMENT TO "RAJU" STORES');
    expect(csv("Tran Date,Particulars,Withdrawal (Dr),Deposit (Cr),Balance\n14-11-2026,SWIGGY,412.00,,1000.00").transactions[0]).toMatchObject({ date: "2026-11-14", amount: 41200, direction: "debit" });
    const foot = csv("Date,Narration,Amount\n14/11/26,SWIGGY,-412.00\n*** End of Statement ***\nTotal Debits: 412.00");
    expect(foot.stats).toEqual({ total_inputs: 3, parsed: 1, unparsed: 2, via_llm: 0 });
    expect(foot.unparsed.every((u) => u.reason === "not_a_transaction")).toBe(true);
  });
  it("CONTRACT 6a still exact", () => {
    const r = csv('Txn Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance\n14/11/26,UPI/SWIGGY*ORDER/412//HDFC,0000431298765432,"1,234.50",,"45,120.10"');
    expect(r.transactions[0]).toMatchObject({ id: "csv_0001", date: "2026-11-14", amount: 123450, direction: "debit", raw_description: "UPI/SWIGGY*ORDER/412//HDFC", account_tail: null });
  });
});
