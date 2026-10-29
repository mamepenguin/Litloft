// Usage: node ask.mjs <drive> <query> <outprefix>
import { chromium } from "/Users/libre/Sources/video_share/frontend/node_modules/@playwright/test/index.mjs";
import fs from "node:fs";

const [drive, query, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
let sse = null;
page.on("response", async (r) => {
  if (r.url().includes("/addons/intelligence/ask")) {
    try { sse = await r.text(); } catch (e) { sse = "ERR " + e; }
  }
});
await page.goto(`http://localhost:3000/drive/${encodeURIComponent(drive)}/addons/intelligence`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${out}-0-page.png` });
await page.locator("form textarea").first().fill(query);
await page.screenshot({ path: `${out}-1-typed.png` });
await page.getByTestId("ask-submit").click();
const t0 = Date.now();
try {
  await page.getByTestId("ask-save-note").waitFor({ timeout: 900_000 });
} catch (e) {
  console.log("TIMEOUT waiting for answer", (Date.now() - t0) / 1000);
}
await page.waitForTimeout(1500);
console.log("elapsed_s", (Date.now() - t0) / 1000);
await page.screenshot({ path: `${out}-2-answer.png`, fullPage: true });
const cards = await page.$$eval('[id^="ask-citation-"]', (els) =>
  els.map((el) => ({
    id: el.id,
    href: el.querySelector("a")?.getAttribute("href"),
    text: el.innerText,
  })),
);
fs.writeFileSync(`${out}-cards.json`, JSON.stringify(cards, null, 1));
for (let i = 0; i < 60 && sse === null; i++) await page.waitForTimeout(500);
fs.writeFileSync(`${out}-sse.txt`, sse ?? "");
console.log(JSON.stringify(cards, null, 1));
await browser.close();
