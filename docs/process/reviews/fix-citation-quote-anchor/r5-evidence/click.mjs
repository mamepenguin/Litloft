// Usage: node click.mjs <drive> <query> <citationIndex> <outprefix>
// Asks, screenshots the answer, opens the save dialog (no save), then clicks citation N.
import { chromium } from "/Users/libre/Sources/video_share/frontend/node_modules/@playwright/test/index.mjs";

const [drive, query, idx, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await page.goto(`http://localhost:3000/drive/${encodeURIComponent(drive)}/addons/intelligence`, { waitUntil: "networkidle" });
await page.locator("form textarea").first().fill(query);
await page.getByTestId("ask-submit").click();
await page.getByTestId("ask-save-note").waitFor({ timeout: 500_000 });
await page.waitForTimeout(1000);
const card = page.locator(`#ask-citation-${idx}`);
await card.scrollIntoViewIfNeeded();
await card.screenshot({ path: `${out}-card.png` });
console.log("CARD", await card.innerText());
await page.getByTestId("ask-save-note").click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-savedialog.png`, fullPage: true });
const dlg = page.locator('[role="dialog"]');
if (await dlg.count()) {
  const vals = await dlg.locator("textarea, input").evaluateAll((els) => els.map((e) => e.value));
  console.log("DIALOG_FIELDS", JSON.stringify(vals).slice(0, 3000));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}
const href = await card.locator("a").first().getAttribute("href");
console.log("HREF", decodeURIComponent(href).slice(0, 200));
await card.locator("a").first().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(4000);
console.log("URL", decodeURIComponent(page.url()).slice(0, 200));
await page.screenshot({ path: `${out}-file.png` });
const marks = await page.$$eval("mark", (ms) => ms.map((m) => m.innerText.slice(0, 80)));
console.log("MARKS", JSON.stringify(marks.slice(0, 5)));
const vid = await page.$$eval("video", (vs) => vs.map((v) => v.currentTime));
console.log("VIDEO_TIME", JSON.stringify(vid));
await browser.close();
