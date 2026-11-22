import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSms } from "../sms";
import { parseIndianDate } from "../dates";
import type { SmsLlmFallback } from "../../contract/types";

describe("SMS Parser", () => {
  const referenceDate = "2026-11-21";

  const EXAMPLES = [
    // 1. HDFC UPI debit (multi-line)
    `Sent Rs.412.00\nFrom HDFC Bank A/C *4821\nTo SWIGGY\nOn 14/11/26\nRef 431298765432\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808`,
    // 2. HDFC NEFT credit
    `Update! INR 85,000.00 deposited in HDFC Bank A/c XX4821 on 01-NOV-26 for NEFT CR-CITI0000002-ACME TECHNOLOGIES PVT LTD-SALARY NOV 2026. Avl bal INR 1,12,430.55.`,
    // 3. HDFC debit card
    `Spent Rs.499.00 On HDFC Bank Card 7719 At NETFLIX.COM On 2026-11-07:10:12:44 Not You? Call 18002586161`,
    // 4. ICICI UPI debit
    `ICICI Bank Acct XX903 debited for Rs 250.00 on 12-Nov-26; ZOMATO LTD credited. UPI:431209876543. Call 18002662 for dispute. SMS BLOCK 903 to 9215676766.`,
    // 5. ICICI credit
    `Dear Customer, Acct XX903 is credited with Rs 1,299.00 on 21-Aug-26 from AMAZON PAY. UPI:430912345678-ICICI Bank.`,
    // 6. SBI UPI debit
    `Dear UPI user A/C X4821 debited by 120.0 on date 12Nov26 trf to BHAGWATI TIFFIN Refno 431212345678. If not u? call 1800111109. -SBI`,
    // 7. SBI UPI credit, no payee
    `Dear SBI UPI User, ur A/cX4821 credited by Rs500 on 15Nov26 by (Ref no 431298712345)`,
    // 8. Axis UPI debit (multi-line)
    `INR 1200.00 debited\nA/c no. XX4821\n05-11-26, 10:15:32\nUPI/P2M/431298765432/PUNE METRO RAIL\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank`,
    // 9. Axis credit
    `INR 2,500.00 credited\nA/c no. XX4821\n18-11-26, 19:40:02\nIMPS/P2A/431212398765/RAHUL SHARMA\nAxis Bank`,
    // 10. OTP (not a transaction)
    `Your OTP for txn of Rs 2,000 at AMAZON is 482913. Do not share it with anyone.`,
    // 11. No bank pattern (LLM fallback territory)
    `Rs.640 paid to KAKA HALWAI via PhonePe on 10/11 from a/c ..4821`,
  ];

  it("5. parses each of the 11 SMS examples individually with exact fields", async () => {
    // 1. HDFC UPI debit
    const r1 = await parseSms(EXAMPLES[0], { referenceDate });
    expect(r1.transactions).toHaveLength(1);
    expect(r1.transactions[0]).toEqual({
      id: "sms_0001",
      date: "2026-11-14",
      amount: 41200,
      direction: "debit",
      raw_description: "SWIGGY",
      account_tail: "4821",
      source_kind: "sms",
      source_file: "sms-paste",
      source_line: EXAMPLES[0],
      merchant_normalized: null,
      category: null,
      category_source: null,
      confidence: null,
    });

    // 2. HDFC NEFT credit
    const r2 = await parseSms(EXAMPLES[1], { referenceDate });
    expect(r2.transactions).toHaveLength(1);
    expect(r2.transactions[0]).toEqual({
      id: "sms_0001",
      date: "2026-11-01",
      amount: 8500000,
      direction: "credit",
      raw_description:
        "NEFT CR-CITI0000002-ACME TECHNOLOGIES PVT LTD-SALARY NOV 2026",
      account_tail: "4821",
      source_kind: "sms",
      source_file: "sms-paste",
      source_line: EXAMPLES[1],
      merchant_normalized: null,
      category: null,
      category_source: null,
      confidence: null,
    });

    // 3. HDFC debit card
    const r3 = await parseSms(EXAMPLES[2], { referenceDate });
    expect(r3.transactions).toHaveLength(1);
    expect(r3.transactions[0]).toEqual({
      id: "sms_0001",
      date: "2026-11-07",
      amount: 49900,
      direction: "debit",
      raw_description: "NETFLIX.COM",
      account_tail: "7719",
      source_kind: "sms",
      source_file: "sms-paste",
      source_line: EXAMPLES[2],
      merchant_normalized: null,
      category: null,
      category_source: null,
      confidence: null,
    });

    // 4. ICICI UPI debit
    const r4 = await parseSms(EXAMPLES[3], { referenceDate });
    expect(r4.transactions).toHaveLength(1);
    expect(r4.transactions[0]).toEqual({
      id: "sms_0001",
      date: "2026-11-12",
      amount: 25000,
      direction: "debit",
      raw_description: "ZOMATO LTD",
      account_tail: "903",
      source_kind: "sms",
      source_file: "sms-paste",
      source_line: EXAMPLES[3],
      merchant_normalized: null,
      category: null,
      category_source: null,
      confidence: null,
    });

    // 5. ICICI credit
    const r5 = await parseSms(EXAMPLES[4], { referenceDate });
    expect(r5.transactions).toHaveLength(1);
    expect(r5.transactions[0]).toEqual({
      id: "sms_0001",
      date: "2026-08-21",
      amount: 129900,
      direction: "credit",
      raw_description: "AMAZON PAY",
      account_tail: "903",
      source_kind: "sms",
      source_file: "sms-paste",
      source_line: EXAMPLES[4],
      merchant_normalized: null,
      category: null,
      category_source: null,
      confidence: null,
    });

    // 6. SBI UPI debit
    const r6 = await parseSms(EXAMPLES[5], { referenceDate });
    expect(r6.transactions).toHaveLength(1);
    expect(r6.transactions[0]).toEqual({
      id: "sms_0001",
      date: "2026-11-12",
      amount: 12000,
      direction: "debit",
      raw_description: "BHAGWATI TIFFIN",
      account_tail: "4821",
      source_kind: "sms",
      source_file: "sms-paste",
      source_line: EXAMPLES[5],
      merchant_normalized: null,
      category: null,
      category_source: null,
      confidence: null,
    });

    // 7. SBI UPI credit, no payee
    const r7 = await parseSms(EXAMPLES[6], { referenceDate });
    expect(r7.transactions).toHaveLength(1);
    expect(r7.transactions[0]).toEqual({
      id: "sms_0001",
      date: "2026-11-15",
      amount: 50000,
      direction: "credit",
      raw_description: "SBI CREDIT REF 431298712345",
      account_tail: "4821",
      source_kind: "sms",
      source_file: "sms-paste",
      source_line: EXAMPLES[6],
      merchant_normalized: null,
      category: null,
      category_source: null,
      confidence: null,
    });

    // 8. Axis UPI debit
    const r8 = await parseSms(EXAMPLES[7], { referenceDate });
    expect(r8.transactions).toHaveLength(1);
    expect(r8.transactions[0]).toEqual({
      id: "sms_0001",
      date: "2026-11-05",
      amount: 120000,
      direction: "debit",
      raw_description: "PUNE METRO RAIL",
      account_tail: "4821",
      source_kind: "sms",
      source_file: "sms-paste",
      source_line: EXAMPLES[7],
      merchant_normalized: null,
      category: null,
      category_source: null,
      confidence: null,
    });

    // 9. Axis credit
    const r9 = await parseSms(EXAMPLES[8], { referenceDate });
    expect(r9.transactions).toHaveLength(1);
    expect(r9.transactions[0]).toEqual({
      id: "sms_0001",
      date: "2026-11-18",
      amount: 250000,
      direction: "credit",
      raw_description: "RAHUL SHARMA",
      account_tail: "4821",
      source_kind: "sms",
      source_file: "sms-paste",
      source_line: EXAMPLES[8],
      merchant_normalized: null,
      category: null,
      category_source: null,
      confidence: null,
    });

    // 10. OTP (not a transaction)
    const r10 = await parseSms(EXAMPLES[9], { referenceDate });
    expect(r10.transactions).toHaveLength(0);
    expect(r10.unparsed).toHaveLength(1);
    expect(r10.unparsed[0].reason).toBe("not_a_transaction");
    expect(r10.unparsed[0].index).toBe(1);

    // 11. No bank pattern (without fallback)
    const r11 = await parseSms(EXAMPLES[10], { referenceDate });
    expect(r11.transactions).toHaveLength(0);
    expect(r11.unparsed).toHaveLength(1);
    expect(r11.unparsed[0].reason).toBe("no_pattern");
    expect(r11.unparsed[0].index).toBe(1);

    // 11 with mock fallback
    const mockFallback: SmsLlmFallback = async () => [
      {
        is_transaction: true,
        date: "2026-11-10",
        amount: 64000,
        direction: "debit",
        merchant: "KAKA HALWAI",
        account_tail: "4821",
      },
    ];
    const r11Fallback = await parseSms(EXAMPLES[10], {
      referenceDate,
      llmFallback: mockFallback,
    });
    expect(r11Fallback.transactions).toHaveLength(1);
    expect(r11Fallback.stats.via_llm).toBe(1);
    expect(r11Fallback.transactions[0]).toEqual({
      id: "sms_0001",
      date: "2026-11-10",
      amount: 64000,
      direction: "debit",
      raw_description: "KAKA HALWAI",
      account_tail: "4821",
      source_kind: "sms",
      source_file: "sms-paste",
      source_line: EXAMPLES[10],
      merchant_normalized: null,
      category: null,
      category_source: null,
      confidence: null,
    });
  });

  it("6. parses the 11-message combined paste correctly with and without fallback", async () => {
    const combined = EXAMPLES.join("\n\n");

    // Without fallback
    const resNoFallback = await parseSms(combined, { referenceDate });
    expect(resNoFallback.stats).toEqual({
      total_inputs: 11,
      parsed: 9,
      unparsed: 2,
      via_llm: 0,
    });
    expect(resNoFallback.transactions).toHaveLength(9);
    expect(resNoFallback.unparsed).toHaveLength(2);
    expect(resNoFallback.unparsed[0].reason).toBe("not_a_transaction");
    expect(resNoFallback.unparsed[1].reason).toBe("no_pattern");

    // With fallback
    const mockFallback: SmsLlmFallback = async (messages) => {
      return messages.map((m) => {
        if (m.includes("KAKA HALWAI")) {
          return {
            is_transaction: true,
            date: "2026-11-10",
            amount: 64000,
            direction: "debit",
            merchant: "KAKA HALWAI",
            account_tail: "4821",
          };
        }
        return null;
      });
    };

    const resWithFallback = await parseSms(combined, {
      referenceDate,
      llmFallback: mockFallback,
    });
    expect(resWithFallback.stats).toEqual({
      total_inputs: 11,
      parsed: 10,
      unparsed: 1,
      via_llm: 1,
    });
    expect(resWithFallback.transactions).toHaveLength(10);
    expect(resWithFallback.unparsed).toHaveLength(1);
    expect(resWithFallback.unparsed[0].reason).toBe("not_a_transaction");
  });

  it("7. parses public/demo/sms-dump.txt with all 361 parsed and 0 unparsed", async () => {
    const filePath = resolve(__dirname, "../../public/demo/sms-dump.txt");
    const text = readFileSync(filePath, "utf-8");
    const res = await parseSms(text, { referenceDate });

    expect(res.stats.total_inputs).toBe(361);
    expect(res.stats.parsed).toBe(361);
    expect(res.stats.unparsed).toBe(0);
    expect(res.transactions).toHaveLength(361);
    expect(res.unparsed).toHaveLength(0);

    // Verify 100% agreement with src/lib/ingest/fallback
    const { fallbackParseSms } = await import("../../src/lib/ingest/fallback");
    const fallbackRes = await fallbackParseSms(text);
    expect(fallbackRes.transactions).toHaveLength(361);

    for (let i = 0; i < 361; i++) {
      const kt = res.transactions[i];
      const ft = fallbackRes.transactions[i];
      expect(kt.date).toBe(ft.date);
      expect(kt.amount).toBe(ft.amount);
      expect(kt.direction).toBe(ft.direction);
      expect(kt.account_tail).toBe(ft.account_tail);
      expect(kt.raw_description).toBe(ft.raw_description);
    }
  });

  it("8. keeps full merchant name in cleanPayee without slash-truncation", async () => {
    const msg = `Spent Rs.129.00 On HDFC Bank Card 7719 At GOOGLE*YOUTUBE PREMIUM G.CO/HELPPAY# 7719 On 2026-04-18:14:15:30 Not You? Call 18002586161`;
    const res = await parseSms(msg, { referenceDate });

    expect(res.transactions).toHaveLength(1);
    expect(res.transactions[0].raw_description).toBe(
      "GOOGLE*YOUTUBE PREMIUM G.CO/HELPPAY# 7719"
    );
  });

  it("9. does not flag real transactions with OTP safety footer as not_a_transaction", async () => {
    const msg = `Sent Rs.412.00\nFrom HDFC Bank A/C *4821\nTo SWIGGY\nOn 14/11/26\nRef 431298765432\nNever share your OTP with anyone.`;
    const res = await parseSms(msg, { referenceDate });

    expect(res.transactions).toHaveLength(1);
    expect(res.transactions[0]).toMatchObject({
      amount: 41200,
      direction: "debit",
      raw_description: "SWIGGY",
    });
  });

  it("10. parses PNB generic debit without capturing 'Rs' as payee", async () => {
    const msg = `PNB: A/c XX1234 debited for Rs 500.00 on 12-Nov-26 towards electricity bill. Ref 431298112233`;
    const res = await parseSms(msg, { referenceDate });

    expect(res.transactions).toHaveLength(1);
    expect(res.transactions[0]).toMatchObject({
      amount: 50000,
      direction: "debit",
      raw_description: "electricity bill",
      account_tail: "1234",
    });
  });

  it("11. parses year-less dates (12 Nov, 10/11) and rolls back if after referenceDate", () => {
    // Current reference date: 2026-11-21
    // 12 Nov is on or before 2026-11-21 => stays 2026-11-12
    expect(parseIndianDate("12 Nov", "2026-11-21")).toBe("2026-11-12");

    // Reference date: 2026-03-01
    // 12 Nov would be 2026-11-12, which is in future => rolls back to 2025-11-12
    expect(parseIndianDate("12 Nov", "2026-03-01")).toBe("2025-11-12");
    expect(parseIndianDate("10/11", "2026-03-01")).toBe("2025-11-10");
  });
});
