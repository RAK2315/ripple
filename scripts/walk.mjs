// Demo walkthrough: node scripts/walk.mjs <outdir>. Drives local Chrome through the demo path and screenshots each beat.
import { chromium } from "playwright-core";
const out = process.argv[2] ?? ".";
const base = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
  // later blocks append here
}
console.log("errors:", errors.length ? errors.join("\n") : "none");
await browser.close();
