// Optional regression runner: npm install --no-save playwright; start npm start in another terminal.
// AURA_CHROMIUM_PATH can point to a Chromium executable; otherwise install with npx playwright install chromium.
const { chromium } = require("playwright");
const assert = require("assert/strict");
const fs = require("fs");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.AURA_CHROMIUM_PATH || undefined,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3000/dist/index.html");
  await page.waitForFunction(() => window.aura?.house);
  await page.click("#skipArrival");
  assert.ok(await page.evaluate(() => !aura.engine.ctx));
  console.log("Silent arrival: PASS");
  await page.keyboard.press("Digit3");
  await page
    .waitForFunction(
      () => aura.house.currentRoom === "instrument" && !aura.house.journey,
      null,
      { timeout: 30000 },
    )
    .catch(async (e) => {
      console.log(
        "NAV FAILED",
        await page.evaluate(() => ({
          mode: aura.house.mode,
          room: aura.house.currentRoom,
          journey: aura.house.journey,
          position: aura.house.camera.position.toArray(),
          hidden: document.hidden,
        })),
      );
      throw e;
    });
  assert.ok(
    await page.evaluate(() =>
      aura.house.architecture.canWalk(
        aura.house.camera.position.x,
        aura.house.camera.position.z,
      ),
    ),
  );
  await page.click("#roomWorkButton");
  assert.ok(await page.locator("#piano").isVisible());
  let box = await page.locator("#piano").boundingBox(),
    before = await page.evaluate(
      () => aura.store.project.tracks[0].clips[0].notes.length,
    );
  await page.mouse.dblclick(box.x + 190, box.y + 320);
  assert.equal(
    await page.evaluate(
      () => aura.store.project.tracks[0].clips[0].notes.length,
    ),
    before + 1,
  );
  await page.keyboard.press("Control+z");
  assert.equal(
    await page.evaluate(
      () => aura.store.project.tracks[0].clips[0].notes.length,
    ),
    before,
  );
  await page.keyboard.press("Control+Shift+z");
  assert.equal(
    await page.evaluate(
      () => aura.store.project.tracks[0].clips[0].notes.length,
    ),
    before + 1,
  );
  await page.click("#returnHouse");
  // A real architectural key raycasts to the shared synth engine.
  await page.evaluate(() => {
    aura.testAuditions = [];
    const original = aura.engine.audition.bind(aura.engine);
    aura.engine.audition = (t, p) => {
      aura.testAuditions.push(p);
      return original(t, p);
    };
  });
  const key = await page.evaluate(() => {
    const h = aura.house,
      o = h.architecture.interactive.find(
        (o) =>
          o.userData.action.type === "note" && o.userData.action.pitch === 72,
      );
    o.updateWorldMatrix(true, false);
    const p = o.position.clone();
    o.getWorldPosition(p);
    p.project(h.camera);
    return {
      x: ((p.x + 1) / 2) * innerWidth,
      y: ((1 - p.y) / 2) * innerHeight,
    };
  });
  await page.mouse.click(key.x, key.y);
  console.log(
    "PHYSICAL PIANO",
    await page.evaluate(() => ({
      auditions: aura.testAuditions,
      target: aura.house.target?.userData.action,
    })),
  );
  assert.ok(await page.evaluate(() => aura.testAuditions.length > 0));
  assert.equal(await page.evaluate(() => aura.engine.ctx.state), "running");
  console.log("Navigation, real piano raycast, precise MIDI and history: PASS");
  await page.keyboard.press("Digit4");
  await page.waitForFunction(
    () => aura.house.currentRoom === "rhythm" && !aura.house.journey,
  );
  await page.click("#roomWorkButton");
  const n0 = await page.evaluate(
    () =>
      aura.store.project.tracks.find((t) => t.instrument === "drums").clips[0]
        .notes.length,
  );
  await page.click('[data-step="1"][data-pitch="36"]');
  assert.equal(
    await page.evaluate(
      () =>
        aura.store.project.tracks.find((t) => t.instrument === "drums").clips[0]
          .notes.length,
    ),
    n0 + 1,
  );
  await page.click("#returnHouse");
  await page.click("#housePlay");
  await page.waitForTimeout(700);
  assert.ok(await page.evaluate(() => aura.engine.metrics().peak > 0));
  const ctxTime = await page.evaluate(() => aura.engine.origin);
  await page.keyboard.press("Digit7");
  await page.waitForFunction(
    () => aura.house.currentRoom === "living" && !aura.house.journey,
  );
  assert.equal(await page.evaluate(() => aura.engine.origin), ctxTime);
  assert.ok(
    await page.evaluate(() =>
      [...aura.engine.metrics().tracks.values()].some((t) => t.centroid > 0),
    ),
  );
  await page.click("#roomWorkButton");
  await page.screenshot({ path: __dirname + "/../docs/AURA-mixer.png" });
  await page.click("#returnHouse");
  await page.click("#houseStop");
  console.log(
    "Rhythm edits, mix meters and uninterrupted navigation audio: PASS",
  );
  await page.evaluate(() => aura.house.goRoom("arrange", true));
  await page.click("#roomWorkButton");
  assert.ok(await page.locator("#timeline").isVisible());
  await page.click("#duplicate");
  await page.click("#returnHouse");
  await page.evaluate(() => aura.house.openMemory());
  await page.fill("#memoryName", "Journey checkpoint");
  await page.click("#keepMemory");
  await page.waitForFunction(() => aura.house.memories.length === 1);
  const bpm = await page.evaluate(() => aura.store.project.bpm);
  await page.evaluate(() =>
    aura.store.commit("Change tempo", (p) => (p.bpm = 123)),
  );
  await page.click(".memoryVersion");
  await page.waitForFunction((bpm) => aura.store.project.bpm === bpm, bpm);
  console.log("Arrangement and actual checkpoint restoration: PASS");
  await page.evaluate(() => {
    aura.house.goRoom("record", true);
    aura.house.openTool("record");
  });
  await page.click("#beginRecording");
  await page.waitForFunction(() => aura.recording.active);
  await page.waitForTimeout(1400);
  assert.ok(await page.locator("#recordIndicator").isVisible());
  const tracks = await page.evaluate(() => aura.store.project.tracks.length);
  await page.click("#stopRecording");
  await page.waitForFunction(
    (tracks) => aura.store.project.tracks.length === tracks + 1,
    tracks,
    { timeout: 30000 },
  );
  assert.ok(await page.evaluate(() => aura.engine.assets.size === 1));
  assert.ok(
    await page.evaluate(() => !aura.recording.stream && !aura.recording.saving),
  );
  await page.click('[data-house-close="recordPanel"]');
  console.log(
    "Microphone MediaRecorder take, decoding, track insertion and release: PASS",
  );
  await page.evaluate(() => {
    aura.house.goRoom("master", true);
    aura.house.openTool("master");
  });
  await page.fill("#listeningGain", "0.55").catch(async () =>
    page.evaluate(() => {
      const el = document.querySelector("#listeningGain");
      el.value = 0.55;
      el.dispatchEvent(new Event("change"));
    }),
  );
  await page.click('[data-house-close="masterPanel"]');
  await page.evaluate(() => {
    aura.house.goRoom("terrace", true);
    aura.house.openTool("terrace");
  });
  const dl = page.waitForEvent("download", { timeout: 60000 });
  await page.click("#terraceExport");
  const download = await dl;
  await download.saveAs(__dirname + "/house-export.wav");
  const wav = fs.readFileSync(__dirname + "/house-export.wav");
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(24), 44100);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.ok(wav.length > 100000);
  await page.click('[data-house-close="exportPanel"]');
  console.log("Reference controls and actual PCM WAV export: PASS");
  await page.evaluate(() => aura.house.goRoom("living", true));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: __dirname + "/../docs/AURA-house-mobile.png" });
  await page.click("#houseMapButton");
  assert.equal(await page.locator("#roomGrid button").count(), 9);
  await page.click('[data-room="instrument"]');
  await page.waitForFunction(() => !aura.house.journey);
  await page.click("#houseModeButton");
  assert.ok(await page.locator("#play").isVisible());
  await page.screenshot({
    path: __dirname + "/../docs/AURA-production-mobile.png",
  });
  console.log("390 px house, room map and precise tool access: PASS");
  assert.deepEqual(errors, []);
  console.log("Browser exceptions: 0");
  await page.goto("http://localhost:3000/src/verify.html");
  await page.waitForFunction(
    () =>
      document.querySelector("#status").textContent !==
      "Rendering actual Web Audio graphs…",
  );
  console.log("AUDIO REGRESSION", await page.locator("body").innerText());
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
