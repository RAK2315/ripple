import type { Direction } from "../contract/types";
import { parseIndianDate } from "./dates";
import { parseMoneyString } from "./money";

export interface ExtractedSms {
  amount: number;
  date: string;
  direction: Direction;
  raw_description: string;
  account_tail: string | null;
}

/**
 * Checks if a message is a non-transaction before attempting regex patterns.
 * Ensures safety footers like "Never share your OTP" on real debit/credit
 * transactions do NOT cause them to be marked as not_a_transaction.
 */
export function isNonTransaction(message: string): boolean {
  const lower = message.toLowerCase();

  // Check if message is a completed transaction confirmation
  const isCompletedTxn =
    /\b(?:sent\s+rs|spent\s+rs|deposited\s+in|debited\s+for|credited\s+with|debited\s+by|credited\s+by|is\s+credited\s+with|a\/c\s+(?:xx|\*)?\d+\s+debited|acct\s+(?:xx|\*)?\d+\s+debited)\b/i.test(
      message
    );

  // 1. OTP / Verification code message shape
  const isOtpMessage =
    /\byour\s+otp\s+for\b/i.test(lower) ||
    /\b(?:is\s+your\s+otp|use\s+otp\b|one\s*time\s*password\s+is\b)/i.test(lower) ||
    /\botp\s+for\s+(?:txn|transaction)\s+of\b/i.test(lower) ||
    /\bverification\s+code\s+is\s+\d{4,8}\b/i.test(lower) ||
    /\botp\s+(?:to\s+authenticate|to\s+verify|is\s+\d{4,8})\b/i.test(lower);

  if (isOtpMessage && !isCompletedTxn) {
    return true;
  }

  // 2. Future / scheduled debit (not yet executed)
  if (
    /\b(?:will be debited|is scheduled to be debited|auto-?debit scheduled|has been scheduled to be debited)\b/i.test(
      lower
    ) &&
    !isCompletedTxn
  ) {
    return true;
  }

  // 3. Promotional offers (avoid matching real merchants like "BEST OFFERS MART")
  if (
    /\b(?:pre-approved personal loan|apply for personal loan|instant personal loan offer|claim your reward points|congratulations! you are eligible for)\b/i.test(
      lower
    )
  ) {
    return true;
  }

  // 4. Pure balance enquiry (no debit / credit event)
  if (
    /\b(?:available balance in your a\/c is|balance enquiry|avl bal in your account is)\b/i.test(
      lower
    ) &&
    !/\b(?:debited|credited|spent|deposited|sent|withdrawn)\b/i.test(lower)
  ) {
    return true;
  }

  // 5. Failed / declined transactions (avoid matching "Refund for failed txn credit")
  if (
    /\b(?:transaction (?:has been )?declined|txn declined|transaction failed|txn failed|declined due to insufficient)\b/i.test(
      lower
    ) &&
    !/\b(?:refund|credited|deposited)\b/i.test(lower)
  ) {
    return true;
  }

  return false;
}

/**
 * Cleans extracted merchant / payee strings.
 * Keeps the full payee name as written in the SMS without chopping at "/"
 * so the app can normalize it.
 */
function cleanPayee(raw: string): string {
  let payee = raw.trim();
  // Strip trailing punctuation
  payee = payee.replace(/[.;,]+$/, "").trim();
  return payee.replace(/\s+/g, " ").trim();
}

/**
 * Tries bank-specific and general patterns.
 */
