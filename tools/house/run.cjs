// Drives the house in a real headless browser, with real pointer, keyboard and touch input.
//
//   npm install --no-save playwright-core        (once; it is not a project dependency)
//   npm run dev                                   (in another terminal: http://localhost:4173)
//   node tools/house/run.cjs tools/house/lessons.cjs
//
// A scenario exports async ({ page, shot, wait, boot, context, logs }) => {…}. It reports what it
// observes; screenshots go to artifacts/house/. Console errors from the page are printed at the end
// and a thrown error fails the run.
//
// Environment:
//   AURA_URL            where the house is served (default http://localhost:4173/)
//   AURA_CHROMIUM_PATH  the browser to launch (default: an installed Chrome or Edge)
//   SIZE=390x844        viewport (default 1440x810)
//   TOUCH=1             answer as a phone does: coarse pointer, no hover, touch points
//   NOGL=1              no WebGL at all, to exercise the fallback
//   Q=low|medium|high|ultra   start in a fixed graphics preset instead of AUTO
const fs = require("fs");
const path = require("path");

function playwright() {
  for (const name of ["playwright-core", "playwright"]) {
    try { return require(name); } catch {}
  }
  console.error("Install the browser driver first: npm install --no-save playwright-core");
  process.exit(2);
}
function browserPath() {
  const candidates = [process.env.AURA_CHROMIUM_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((p) => p && fs.existsSync(p));
}

(async () => {
  const scenario = process.argv[2];
  if (!scenario) { console.error("Usage: node tools/house/run.cjs <scenario.cjs>"); process.exit(2); }
  const { chromium } = playwright();
  // The GPU is asked for explicitly: headless Chrome otherwise renders WebGL in software, which measures nothing.
  const gl = process.env.NOGL ? ["--disable-gpu", "--disable-3d-apis"] : ["--enable-gpu", "--ignore-gpu-blocklist", ...(process.platform === "win32" ? ["--use-angle=d3d11"] : [])];
  const browser = await chromium.launch({ executablePath: browserPath(), headless: true, args: [...gl, "--autoplay-policy=no-user-gesture-required"] });
  const size = process.env.SIZE ? process.env.SIZE.split("x").map(Number) : [1440, 810];
  const context = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1, hasTouch: !!process.env.TOUCH, isMobile: !!process.env.TOUCH });
  if (process.env.TOUCH) {
    // Headless desktop Chrome keeps reporting a mouse. The house asks only through matchMedia and maxTouchPoints, so answer as a phone does.
    await context.addInitScript(() => {
      const real = window.matchMedia.bind(window), answers = { "(any-pointer: coarse)": true, "(any-pointer: fine)": false, "(pointer: coarse)": true, "(pointer: fine)": false, "(hover: none)": true, "(hover: hover)": false, "(any-hover: hover)": false };
      window.matchMedia = (q) => { const m = real(q); if (!(q in answers)) return m; return new Proxy(m, { get: (t, k) => (k === "matches" ? answers[q] : typeof t[k] === "function" ? t[k].bind(t) : t[k]) }); };
      Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 });
    });
  }
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push("[" + m.type() + "] " + m.text().slice(0, 500)); });
  page.on("pageerror", (e) => logs.push("[pageerror] " + String(e.stack || e).slice(0, 900)));
  page.on("requestfailed", (r) => logs.push("[requestfailed] " + r.url()));
  const shots = path.resolve(__dirname, "../../artifacts/house");
  fs.mkdirSync(shots, { recursive: true });
  const shot = (name) => page.screenshot({ path: path.join(shots, name + ".jpg"), type: "jpeg", quality: 80 });
  const wait = (ms) => page.waitForTimeout(ms);
  // Loads the house, marks the first-visit welcome as seen, skips the arrival and waits for the furniture.
  const boot = async ({ storage = {}, skip = true, settle = 3500 } = {}) => {
    const all = { "aura-first-run": "done", ...(process.env.Q ? { "aura-house-quality": process.env.Q } : {}), ...storage };
    await page.addInitScript((items) => { try { if (!sessionStorage.getItem("seeded")) { for (const [k, v] of Object.entries(items)) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } sessionStorage.setItem("seeded", "1"); } } catch {} }, all);
    await page.goto(process.env.AURA_URL || "http://localhost:4173/", { waitUntil: "load" });
    await page.waitForFunction(() => window.aura && (window.aura.house || document.querySelector("#houseFallback:not([hidden])")), null, { timeout: 30000 });
    if (!skip) return;
    await wait(800);
    if (await page.locator("#skipArrival").isVisible().catch(() => false)) await page.click("#skipArrival");
    await page.evaluate(() => window.aura.house?.modelsReady).catch(() => {});
    await wait(settle);
  };
  let failed = false;
  try {
    await require(path.resolve(scenario))({ page, shot, wait, boot, context, logs });
  } catch (e) {
    failed = true;
    logs.push("[scenario] " + (e.stack || e));
  }
  console.log("--- console ---\n" + (logs.length ? logs.join("\n") : "no console errors"));
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
