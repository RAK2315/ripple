import type {
  ParseCsvOptions,
  ParseResult,
  Transaction,
  UnparsedRow,
  Direction,
} from "../contract/types";
import { parseIndianDate } from "./dates";
import { parseMoneyString } from "./money";

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let inQuotes = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

interface ColumnMap {
  dateCol: number;
  descCol: number;
  debitCol: number;
  creditCol: number;
  amountCol: number;
  typeCol: number;
}

function detectColumns(headers: string[]): ColumnMap | null {
  const norm = headers.map((h) =>
    h.toLowerCase().replace(/[^a-z0-9/ ]/g, "").trim()
  );

  let dateCol = -1;
  let descCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let amountCol = -1;
  let typeCol = -1;

  // 1. Detect Date column (prefer txn date / transaction date over value date)
  for (let i = 0; i < norm.length; i++) {
    const h = norm[i];
    if (h.includes("txn date") || h.includes("transaction date")) {
      dateCol = i;
      break;
    }
  }
  if (dateCol === -1) {
    for (let i = 0; i < norm.length; i++) {
      const h = norm[i];
      if (h === "date" || h.startsWith("date ") || h.endsWith(" date")) {
        dateCol = i;
        break;
      }
    }
  }
  if (dateCol === -1) {
    for (let i = 0; i < norm.length; i++) {
      if (norm[i].includes("value date")) {
        dateCol = i;
        break;
      }
    }
  }

  // 2. Detect Narration / Description column
  for (let i = 0; i < norm.length; i++) {
    const h = norm[i];
    if (
      h.includes("narration") ||
      h.includes("description") ||
      h.includes("particulars") ||
      h.includes("remarks") ||
      h.includes("details")
    ) {
      descCol = i;
      break;
    }
  }

  // 3. Detect Amount columns
  // Separate debit and credit columns
  for (let i = 0; i < norm.length; i++) {
    const h = norm[i];
    if (h.includes("balance") || h.includes("closing")) continue;

    if (
      h.includes("withdrawal") ||
      h.includes("debit") ||
      h === "dr" ||
      h.startsWith("dr ") ||
      h.endsWith(" dr")
    ) {
      debitCol = i;
    } else if (
      h.includes("deposit") ||
      h.includes("credit") ||
      h === "cr" ||
      h.startsWith("cr ") ||
      h.endsWith(" cr")
    ) {
      creditCol = i;
    }
  }

  // Single amount column
  if (debitCol === -1 && creditCol === -1) {
    for (let i = 0; i < norm.length; i++) {
      const h = norm[i];
      if (h.includes("balance") || h.includes("closing")) continue;
      if (
        h === "amount" ||
        h.includes("txn amount") ||
        h.includes("transaction amount") ||
        h.includes("net amount")
      ) {
        amountCol = i;
        break;
      }
    }
  }

  // Dr / Cr type indicator column
  for (let i = 0; i < norm.length; i++) {
    const h = norm[i];
    if (
      h === "type" ||
      h === "dr/cr" ||
      h === "cr/dr" ||
      h === "dr / cr" ||
      h === "cr / dr" ||
      h === "txn type"
    ) {
      typeCol = i;
      break;
    }
  }

  const hasAmount =
    (debitCol !== -1 || creditCol !== -1) || amountCol !== -1;

  if (dateCol !== -1 && (descCol !== -1 || hasAmount)) {
    return { dateCol, descCol, debitCol, creditCol, amountCol, typeCol };
  }

  return null;
}

