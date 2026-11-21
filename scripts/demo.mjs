// Paced demo recording following spec §7 (about 90-110 s of footage).
// BASE=<url> node scripts/demo.mjs <video-dir>
import { chromium } from "playwright-core";
const dir = process.argv[2] ?? ".";
const base = process.env.BASE ?? "https://ripple-psi-gold.vercel.app";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir, size: { width: 1440, height: 900 } } });
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// warm the model cache off-camera would hide the real latency; we record from a clean profile instead
await page.goto(`${base}/import`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await pause(1200);

// 0:00 paste SMS dump
await page.getByText("Use demo SMS dump").click();
await pause(1500);
await page.getByRole("button", { name: "Parse messages" }).click();
await page.getByText("Need review").waitFor({ timeout: 90000 });
await page.waitForFunction(() => !document.body.innerText.includes("Categorizing"), null, { timeout: 120000 });
await pause(2500);

// 0:10 fix one category → rule → 14 rows
await page.getByRole("link", { name: /Review \d+ uncertain/ }).click().catch(() => page.goto(`${base}/review`));
await page.waitForURL(/review/);
await pause(2000);
const row = page.locator("div.grid", { hasText: "BHAGWATI TIFFIN" }).first();
await row.scrollIntoViewIfNeeded();
await pause(800);
await row.locator("select").selectOption("Dining");
await page.getByText("Learn rule & apply to history").waitFor({ timeout: 60000 });
await pause(3500);
await page.getByText("Learn rule & apply to history").click();
await pause(3000);
await page.getByRole("link", { name: "Rulebook" }).click();
await pause(3000);

// 0:25 Flow: invisible salary, scrubber into the future, cone, bike marker
await page.getByRole("link", { name: "Flow" }).click();
await pause(3500);
await page.mouse.wheel(0, 900);
await pause(1500);
const slider = page.getByLabel("Timeline scrubber");
const max = +(await slider.getAttribute("max"));
const start = +(await slider.inputValue());
for (let v = start; v <= Math.min(max, start + 14); v++) {
  await slider.fill(String(v));
  await pause(220);
}
await pause(2000);
await page.mouse.wheel(0, -900);
await pause(1000);

// 0:45 natural-language scenario → diff
await page.getByRole("link", { name: "Scenarios" }).click();
await pause(1200);
await page.getByLabel("What if sentence").pressSequentially("what if rent goes up by 6000 and I cut eating out by a third", { delay: 35 });
await pause(600);
await page.getByRole("button", { name: "Build scenario" }).click();
await page.getByRole("button", { name: "Run scenario" }).waitFor({ timeout: 60000 });
await pause(3000);
await page.getByRole("button", { name: "Run scenario" }).click();
await page.getByTestId("diff-table").waitFor();
await pause(5000);
await page.mouse.wheel(0, 700);
await pause(3000);

// 1:05 Ghost
await page.getByRole("link", { name: "Ghost" }).click();
await page.getByTestId("regret").waitFor();
await pause(6000);

// 1:20 refusal
await page.getByRole("button", { name: "Ask RIPPLE" }).click();
await pause(800);
await page.getByLabel("Ask the coach").pressSequentially("Which mutual fund should I buy for my bike?", { delay: 35 });
await page.getByRole("button", { name: "Ask", exact: true }).click();
await page.getByTestId("coach-turn").first().waitFor({ timeout: 60000 });
await pause(7000);

await context.close();
await browser.close();
console.log("errors:", errors.length ? errors.join("\n") : "none");
