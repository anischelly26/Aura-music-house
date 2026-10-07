// A short pass over whatever AURA_URL points at — the source, dist/index.html, or AURA.html opened from disk:
// does the house come up with its furniture and typefaces, play, take a hand on an instrument, and open the phone?
module.exports = async ({ page, shot, wait, boot }) => {
  await boot();
  const H = (fn, arg) => page.evaluate(fn, arg);
  const say = (label, value) => console.log(label.padEnd(22), typeof value === "string" ? value : JSON.stringify(value));
  say("page", await H(() => ({ url: location.protocol + "//…/" + location.pathname.split("/").pop(), bundled: !document.querySelector('script[src*="src/main.js"]'), embeddedModels: Object.keys(window.AURA_ASSETS || {}).length })));
  say("house", await H(() => { const h = window.aura.house; return { renderer: !!h.renderer, entered: h.entered, preset: h.performance.name, furniture: h.models.groups.length, programs: h.renderer.info.programs.length }; }));
  say("typefaces", await H(() => ['800 64px "Bricolage Grotesque"', 'italic 400 32px "Instrument Serif"', '500 16px "DM Mono"'].map((f) => document.fonts.check(f))));
  await H(() => window.aura.house.goRoom("living", true));
  await wait(800);
  await H(() => window.aura.house.play());
  await wait(1800);
  say("plays", await H(() => { const e = window.aura.house.studio.engine; return { playing: e.playing, beat: +e.beat.toFixed(1), level: +e.bands.level.toFixed(3) }; }));
  // A real click on the kick pad of the drum machine.
  await H(() => { window.__controls = []; window.aura.house.events.addEventListener("control", (e) => window.__controls.push(e.detail.device + ":" + e.detail.control)); window.aura.house.drums.enter(); });
  await page.waitForFunction(() => window.aura.house.director.holding, null, { timeout: 15000 });
  await wait(700);
  const where = () => H(() => { const h = window.aura.house, m = h.guide.control(h.drums, "KICK"), p = h.camera.position.clone(); h.camera.updateMatrixWorld(); m.getWorldPosition(p); p.project(h.camera); return { x: Math.round(((p.x + 1) / 2) * innerWidth), y: Math.round(((1 - p.y) / 2) * innerHeight) }; });
  let p = await where();
  await page.mouse.move(p.x, p.y);
  await wait(450);
  p = await where();
  await page.mouse.move(p.x, p.y);
  await wait(250);
  await page.mouse.down(); await wait(90); await page.mouse.up(); await wait(250);
  say("pad under the cursor", await H(() => ({ prompt: document.querySelector("#prompt").innerText.replace(/\s+/g, " "), heard: window.__controls })));
  await shot("smoke-drums");
  await page.keyboard.press("Escape");
  await wait(1100);
  await page.keyboard.press("Tab");
  await wait(700);
  say("phone", await H(() => ({ up: window.aura.house.phone.up, items: document.querySelectorAll("#phone .phoneHome button").length })));
  await page.keyboard.press("Tab");
  await H(() => window.aura.playback.pause());
  await H(() => window.aura.house.production("arrange"));
  await wait(700);
  say("precise editor", await H(() => ({ mode: window.aura.house.mode, tracks: document.querySelectorAll(".trackRow").length })));
  await shot("smoke-editor");
};
