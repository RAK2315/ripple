import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fallbackParseCsv, fallbackParseSms } from "./fallback";

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
