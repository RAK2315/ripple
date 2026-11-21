import type {
  ParseSmsOptions,
  ParseResult,
  Transaction,
  UnparsedRow,
} from "../contract/types";
import { getTodayIst } from "./dates";
import { isNonTransaction, matchSmsPattern } from "./sms-patterns";

interface PendingParsed {
  index: number;
  date: string;
  amount: number;
  direction: "debit" | "credit";
  raw_description: string;
  account_tail: string | null;
  source_line: string;
  viaLlm: boolean;
}

export async function parseSms(
  text: string,
  opts?: ParseSmsOptions
): Promise<ParseResult> {
  const sourceFile = opts?.sourceFile ?? "sms-paste";
  const referenceDate = opts?.referenceDate ?? getTodayIst();

  try {
    if (!text || text.trim() === "") {
      return {
        transactions: [],
        unparsed: [],
        stats: {
          total_inputs: 0,
          parsed: 0,
          unparsed: 0,
          via_llm: 0,
        },
      };
    }

    // Splitting rule:
    // If text contains a blank line, each blank-line-separated block is one message;
    // otherwise each non-empty line is one message.
    let rawBlocks: string[];
    if (/\r?\n\s*\r?\n/.test(text)) {
      rawBlocks = text.split(/\r?\n\s*\r?\n+/);
    } else {
      const trimmed = text.trim();
      if (
        isNonTransaction(trimmed) ||
        matchSmsPattern(trimmed, referenceDate)
      ) {
        rawBlocks = [trimmed];
      } else {
        rawBlocks = text.split(/\r?\n/);
      }
    }

    const messages = rawBlocks
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    const pendingParsed: PendingParsed[] = [];
    const unparsed: UnparsedRow[] = [];
    const unmatched: Array<{ index: number; raw: string }> = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const index = i + 1; // 1-based message number in split order

      // 1. Detect non-transactions before pattern matching
      if (isNonTransaction(msg)) {
        unparsed.push({
          index,
          raw: msg,
          reason: "not_a_transaction",
        });
        continue;
      }

      // 2. Try bank regex patterns
      const matched = matchSmsPattern(msg, referenceDate);
      if (matched) {
        pendingParsed.push({
          index,
          date: matched.date,
          amount: matched.amount,
          direction: matched.direction,
          raw_description: matched.raw_description,
          account_tail: matched.account_tail,
          source_line: msg,
          viaLlm: false,
        });
      } else {
        // Collect for potential LLM fallback
        unmatched.push({ index, raw: msg });
      }
    }

    // 3. LLM Fallback for unmatched messages
    let viaLlmCount = 0;
    if (unmatched.length > 0) {
      if (opts?.llmFallback) {
        try {
          const llmResults = await opts.llmFallback(unmatched.map((u) => u.raw));
          for (let k = 0; k < unmatched.length; k++) {
            const item = unmatched[k];
            const row = llmResults ? llmResults[k] : null;

            if (!row) {
              unparsed.push({
                index: item.index,
                raw: item.raw,
                reason: "llm_failed",
              });
            } else if (!row.is_transaction) {
              unparsed.push({
                index: item.index,
                raw: item.raw,
                reason: "not_a_transaction",
              });
            } else if (!row.date) {
              unparsed.push({
                index: item.index,
                raw: item.raw,
                reason: "no_date",
              });
            } else if (row.amount == null || row.amount <= 0) {
              unparsed.push({
                index: item.index,
                raw: item.raw,
                reason: "no_amount",
              });
            } else {
              viaLlmCount++;
              let desc = row.merchant;
              if (!desc) {
                const refMatch = item.raw.match(
                  /\b(?:ref(?:\s*no)?|upi|rrn)[:\s]*([0-9]{6,16})\b/i
                );
                desc = refMatch ? `REF ${refMatch[1]}` : item.raw.slice(0, 40).trim();
              }
              pendingParsed.push({
                index: item.index,
                date: row.date,
                amount: Math.round(row.amount),
                direction: row.direction || "debit",
                raw_description: desc,
                account_tail: row.account_tail,
                source_line: item.raw,
                viaLlm: true,
              });
            }
          }
        } catch (err) {
          // If the fallback throws, every message sent to it becomes llm_failed
          for (const item of unmatched) {
            unparsed.push({
              index: item.index,
              raw: item.raw,
              reason: "llm_failed",
              detail: String(err),
            });
          }
        }
      } else {
        for (const item of unmatched) {
          unparsed.push({
            index: item.index,
            raw: item.raw,
            reason: "no_pattern",
          });
        }
      }
    }

    // Sort pending parsed by their original input order
    pendingParsed.sort((a, b) => a.index - b.index);
    unparsed.sort((a, b) => a.index - b.index);

    const transactions: Transaction[] = pendingParsed.map((p, idx) => ({
      id: `sms_${String(idx + 1).padStart(4, "0")}`,
      date: p.date,
      amount: p.amount,
      direction: p.direction,
      raw_description: p.raw_description.replace(/\s+/g, " ").trim(),
      account_tail: p.account_tail,
      source_kind: "sms",
      source_file: sourceFile,
      source_line: p.source_line,
      merchant_normalized: null,
      category: null,
      category_source: null,
      confidence: null,
    }));

    return {
      transactions,
      unparsed,
      stats: {
        total_inputs: messages.length,
        parsed: transactions.length,
        unparsed: unparsed.length,
        via_llm: viaLlmCount,
      },
    };
  } catch (err) {
    // Pure, NEVER throws: return input as unparsed
    return {
      transactions: [],
      unparsed: [
        {
          index: 1,
          raw: text,
          reason: "no_pattern",
          detail: String(err),
        },
      ],
      stats: {
        total_inputs: 1,
        parsed: 0,
        unparsed: 1,
        via_llm: 0,
      },
    };
  }
}