export function parseCsv(text: string, opts?: ParseCsvOptions): ParseResult {
  const sourceFile = opts?.sourceFile ?? "upload.csv";

  try {
    const lines = text.split(/\r?\n/);

    // Scan the first 30 lines for the header row
    const scanLimit = Math.min(30, lines.length);
    let headerLineIdx = -1;
    let colMap: ColumnMap | null = null;
    let detectedAccountTail: string | null = null;

    for (let i = 0; i < scanLimit; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Check for account tail in header block (e.g. Account No : XXXXXXXX4821)
      const acctMatch = line.match(
        /(?:account\s*no|a\/c\s*no|account\s*number|acct\s*no)[\s:.\-_]*[X*]*(\d{3,4})\b/i
      );
      if (acctMatch && !detectedAccountTail) {
        detectedAccountTail = acctMatch[1];
      }

      const cells = parseCsvLine(lines[i]);
      const detected = detectColumns(cells);
      if (detected) {
        headerLineIdx = i;
        colMap = detected;
        break;
      }

      // Check if this row looks like header because the NEXT non-empty row parses as a date in some column
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine) {
          const nextCells = parseCsvLine(lines[i + 1]);
          for (let c = 0; c < nextCells.length; c++) {
            if (parseIndianDate(nextCells[c])) {
              // This row might be the header row
              const possibleMap = detectColumns(cells);
              if (possibleMap) {
                headerLineIdx = i;
                colMap = possibleMap;
                break;
              }
            }
          }
          if (headerLineIdx !== -1) break;
        }
      }
    }

    if (headerLineIdx === -1 || !colMap) {
      return {
        transactions: [],
        unparsed: [
          {
            index: 1,
            raw: text,
            reason: "header_undetected",
            detail: "No header row detected in the first 30 lines",
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

    const transactions: Transaction[] = [];
    const unparsed: UnparsedRow[] = [];
    let totalInputs = 0;

    for (let i = headerLineIdx + 1; i < lines.length; i++) {
      const rawLine = lines[i];
      // Blank lines are skipped and not counted
      if (rawLine.trim() === "") {
        continue;
      }

      totalInputs++;
      const lineNum = i + 1; // 1-based line number in file

      // Check for row with only separators
      const cells = parseCsvLine(rawLine);
      const nonWhitespaceCells = cells.filter((c) => c.trim().length > 0);
      if (nonWhitespaceCells.length === 0) {
        unparsed.push({
          index: lineNum,
          raw: rawLine,
          reason: "empty",
        });
        continue;
      }

      // Check for footer lines like *** End of statement ***
      if (
        /^\s*\*\*\*|end of statement|total\s*(?:credits?|debits?|balance)?\s*[:=]|closing balance\s*[:=]/i.test(
          rawLine
        )
      ) {
        unparsed.push({
          index: lineNum,
          raw: rawLine,
          reason: "not_a_transaction",
        });
        continue;
      }

      // 1. Date extraction
      const dateCell = colMap.dateCol >= 0 ? cells[colMap.dateCol] : undefined;
      if (!dateCell || dateCell.trim() === "") {
        unparsed.push({
          index: lineNum,
          raw: rawLine,
          reason: "no_date",
        });
        continue;
      }

      const date = parseIndianDate(dateCell);
      if (!date) {
        unparsed.push({
          index: lineNum,
          raw: rawLine,
          reason: "bad_date",
          detail: `Could not parse date: ${dateCell}`,
        });
        continue;
      }

      // 2. Amount and Direction extraction
      let amount: number | null = null;
      let direction: Direction = "debit";

      if (colMap.debitCol >= 0 || colMap.creditCol >= 0) {
        // Separate columns
        const debitRaw =
          colMap.debitCol >= 0 ? cells[colMap.debitCol] : "";
        const creditRaw =
          colMap.creditCol >= 0 ? cells[colMap.creditCol] : "";

        const debitParsed = parseMoneyString(debitRaw);
        const creditParsed = parseMoneyString(creditRaw);

        if (debitParsed && debitParsed.amount > 0) {
          amount = debitParsed.amount;
          direction = "debit";
        } else if (creditParsed && creditParsed.amount > 0) {
          amount = creditParsed.amount;
          direction = "credit";
        } else {
          // Both are empty or 0
          if (!debitRaw.trim() && !creditRaw.trim()) {
            unparsed.push({
              index: lineNum,
              raw: rawLine,
              reason: "no_amount",
            });
          } else {
            unparsed.push({
              index: lineNum,
              raw: rawLine,
              reason: "bad_amount",
              detail: `Unparseable amounts debit="${debitRaw}", credit="${creditRaw}"`,
            });
          }
          continue;
        }
      } else if (colMap.amountCol >= 0) {
        // Single amount column
        const amountRaw = cells[colMap.amountCol] ?? "";
        if (!amountRaw.trim()) {
          unparsed.push({
            index: lineNum,
            raw: rawLine,
            reason: "no_amount",
          });
          continue;
        }

        const parsed = parseMoneyString(amountRaw);
        if (!parsed || parsed.amount <= 0) {
          unparsed.push({
            index: lineNum,
            raw: rawLine,
            reason: "bad_amount",
            detail: `Unparseable amount "${amountRaw}"`,
          });
          continue;
        }

        amount = parsed.amount;

        // Determine direction:
        // Negative or Dr suffix => debit; positive or Cr suffix => credit.
        if (parsed.direction) {
          direction = parsed.direction;
        } else if (colMap.typeCol >= 0) {
          const typeVal = (cells[colMap.typeCol] ?? "").toLowerCase();
          if (typeVal.includes("dr") || typeVal.includes("debit")) {
            direction = "debit";
          } else if (typeVal.includes("cr") || typeVal.includes("credit")) {
            direction = "credit";
          } else {
            direction = "credit"; // positive default
          }
        } else {
          // If no sign or Dr/Cr indicator, standard signed column rule: positive => credit
          direction = "credit";
        }
      } else {
        unparsed.push({
          index: lineNum,
          raw: rawLine,
          reason: "no_amount",
        });
        continue;
      }

      // 3. Narration extraction
      const descRaw = colMap.descCol >= 0 ? cells[colMap.descCol] ?? "" : "";
      const rawDescription = descRaw.replace(/\s+/g, " ").trim();
      const finalDescription = rawDescription || "TRANSACTION";

      const txId = `csv_${String(transactions.length + 1).padStart(4, "0")}`;

      transactions.push({
        id: txId,
        date,
        amount,
        direction,
        raw_description: finalDescription,
        account_tail: detectedAccountTail,
        source_kind: "csv",
        source_file: sourceFile,
        source_line: rawLine,
        merchant_normalized: null,
        category: null,
        category_source: null,
        confidence: null,
      });
    }

    return {
      transactions,
      unparsed,
      stats: {
        total_inputs: totalInputs,
        parsed: transactions.length,
        unparsed: unparsed.length,
        via_llm: 0,
      },
    };
  } catch (err) {
    // Pure, NEVER throws: return everything as unparsed
    return {
      transactions: [],
      unparsed: [
        {
          index: 1,
          raw: text,
          reason: "header_undetected",
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
