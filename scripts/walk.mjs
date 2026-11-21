// Demo walkthrough: node scripts/walk.mjs <outdir>. Drives local Chrome through the demo path and screenshots each beat.
import { chromium } from "playwright-core";
const out = process.argv[2] ?? ".";
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
// REC=<dir> records a video of the run (rough demo recording)
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(process.env.REC ? { recordVideo: { dir: process.env.REC, size: { width: 1440, height: 900 } } } : {}) });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, fullPage: true });

await page.goto(`${base}/import`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByText("Use demo SMS dump").click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Parse messages" }).click();
await page.getByText("Need review").waitFor({ timeout: 90000 });
await page.waitForFunction(() => !document.body.innerText.includes("Categorizing"), null, { timeout: 120000 });
await shot("1-import");
console.log("import:", (await page.locator("main").innerText()).split(String.fromCharCode(10)).filter((l) => /^\d+$/.test(l.trim())).slice(0, 4).join(" / "), "(parsed / added / categorized / review)");
await page.goto(`${base}/review`);
await page.waitForTimeout(800);
await shot("2-review");
const row = page.locator("div.grid", { hasText: "BHAGWATI TIFFIN" }).first();
await row.locator("select").selectOption("Dining");
await page.getByText("Learn rule & apply to history").waitFor({ timeout: 60000 });
await page.waitForTimeout(300);
await shot("3-rule");
await page.getByText("Learn rule & apply to history").click();
await page.waitForTimeout(600);
await shot("4-after-rule");
await page.goto(`${base}/rules`);
await page.waitForTimeout(600);
await shot("5-rulebook");
await page.goto(`${base}/`);
await page.waitForTimeout(1500);
await shot("6-flow");
await page.waitForTimeout(600);
console.log("invisible salary:", (await page.locator(".figure-hero").first().innerText()).trim(), "| flow regret:", (await page.locator(".figure-hero").nth(1).innerText()).trim());
// B4: NL scenario -> editable fields -> run -> diff vs main
await page.goto(`${base}/scenarios`);
await page.getByLabel("What if sentence").fill("what if rent goes up by 6000 and I cut eating out by a third");
await page.getByRole("button", { name: "Build scenario" }).click();
await page.getByRole("button", { name: "Run scenario" }).waitFor({ timeout: 60000 });
await shot("7-scenario-draft");
await page.getByRole("button", { name: "Run scenario" }).click();
await page.getByTestId("diff-table").waitFor();
await page.waitForTimeout(800);
await shot("8-scenario-diff");
console.log("diff:", (await page.getByTestId("diff-table").innerText()).replace(/\s+/g, " "));
if (process.env.ONLY !== "core") {
  // B5: ghost + regret number
  await page.goto(`${base}/ghost`);
  await page.getByTestId("regret").waitFor();
  await page.waitForTimeout(1200);
  await shot("9-ghost");
  console.log("regret:", await page.getByTestId("regret").innerText());
  // P1: live advice agent
  const gapText = async () => (await page.locator("main").innerText()).match(/gap grows by\s*(₹[\d,]+)/)?.[1];
  const gapBefore = await gapText();
  await page.getByTestId("find-opportunities").click();
  await page.getByText(/new piece|already on this list|No new savings/).waitFor({ timeout: 90000 });
  await page.waitForTimeout(800);
  const rows = await page.getByTestId("advice-row").allInnerTexts();
  const fresh = rows.filter((r) => /\bNew\b/.test(r));
  console.log("live advice:", fresh.length, "new |", fresh.map((r) => r.replace(/\s+/g, " ").slice(0, 150)).join(" || "));
  console.log("regret after generate:", (await page.getByTestId("regret").innerText()).trim(), "| gap/month", gapBefore, "->", await gapText());
  await shot("9b-ghost-live-advice");
  if (fresh.length) {
    await page.getByTestId("advice-row").filter({ hasText: "New" }).first().getByRole("button", { name: "Accept" }).click();
    await page.waitForTimeout(800);
    console.log("after accepting one live advice: gap/month", await gapText());
  }
  // B6: subscriptions, graveyard, changed alert, shift re-plan
  await page.goto(`${base}/subscriptions`);
  await page.getByTestId("graveyard").waitFor();
  await page.waitForTimeout(4000); // explain line from the model
  const shift = page.getByTestId("shift").first();
  if (await shift.count()) await shift.getByRole("button", { name: "Re-plan" }).click();
  await page.waitForTimeout(300);
  await shot("10-subscriptions");
  console.log("graveyard:", (await page.getByTestId("graveyard").innerText()).split(String.fromCharCode(10)).slice(0, 2).join(" "));
  console.log("changed:", (await page.getByTestId("changed-alert").first().innerText()).replace(/\s+/g, " "));
  // B7: goals, monthly review narrative, coach refusal
  await page.goto(`${base}/goals`);
  await page.getByTestId("goal-row").first().waitFor();
  await shot("11-goals");
  await page.goto(`${base}/report`);
  await page.getByTestId("narrative").waitFor();
  await page.waitForFunction(() => !document.body.innerText.includes("Writing the narrative"), null, { timeout: 60000 });
  await shot("12-report");
  console.log("narrative:", (await page.getByTestId("narrative").innerText()).replace(/\s+/g, " ").slice(0, 400));
  await page.getByRole("button", { name: "Ask RIPPLE" }).click();
  await page.getByLabel("Ask the coach").fill("which mutual fund should I buy");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByTestId("coach-turn").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  await shot("13-refusal");
  console.log("coach:", (await page.getByTestId("coach-turn").first().innerText()).replace(/\s+/g, " "));
  await page.keyboard.press("Escape");
  await page.goto(`${base}/import`);
  // B8: text-layer PDF (Oct statement overlaps the SMS: duplicates are reported, not merged), UPI without vision, what the AI sees
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles("public/demo/statement-oct.pdf");
  await page.getByText("Added").waitFor({ timeout: 120000 });
  await page.waitForTimeout(500);
  await shot("14-pdf");
  console.log("pdf:", (await page.locator("main").innerText()).match(/Added[\s\S]{0,80}/)?.[0].replace(/\s+/g, " "));
  await page.getByRole("button", { name: "UPI screenshot", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(`${out}/9-ghost.png`);
  await page.getByText("vision model, which this deployment").waitFor({ timeout: 30000 });
  console.log("upi: clear no-vision message shown");
  await page.getByText("What the AI sees").click();
  await page.waitForTimeout(500);
  await shot("15-ai-sees");
  // Excel: Paytm passbook (auto-detected) and an unreadable header (mapping UI)
  await page.keyboard.press("Escape");
  await page.goto(`${base}/import`);
  await page.getByRole("button", { name: "CSV / Excel", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles("src/lib/ingest/__fixtures__/paytm-sample.xlsx");
  await page.getByText("Read from sheet").waitFor({ timeout: 60000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Categorizing"), null, { timeout: 120000 });
  await shot("16-excel");
  const mainText = await page.locator("main").innerText();
  console.log("excel:", mainText.includes("Read from sheet") ? mainText.split(String.fromCharCode(10)).filter((l) => /Read from|could not be parsed|duplicates/.test(l)).join(" / ") : "no summary");
  await page.locator('input[type="file"]').setInputFiles("src/lib/ingest/__fixtures__/unmapped-sample.xlsx");
  await page.getByTestId("excel-mapping").waitFor({ timeout: 30000 });
  const selects = page.getByTestId("excel-mapping").locator("select");
  await selects.nth(1).selectOption({ label: "When" });
  await selects.nth(2).selectOption({ label: "What" });
  await selects.nth(4).selectOption({ label: "How much" });
  await shot("17-excel-mapping");
  await page.getByRole("button", { name: "Import with this mapping" }).click();
  await page.getByText("columns mapped by you").waitFor({ timeout: 30000 });
  console.log("excel mapping: imported");
  await page.getByText("What the AI sees").click();
  await page.waitForTimeout(500);
  const seen = await page.locator("pre").allInnerTexts();
  const all = seen.join(" ");
  console.log("ai sees masked name:", all.includes("Money sent to [NAME]"), "| leaks Karan:", all.includes("Karan"), "| leaks 3014:", all.includes("3014"));
  // later blocks append here
}
console.log("errors:", errors.length ? errors.join("\n") : "none");
await context.close();
await browser.close();