export function matchSmsPattern(
  message: string,
  referenceDate?: string
): ExtractedSms | null {
  const norm = message.replace(/\r?\n/g, " ");

  // 1. HDFC Credit (NEFT/salary/deposit) - Example 2
  // Update! INR 85,000.00 deposited in HDFC Bank A/c XX4821 on 01-NOV-26 for NEFT CR-CITI0000002-ACME TECHNOLOGIES PVT LTD-SALARY NOV 2026. Avl bal INR 1,12,430.55.
  const hdfcCreditMatch = message.match(
    /Update!\s+(?:INR|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+deposited\s+in\s+HDFC\s+Bank\s+A\/c\s*(?:XX|\*)*([0-9]{3,4})\s+on\s+([0-9a-zA-Z-]+)\s+for\s+(.+?)(?:\.\s*Avl\s*bal|\.$|$)/i
  );
  if (hdfcCreditMatch) {
    const amountParsed = parseMoneyString(hdfcCreditMatch[1]);
    const date = parseIndianDate(hdfcCreditMatch[3], referenceDate);
    if (amountParsed && date) {
      return {
        amount: amountParsed.amount,
        date,
        direction: "credit",
        raw_description: cleanPayee(hdfcCreditMatch[4]),
        account_tail: hdfcCreditMatch[2],
      };
    }
  }

  // 2. HDFC UPI Debit (multi-line or single line) - Example 1
  // Sent Rs.412.00 / From HDFC Bank A/C *4821 / To SWIGGY / On 14/11/26 / Ref 431298765432
  const hdfcUpiMatch = message.match(
    /Sent\s+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+From\s+HDFC\s+Bank\s+A\/C\s*\*?([0-9]{3,4})\s+To\s+(.+?)\s+On\s+([0-9/.-]+)(?:\s+Ref\s*([0-9]+))?/i
  );
  if (hdfcUpiMatch) {
    const amountParsed = parseMoneyString(hdfcUpiMatch[1]);
    const date = parseIndianDate(hdfcUpiMatch[4], referenceDate);
    if (amountParsed && date) {
      return {
        amount: amountParsed.amount,
        date,
        direction: "debit",
        raw_description: cleanPayee(hdfcUpiMatch[3]),
        account_tail: hdfcUpiMatch[2],
      };
    }
  }

  // 3. HDFC Card Spend - Example 3
  // Spent Rs.499.00 On HDFC Bank Card 7719 At NETFLIX.COM On 2026-11-07:10:12:44
  const hdfcCardMatch = message.match(
    /Spent\s+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+On\s+HDFC\s+Bank\s+Card\s*([0-9]{3,4})\s+At\s+(.+?)\s+On\s+([0-9a-zA-Z/.:-]+?)(?:\s+Not\s*You\?|$|\.)/i
  );
  if (hdfcCardMatch) {
    const amountParsed = parseMoneyString(hdfcCardMatch[1]);
    const date = parseIndianDate(hdfcCardMatch[4], referenceDate);
    if (amountParsed && date) {
      return {
        amount: amountParsed.amount,
        date,
        direction: "debit",
        raw_description: cleanPayee(hdfcCardMatch[3]),
        account_tail: hdfcCardMatch[2],
      };
    }
  }

  // 4. ICICI UPI Debit - Example 4
  // ICICI Bank Acct XX903 debited for Rs 250.00 on 12-Nov-26; ZOMATO LTD credited. UPI:431209876543.
  const iciciDebitMatch = message.match(
    /ICICI\s+Bank\s+Acct\s*(?:XX|\*)*([0-9]{3,4})\s+debited\s+for\s+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+on\s+([0-9a-zA-Z-]+);\s*(.+?)\s+credited(?:\.\s*UPI:([0-9]+))?/i
  );
  if (iciciDebitMatch) {
    const amountParsed = parseMoneyString(iciciDebitMatch[2]);
    const date = parseIndianDate(iciciDebitMatch[3], referenceDate);
    if (amountParsed && date) {
      return {
        amount: amountParsed.amount,
        date,
        direction: "debit",
        raw_description: cleanPayee(iciciDebitMatch[4]),
        account_tail: iciciDebitMatch[1],
      };
    }
  }

  // 5. ICICI Credit - Example 5
  // Dear Customer, Acct XX903 is credited with Rs 1,299.00 on 21-Aug-26 from AMAZON PAY. UPI:430912345678-ICICI Bank.
  const iciciCreditMatch = message.match(
    /(?:Dear\s+Customer,?\s*)?Acct\s*(?:XX|\*)*([0-9]{3,4})\s+is\s+credited\s+with\s+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+on\s+([0-9a-zA-Z-]+)\s+from\s+(.+?)(?:\.\s*UPI:|$|\.)/i
  );
  if (iciciCreditMatch) {
    const amountParsed = parseMoneyString(iciciCreditMatch[2]);
    const date = parseIndianDate(iciciCreditMatch[3], referenceDate);
    if (amountParsed && date) {
      return {
        amount: amountParsed.amount,
        date,
        direction: "credit",
        raw_description: cleanPayee(iciciCreditMatch[4]),
        account_tail: iciciCreditMatch[1],
      };
    }
  }

  // 6. SBI UPI Debit - Example 6
  // Dear UPI user A/C X4821 debited by 120.0 on date 12Nov26 trf to BHAGWATI TIFFIN Refno 431212345678. If not u? call 1800111109. -SBI
  const sbiDebitMatch = message.match(
    /A\/C\s*[X*]*([0-9]{3,4})\s+debited\s+by\s+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+on\s+date\s+([0-9a-zA-Z-]+)\s+trf\s+to\s+(.+?)(?:\s+Refno|\.|$|\s+If\s+not)/i
  );
  if (sbiDebitMatch) {
    const amountParsed = parseMoneyString(sbiDebitMatch[2]);
    const date = parseIndianDate(sbiDebitMatch[3], referenceDate);
    if (amountParsed && date) {
      return {
        amount: amountParsed.amount,
        date,
        direction: "debit",
        raw_description: cleanPayee(sbiDebitMatch[4]),
        account_tail: sbiDebitMatch[1],
      };
    }
  }

  // 7. SBI UPI Credit (No Payee) - Example 7
  // Dear SBI UPI User, ur A/cX4821 credited by Rs500 on 15Nov26 by (Ref no 431298712345)
  const sbiCreditMatch = message.match(
    /(?:ur\s+)?A\/c\s*[X*]*([0-9]{3,4})\s+credited\s+by\s+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+on\s+([0-9a-zA-Z-]+)(?:\s+by\s+\(Ref\s*no\s*([0-9]+)\))?/i
  );
  if (sbiCreditMatch) {
    const amountParsed = parseMoneyString(sbiCreditMatch[2]);
    const date = parseIndianDate(sbiCreditMatch[3], referenceDate);
    if (amountParsed && date) {
      const refNo = sbiCreditMatch[4];
      const desc = refNo ? `SBI CREDIT REF ${refNo}` : "SBI CREDIT";
      return {
        amount: amountParsed.amount,
        date,
        direction: "credit",
        raw_description: desc,
        account_tail: sbiCreditMatch[1],
      };
    }
  }

  // 8. Axis UPI Debit (multi-line) - Example 8
  // INR 1200.00 debited / A/c no. XX4821 / 05-11-26, 10:15:32 / UPI/P2M/431298765432/PUNE METRO RAIL / Not you? ... Axis Bank
  const axisDebitMatch = message.match(
    /(?:INR|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+debited[\s\S]*?A\/c\s*no\.\s*(?:XX|\*)*([0-9]{3,4})[\s\S]*?([0-9/.-]{8,10})/i
  );
  if (axisDebitMatch && /Axis\s+Bank/i.test(message)) {
    const amountParsed = parseMoneyString(axisDebitMatch[1]);
    const date = parseIndianDate(axisDebitMatch[3], referenceDate);
    const upiLine = message
      .split(/\r?\n/)
      .find((l) => /^(?:UPI|IMPS)\//i.test(l.trim()));
    let payee = "";
    if (upiLine) {
      const parts = upiLine.trim().split("/");
      if (parts.length >= 4) {
        payee = parts.slice(3).join("/").trim();
      }
    }
    if (!payee) {
      const refMatch = message.match(/\b(?:Ref|UPI|RRN)[:\s]*([0-9]+)\b/i);
      payee = refMatch ? `REF ${refMatch[1]}` : "AXIS DEBIT";
    }
    if (amountParsed && date) {
      return {
        amount: amountParsed.amount,
        date,
        direction: "debit",
        raw_description: cleanPayee(payee),
        account_tail: axisDebitMatch[2],
      };
    }
  }

  // 9. Axis Credit (multi-line) - Example 9
  // INR 2,500.00 credited / A/c no. XX4821 / 18-11-26, 19:40:02 / IMPS/P2A/431212398765/RAHUL SHARMA / Axis Bank
  const axisCreditMatch = message.match(
    /(?:INR|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+credited[\s\S]*?A\/c\s*no\.\s*(?:XX|\*)*([0-9]{3,4})[\s\S]*?([0-9/.-]{8,10})/i
  );
  if (axisCreditMatch && /Axis\s+Bank/i.test(message)) {
    const amountParsed = parseMoneyString(axisCreditMatch[1]);
    const date = parseIndianDate(axisCreditMatch[3], referenceDate);
    const impsLine = message
      .split(/\r?\n/)
      .find((l) => /^(?:UPI|IMPS)\//i.test(l.trim()));
    let payee = "";
    if (impsLine) {
      const parts = impsLine.trim().split("/");
      if (parts.length >= 4) {
        payee = parts.slice(3).join("/").trim();
      }
    }
    if (!payee) {
      const refMatch = message.match(/\b(?:Ref|IMPS|RRN)[:\s]*([0-9]+)\b/i);
      payee = refMatch ? `REF ${refMatch[1]}` : "AXIS CREDIT";
    }
    if (amountParsed && date) {
      return {
        amount: amountParsed.amount,
        date,
        direction: "credit",
        raw_description: cleanPayee(payee),
        account_tail: axisCreditMatch[2],
      };
    }
  }

  // 10. General / Fallback regex for other bank formats (Kotak, PNB, BOB, etc.)
  // Requires explicit bank debit/credit terms (e.g. debited, credited, deposited, withdrawn).
  // Non-bank third-party payment notifications like "Rs.640 paid to KAKA HALWAI via PhonePe"
  // do not match here and cleanly fall through to LLM fallback (Contract Example 11).
  const isDebit = /\b(?:debited|withdrawn)\b/i.test(norm);
  const isCredit = /\b(?:credited|deposited)\b/i.test(norm);

  if (isDebit || isCredit) {
    const dir: Direction = isDebit ? "debit" : "credit";

    // Extract amount: strictly require currency prefix or debit/credit keyword prefix
    // to avoid misinterpreting account numbers (e.g. A/c XX1234 debited) as amount
    const amtMatch =
      norm.match(/(?:INR|Rs\.?|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i) ||
      norm.match(
        /(?:debited\s+by|debited\s+for|credited\s+by|credited\s+with)\s*(?:INR|Rs\.?|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
      );

    const amountParsed = amtMatch ? parseMoneyString(amtMatch[1]) : null;

    // Extract tail
    const tailMatch = norm.match(
      /(?:A\/[cC]|Acct|Card|a\/c|account)[\s\w.:*X-]*?([0-9]{3,4})\b/i
    );
    const tail = tailMatch ? tailMatch[1] : null;

    // Extract date - handles YYYY-MM-DD, DD/MM/YY(YY), DD-MMM-YY(YY), year-less DD MMM (e.g. 12 Nov) & DD/MM
    const dateMatch = norm.match(
      /\b([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{1,2}[-/\s]?[a-zA-Z]{3}(?:[-/\s]?[0-9]{2,4})?|[0-9]{1,2}[/-][0-9]{1,2})\b/
    );
    const date = dateMatch
      ? parseIndianDate(dateMatch[1], referenceDate)
      : null;

    // Extract payee / merchant - strictly avoid capturing "for Rs" or currency as payee!
    let desc = "";

    if (dir === "debit") {
      const toMatch = norm.match(
        /(?:to|at|trf to|vpa|towards|info)\s+([A-Za-z0-9*&@._\s-]+?)(?:\s+(?:on|ref|refno|upi|via|avl|not you|call|bal)\b|\.|$)/i
      );
      if (toMatch) {
        const candidate = toMatch[1].trim();
        // Do not capture currency or amount as payee
        if (!/^(?:Rs\.?|INR|₹|\d)/i.test(candidate)) {
          desc = cleanPayee(candidate);
        }
      }
    } else {
      const fromMatch = norm.match(
        /(?:from|by)\s+([A-Za-z0-9*&@._\s-]+?)(?:\s+(?:on|ref|refno|upi|via|avl|not you|call|bal)\b|\.|$)/i
      );
      if (fromMatch) {
        const candidate = fromMatch[1].trim();
        if (!/^(?:Rs\.?|INR|₹|\d)/i.test(candidate)) {
          desc = cleanPayee(candidate);
        }
      }
    }

    if (amountParsed && date) {
      if (!desc) {
        // Fallback: look for reference number rather than inventing strings
        const refMatch = norm.match(
          /\b(?:ref(?:\s*no)?|upi|rrn)[:\s]*([0-9]{6,16})\b/i
        );
        if (refMatch) {
          desc = `REF ${refMatch[1]}`;
        } else {
          // Use verbatim snippet of message
          desc = norm.slice(0, 40).trim();
        }
      }

      return {
        amount: amountParsed.amount,
        date,
        direction: dir,
        raw_description: desc,
        account_tail: tail,
      };
    }
  }

  return null;
}
