// Headless Chromium check: does new Audio(url) reach loadedmetadata?
// Usage: node scripts/verify_audio.mjs <url> [<url> ...]   -> prints JSON {url: {ok, duration, error}}
import { createRequire } from "module";
import { existsSync } from "fs";
import { execSync } from "child_process";

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require("playwright"); } catch (e) {}
  try {
    const root = execSync("npm root -g").toString().trim();
    return require(root + "/playwright");
  } catch (e) {}
  throw new Error("playwright not found (npm i -g playwright)");
}

const { chromium } = loadPlaywright();
// Prefer real Google Chrome (has AAC); Playwright's bundled open-source Chromium cannot decode AAC.
const exe = process.env.CHROMIUM_PATH;
const opts = { headless: true, args: ["--autoplay-policy=no-user-gesture-required"] };
let browser;
if (exe) browser = await chromium.launch({ ...opts, executablePath: exe });
else { try { browser = await chromium.launch({ ...opts, channel: "chrome" }); } catch (e) { browser = await chromium.launch(opts); } }
const page = await browser.newPage();
await page.setContent("<html><body>verify</body></html>");
const aac = await page.evaluate(() => new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"'));
const out = {};
for (const url of process.argv.slice(2)) {
  if (!aac && /\.(m4a|mp4|aac)$/i.test(url)) { out[url] = { ok: null, error: "no AAC decoder in this browser build (" + browser.version() + ")" }; continue; }
  out[url] = await page.evaluate((u) => new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    const t = setTimeout(() => { a.src = ""; resolve({ ok: false, error: "timeout (no metadata after 45 s)" }); }, 45000);
    a.onloadedmetadata = () => { clearTimeout(t); const d = a.duration; a.src = ""; resolve(d > 1 && isFinite(d) ? { ok: true, duration: d } : { ok: false, duration: d, error: "bad duration" }); };
    a.onerror = () => { clearTimeout(t); resolve({ ok: false, error: "MediaError " + (a.error && a.error.code) }); };
    a.src = u;
  }), url);
}
await browser.close();
console.log(JSON.stringify(out));
