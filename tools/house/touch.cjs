// A phone in the hand: arrival, looking, walking, the sheet and its touch instruments, instruments framed for the screen,
// listening mode and the way back from it. Run with TOUCH=1 SIZE=390x844 (upright) or TOUCH=1 SIZE=844x390 TAG=wide (sideways).
module.exports = async ({ page, shot, wait, boot, context }) => {
  const tag = process.env.TAG || 'i';
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id = 1]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 0.5 })) });
  const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await wait(60); await touch('touchEnd', []); await wait(250); };
  const swipe = async (x0, y0, x1, y1, steps = 10, hold = 0) => { await touch('touchStart', [[x0, y0]]); for (let i = 1; i <= steps; i++) { await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]); await wait(24); } if (hold) await wait(hold); await touch('touchEnd', []); await wait(250); };
  const H = (fn, arg) => page.evaluate(fn, arg);
  const say = (label, value) => console.log(label.padEnd(26), typeof value === 'string' ? value : JSON.stringify(value));
  const size = page.viewportSize(), W = size.width, Hh = size.height;
  const box = async (selector) => { const b = await page.locator(selector).first().boundingBox().catch(() => null); return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const centre = async (selector) => { const el = page.locator(selector).first(); await el.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {}); await wait(120); const b = await el.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  // Anything that spills outside the screen, or sits under something else, is reported.
  const overflow = () => H(() => [...document.querySelectorAll('#houseHud *, #phone .phoneBody, #speech, #gate *, #moment *')].filter((el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 && !el.closest('[hidden]') && (r.right > innerWidth + 1 || r.left < -1); }).map((el) => (el.id || el.className || el.tagName) + ' ' + Math.round(el.getBoundingClientRect().left) + '→' + Math.round(el.getBoundingClientRect().right)).slice(0, 12));

  await boot({ skip: false });
  await wait(1500);
  say('viewport', { W, Hh });
  await shot(tag + '-gate');
  say('gate overflow', await overflow());
  say('gate buttons', { enter: await box('#enterHouse'), skip: await box('#skipArrival') });
  await tap(...(await centre('#skipArrival')));
  await H(() => window.aura.house.modelsReady);
  await wait(3500);
  say('state', await H(() => { const h = window.aura.house; return { touch: h.touch, mobile: h.phone.mobile, entered: h.entered, room: h.currentRoom, preset: h.performance.name, pr: h.renderer.getPixelRatio(), body: document.body.className }; }));
  await shot(tag + '-arrived');
  say('hud overflow', await overflow());
  say('controls', { pad: await box('#touchMovePad'), use: await box('#touchInteract'), mark: await box('#auraMark'), sheet: await box('#phone .phoneBody'), nav: await box('#touchNavigation') });

  // Look: one finger across the picture.
  const yaw0 = await H(() => window.aura.house.lookYaw);
  await swipe(W * 0.7, Hh * 0.35, W * 0.3, Hh * 0.35);
  say('swipe looks', await H((y) => +(window.aura.house.lookYaw - y).toFixed(2), yaw0));
  await swipe(W * 0.3, Hh * 0.35, W * 0.7, Hh * 0.35);
  // Walk: the pad, pushed forward and held.
  const p0 = await H(() => { const c = window.aura.house.camera.position; return [c.x, c.z]; });
  const [px, py] = await centre('#touchMovePad');
  await swipe(px, py, px, py - 46, 6, 1600);
  say('pad walks', await H((p) => { const c = window.aura.house.camera.position; return +Math.hypot(c.x - p[0], c.z - p[1]).toFixed(2); }, p0));
  say('pad released', await H(() => ({ forward: window.aura.house.touchControls.forward, speed: +window.aura.house.velocity.length().toFixed(2) })));
  // Tap the floor ahead: walk there.
  await H(() => { const h = window.aura.house; h.goRoom('living', true); });
  await wait(700);
  const p1 = await H(() => { const c = window.aura.house.camera.position; return [c.x, c.z]; });
  await tap(W * 0.5, Hh * 0.56);
  await wait(1800);
  say('tap floor walks', await H((p) => { const c = window.aura.house.camera.position; return +Math.hypot(c.x - p[0], c.z - p[1]).toFixed(2); }, p1));
  await H(() => window.aura.house.resetNavigationInput());
  say('aim rests at centre', await H(() => ({ pointer: [window.aura.house.pointer.x, window.aura.house.pointer.y], px: document.body.style.getPropertyValue('--px'), reticle: getComputedStyle(document.querySelector('#reticle')).opacity })));

  // The sheet: a tap on its bar raises it.
  await shot(tag + '-living');
  await tap(...(await centre('#phone .phoneStatus')));
  await wait(700);
  say('sheet up', await H(() => ({ up: window.aura.house.phone.up, app: window.aura.house.phone.app, items: [...document.querySelectorAll('#phone .phoneHome button')].map((b) => b.dataset.go) })));
  await shot(tag + '-sheet-home');
  say('sheet box', await box('#phone .phoneBody'));
  say('sheet overflow', await overflow());
  // Beat: sixteen steps under the thumb.
  await tap(...(await centre('#phone [data-go="beat"]')));
  await wait(500);
  await shot(tag + '-sheet-beat');
  say('beat step size', await box('#phone [data-step="0"]'));
  const stepsBefore = await H(() => window.aura.house.studio.getProject().tracks.find((t) => t.instrument === 'drums').clips[0].notes.length);
  await tap(...(await centre('#phone [data-step="2"][data-pitch="36"]')));
  await wait(300);
  say('beat toggles a step', await H((n) => window.aura.house.studio.getProject().tracks.find((t) => t.instrument === 'drums').clips[0].notes.length - n, stepsBefore));
  await tap(...(await centre('#phone [data-play]')));
  await wait(1500);
  say('beat plays', await H(() => ({ playing: window.aura.playback.playing, now: document.querySelectorAll('#phone [data-step].now').length })));
  await tap(...(await centre('#phone [data-play]')));
  // Keys.
  await tap(...(await centre('#phone .phoneBar [data-go="home"]')));
  await tap(...(await centre('#phone [data-go="keys"]')));
  await wait(400);
  await shot(tag + '-sheet-keys');
  say('key size', await box('#phone .phoneKeys button'));
  const [kx, ky] = await centre('#phone .phoneKeys button');
  await touch('touchStart', [[kx, ky]]);
  await wait(350);
  say('key held', await H(() => ({ down: document.querySelectorAll('#phone .phoneKeys .down').length, voices: window.aura.house.studio.engine.voices?.size ?? window.aura.house.studio.engine.live?.size ?? null })));
  await touch('touchEnd', []);
  await wait(200);
  say('key released', await H(() => document.querySelectorAll('#phone .phoneKeys .down').length));
  // Now playing and settings fit.
  for (const app of ['now', 'settings', 'map', 'aura']) {
    await tap(...(await centre('#phone .phoneBar [data-go="home"]')));
    const target = page.locator(`#phone .phoneView [data-go="${app}"]`).first();
    await target.scrollIntoViewIfNeeded();
    await tap(...(await centre(`#phone .phoneView [data-go="${app}"]`)));
    await wait(450);
    await shot(tag + '-sheet-' + app);
    say(app + ' overflow', await overflow());
    say(app + ' scrolls', await H(() => { const v = document.querySelector('#phone .phoneView'); return { client: v.clientHeight, scroll: v.scrollHeight, inner: [...v.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).length }; }));
  }
  // Lower the sheet.
  await tap(...(await centre('#phone [data-close]')));
  await wait(600);
  say('sheet down', await H(() => window.aura.house.phone.up));

  // An instrument under a thumb: the timeline.
  await H(() => window.aura.house.timeline.enter());
  await page.waitForFunction(() => window.aura.house.director.holding, null, { timeout: 15000 });
  await wait(1600);
  await shot(tag + '-timeline');
  say('focused hud', { hint: await box('#hint'), nav: await H(() => !document.querySelector('#touchNavigation').hidden), prompt: await box('#prompt'), overflow: await overflow() });
  const clip = await H(() => {
    const h = window.aura.house, tl = h.timeline;
    for (let row = 0; row < 8; row++) {
      const t = tl.trackAt(row), c = t?.clips[0];
      if (!c) continue;
      const at = (beat) => { const p = h.camera.position.clone(); tl.strips[row].localToWorld(p.set((tl.x(beat) / 1536 - 0.5) * 2.3, 0, 0)); p.project(h.camera); return [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight]; };
      const a = at(c.start + c.length / 2), b = at(c.start + c.length / 2 + 4);
      return { a, b, start: c.start, row, stripPx: Math.abs(at(0)[1] - (() => { const p = h.camera.position.clone(); tl.strips[Math.min(7, row + 1)].localToWorld(p.set(0, 0, 0)); p.project(h.camera); return ((1 - p.y) / 2) * innerHeight; })()) };
    }
  });
  say('clip on screen', clip && { a: clip.a.map(Math.round), b: clip.b.map(Math.round), stripPx: Math.round(clip.stripPx) });
  await swipe(clip.a[0], clip.a[1], clip.b[0], clip.b[1], 10, 150);
  say('thumb drags a clip', await H((c) => { const tl = window.aura.house.timeline; return { from: c.start, to: tl.trackAt(c.row).clips[0].start, undo: window.aura.house.studio.store.undoStack.at(-1)?.label }; }, clip));
  // Leaving a focus view needs a way out that is not a keyboard.
  say('ways out', await H(() => [...document.querySelectorAll('#houseHud button, #hint *, body > button')].filter((b) => { const r = b.getBoundingClientRect(), s = getComputedStyle(b); return r.width > 4 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 && !b.closest('[hidden]'); }).map((b) => (b.id || b.className || b.tagName) + ':' + b.textContent.trim().slice(0, 16))));
  await shot(tag + '-timeline-after');
  say('button reads', await H(() => document.querySelector('#touchInteract').textContent));
  await tap(...(await centre('#touchInteract')));
  await wait(1400);
  say('BACK leaves', await H(() => ({ focused: window.aura.house.interaction.focused?.name || null, button: document.querySelector('#touchInteract').textContent, pad: !!document.querySelector('.touchMove').offsetWidth })));
  // The other instruments, as they are framed in this screen.
  for (const name of ['drums', 'synth', 'mixer', 'turntable']) {
    await H((name) => window.aura.house[name].enter(), name);
    await page.waitForFunction(() => window.aura.house.director.holding, null, { timeout: 15000 });
    await wait(900);
    await shot(tag + '-focus-' + name);
    say(name + ' fits', await H((name) => { const h = window.aura.house, d = h[name], box = { l: 9, r: -9, t: 9, b: -9 }, v = h.camera.position.clone(); for (const m of d.controls) { m.getWorldPosition(v); v.project(h.camera); box.l = Math.min(box.l, v.x); box.r = Math.max(box.r, v.x); box.t = Math.min(box.t, -v.y); box.b = Math.max(box.b, -v.y); } return { fov: Math.round(h.camera.fov), x: [+box.l.toFixed(2), +box.r.toFixed(2)], y: [+box.t.toFixed(2), +box.b.toFixed(2)], controls: d.controls.length }; }, name));
    await H(() => window.aura.house.blur(true));
    await wait(300);
  }
  // Just listening, and the way back from it.
  await H(() => window.aura.house.setListening(true));
  await wait(3600);
  await shot(tag + '-listening');
  say('listening', await H(() => ({ listening: window.aura.house.listening, pad: getComputedStyle(document.querySelector('#touchMovePad')).visibility + '/' + getComputedStyle(document.querySelector('#houseHud')).opacity, mark: getComputedStyle(document.querySelector('#auraMark')).visibility })));
  await tap(...(await centre('#phone .phoneStatus')));
  await wait(600);
  await tap(...(await centre('#phone .phoneBar [data-go="now"]')));
  await wait(500);
  const stop = page.locator('#phone [data-listen]');
  await stop.scrollIntoViewIfNeeded();
  say('listen button', await stop.textContent());
  await tap(...(await centre('#phone [data-listen]')));
  await wait(700);
  say('listening off', await H(() => ({ listening: window.aura.house.listening, up: window.aura.house.phone.up })));
  await H(() => window.aura.playback.pause());

  // AURA speaking on a small screen.
  await H(() => { window.aura.house.mentor.hear('what should I add here?'); });
  await wait(5200);
  await shot(tag + '-aura');
  say('speech', { box: await box('#speech'), chips: await H(() => [...document.querySelectorAll('#speechChips button')].map((b) => { const r = b.getBoundingClientRect(); return [b.textContent, Math.round(r.width), Math.round(r.height)]; })), overflow: await overflow() });
  await H(() => window.aura.house.mentor.close());
  // The precise editor on a small screen.
  await H(() => window.aura.house.production('arrange'));
  await wait(900);
  await shot(tag + '-precise');
  say('precise editor', await H(() => ({ scrollW: document.documentElement.scrollWidth, innerW: innerWidth, back: (() => { const r = document.querySelector('#returnHouse').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })() })));
};
