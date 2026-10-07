// The phone: every app opened and used with real clicks. A record is pressed, found on the rack by the turntable and played;
// a bar is cut from it; the result is heard in Samples.
module.exports = async ({ page, shot, wait, boot }) => {
  await boot();
  const H = (fn, arg) => page.evaluate(fn, arg);
  const say = (label, value) => console.log(label.padEnd(26), typeof value === 'string' ? value : JSON.stringify(value));
  const view = '#phone .phoneView';
  const tap = async (selector, nth = 0) => { await page.locator(`${view} ${selector}`).nth(nth).click(); await wait(350); };
  const text = () => H(() => document.querySelector('#phone .phoneView').innerText.replace(/\s+/g, ' ').slice(0, 160));
  const app = async (name) => { await page.locator('#phone .phoneBar [data-go="home"]').click(); await wait(250); if (name !== 'home') await tap(`[data-go="${name}"]`); await wait(400); };
  await H(() => window.aura.house.goRoom('living', true));
  await wait(600);

  // Tab raises it.
  await page.keyboard.press('Tab');
  await wait(900);
  say('tab opens', await H(() => ({ up: window.aura.house.phone.up, app: window.aura.house.phone.app, locked: !!document.pointerLockElement })));
  await shot('g-phone-home');
  say('home', await text());
  const box = await page.locator('#phone .phoneBody').boundingBox();
  say('phone box', box && { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) });

  // ——— Now playing ———
  await tap('[data-go="now"]');
  await shot('g-phone-now');
  await tap('[data-play]');
  await wait(1500);
  say('now: play', await H(() => ({ playing: window.aura.playback.playing, button: document.querySelector('#phone [data-play]').textContent, elapsed: document.querySelector('#phone [data-elapsed]').textContent })));
  const scrub = await page.locator(`${view} .phoneScrub`).boundingBox();
  await page.mouse.click(scrub.x + scrub.width * 0.5, scrub.y + scrub.height / 2);
  await wait(700);
  say('now: scrub to half', await H(() => +window.aura.playback.progress.fraction.toFixed(2)));
  await page.locator(`${view} [data-master]`).fill('0.6');
  await page.locator(`${view} [data-master]`).dispatchEvent('change');
  await wait(200);
  say('now: master', await H(() => ({ master: window.aura.house.studio.getProject().master, undo: window.aura.house.studio.store.undoStack.at(-1)?.label })));
  await tap('[data-loop]');
  say('now: loop', await H(() => ({ loop: window.aura.house.studio.engine.loop, label: document.querySelector('#phone [data-loop]').textContent })));
  await tap('[data-loop]');
  await tap('[data-next]');
  await wait(2500);
  say('now: next', await H(() => ({ title: window.aura.playback.current.title, kind: window.aura.playback.current.kind, playing: window.aura.playback.playing, foreign: !!window.aura.playback.foreign, beat: +window.aura.house.studio.engine.beat.toFixed(1) })));
  await shot('g-phone-now-original');
  await tap('[data-prev]');
  await wait(1200);
  say('now: prev', await H(() => ({ title: window.aura.playback.current.title, playing: window.aura.playback.playing, foreign: !!window.aura.playback.foreign })));
  await tap('[data-play]');
  say('now: pause', await H(() => window.aura.playback.playing));

  // ——— Records ———
  await app('radio');
  await shot('g-phone-radio');
  const rows = await page.locator(`${view} [data-piece]`).count();
  await tap('[data-piece]', 3);
  await wait(2200);
  say('radio: rows / play 4th', { rows, ...(await H(() => ({ title: window.aura.playback.current.title, playing: window.aura.playback.playing, foreign: !!window.aura.playback.foreign, mark: [...document.querySelectorAll('#phone [data-piece] em')].map((e) => e.textContent).filter(Boolean) }))) });
  await tap('[data-piece]', 3);
  say('radio: tap again pauses', await H(() => window.aura.playback.playing));
  await tap('[data-piece]', 0);
  await wait(900);
  say('radio: back to project', await H(() => ({ title: window.aura.playback.current.title, kind: window.aura.playback.current.kind, playing: window.aura.playback.playing, foreign: !!window.aura.playback.foreign })));
  await H(() => window.aura.playback.pause());

  // ——— Press to vinyl ———
  await app('now');
  await tap('[data-go="vinyl"]');
  await shot('g-phone-vinyl');
  await tap('[data-style]', 2);
  say('vinyl: sleeve chosen', await H(() => [...document.querySelectorAll('#phone [data-style]')].map((b) => b.getAttribute('aria-pressed'))));
  await tap('[data-press]');
  await wait(1400);
  await shot('g-vinyl-pressed-moment');
  say('vinyl: pressed', await H(() => ({ up: window.aura.house.phone.up, records: window.aura.playback.records().map((r) => [r.title, r.style]), stored: JSON.parse(localStorage.getItem('aura-vinyl')).length, aura: document.querySelector('#speechLine').textContent, chips: [...document.querySelectorAll('#speechChips button')].map((b) => b.textContent) })));
  await wait(2600);
  await page.locator('#speechChips button', { hasText: 'TAKE ME THERE' }).click();
  await page.waitForFunction(() => window.aura.house.interaction.focused?.name === 'turntable' && window.aura.house.director.holding, null, { timeout: 30000 });
  await wait(1200);
  await shot('g-vinyl-at-turntable');
  say('rack', await H(() => window.aura.house.turntable.sleeves.map((s) => s.piece && s.piece.kind + ':' + s.piece.title)));
  // The pressed record is the second sleeve. Find a visible point on it by sampling its face.
  const point = await H(() => {
    const h = window.aura.house, tt = h.turntable, sleeve = tt.sleeves[1], ray = h.interaction.raycaster, found = [];
    for (let y = 60; y < innerHeight - 60; y += 8) for (let x = innerWidth * 0.5; x < innerWidth - 20; x += 8) {
      ray.setFromCamera({ x: (x / innerWidth) * 2 - 1, y: -(y / innerHeight) * 2 + 1 }, h.camera);
      const hit = ray.intersectObjects(h.architecture.interactive.filter((o) => h.interaction.shown(o)), false)[0];
      if (hit?.object === sleeve.mesh) found.push([x, y]);
    }
    const mid = found[Math.floor(found.length / 2)];
    return { visiblePoints: found.length, x: mid?.[0], y: mid?.[1] };
  });
  say('second sleeve visible', point);
  await page.mouse.move(point.x, point.y);
  await wait(700);
  say('prompt on sleeve', await H(() => document.querySelector('#prompt').innerText.replace(/\s+/g, ' ')));
  await shot('g-vinyl-sleeve-hover');
  await page.mouse.down(); await wait(90); await page.mouse.up();
  await page.waitForFunction(() => window.aura.playback.playing, null, { timeout: 15000 });
  await wait(2500);
  await shot('g-vinyl-playing');
  say('pressed record plays', await H(() => { const pb = window.aura.playback, tt = window.aura.house.turntable; return { title: pb.current.title, kind: pb.current.kind, playing: pb.playing, foreign: !!pb.foreign, arm: +tt.arm.toFixed(2), spin: +tt.spin.toFixed(2), beat: +window.aura.house.studio.engine.beat.toFixed(1) }; }));
  // START · STOP on the deck.
  const stop = await H(() => { const h = window.aura.house, m = h.guide.control(h.turntable, 'START'); const p = h.camera.position.clone(); m.getWorldPosition(p); p.project(h.camera); return { x: Math.round(((p.x + 1) / 2) * innerWidth), y: Math.round(((1 - p.y) / 2) * innerHeight) }; });
  await page.mouse.move(stop.x, stop.y); await wait(500);
  await page.mouse.down(); await wait(90); await page.mouse.up(); await wait(600);
  say('start·stop', await H(() => ({ playing: window.aura.playback.playing, prompt: document.querySelector('#prompt').innerText.replace(/\s+/g, ' ') })));
  await page.keyboard.press('ArrowRight'); await wait(500);
  say('browse →', await H(() => ({ page: window.aura.house.turntable.page, rack: window.aura.house.turntable.sleeves.map((s) => s.piece?.title || null) })));
  await page.keyboard.press('ArrowLeft'); await wait(300);
  await page.keyboard.press('Escape'); await wait(1200);

  // ——— Samples (after a cut there is one) ———
  await H(() => window.aura.house.turntable.cut(1));
  await page.waitForFunction(() => Object.keys(window.aura.house.studio.getProject().assets || {}).length > 0, null, { timeout: 60000 });
  await wait(600);
  await page.keyboard.press('Tab'); await wait(700);
  await app('samples');
  await shot('g-phone-samples');
  say('samples', await text());
  await tap('[data-asset]');
  say('samples: heard', await H(() => ({ ctx: window.aura.house.studio.engine.ctx.state })));

  // ——— AURA ———
  await app('aura');
  await shot('g-phone-aura');
  await tap('[data-q]', 1);
  await wait(2500);
  say('aura: muddy mix', await H(() => ({ up: window.aura.house.phone.up, line: document.querySelector('#speechLine').textContent.slice(0, 140), chips: [...document.querySelectorAll('#speechChips button')].map((b) => b.textContent) })));
  await shot('g-aura-answer');
  await H(() => window.aura.house.mentor.close());

  // ——— Map ———
  await page.keyboard.press('KeyM'); await wait(800);
  await shot('g-phone-map');
  say('map', await H(() => ({ app: window.aura.house.phone.app, rooms: [...document.querySelectorAll('#phone [data-room]')].map((b) => b.dataset.room + (b.classList.contains('here') ? '*' : '')) })));
  await page.locator(`${view} [data-room="rhythm"]`).click({ modifiers: ['Shift'] });
  await wait(900);
  say('map: go (shift)', await H(() => ({ room: window.aura.house.currentRoom, up: window.aura.house.phone.up })));

  // ——— Notes ———
  await page.keyboard.press('Tab'); await wait(600);
  await app('notes');
  await page.locator(`${view} textarea`).fill('Chorus needs air.');
  await shot('g-phone-notes');
  await app('home'); await app('notes');
  say('notes persist', await page.locator(`${view} textarea`).inputValue());
  // Typing in notes must not walk the house or close the phone.
  await page.locator(`${view} textarea`).click();
  const before = await H(() => { const c = window.aura.house.camera.position; return [c.x, c.z]; });
  await page.keyboard.type('wasd tl e 1');
  await wait(500);
  say('typing stays in notes', await H((b) => { const h = window.aura.house, c = h.camera.position; return { moved: Math.hypot(c.x - b[0], c.z - b[1]) > 0.01, up: h.phone.up, asking: !!h.mentor.asking, listening: h.listening, room: h.currentRoom }; }, before));

  // ——— Projects ———
  await app('projects');
  await wait(900);
  await shot('g-phone-projects');
  say('projects', await text());
  const name = await H(() => window.aura.house.studio.getProject().name);
  await tap('[data-save]');
  await wait(500);
  await app('projects'); await wait(700);
  say('projects: saved rows', await page.locator(`${view} [data-session]`).count());
  await tap('[data-new]');
  await wait(900);
  say('projects: new', await H(() => { const p = window.aura.house.studio.getProject(); return { name: p.name, tracks: p.tracks.length, phoneApp: window.aura.house.phone.app, title: window.aura.playback.current.title }; }));
  await app('projects'); await wait(900);
  const sessions = await page.locator(`${view} [data-session]`).count();
  if (sessions) { await page.locator(`${view} [data-session]`, { hasText: name }).first().click(); await wait(1200); }
  say('projects: reopen', await H(() => { const p = window.aura.house.studio.getProject(); return { name: p.name, tracks: p.tracks.length, app: window.aura.house.phone.app }; }));

  // ——— Settings ———
  await app('settings');
  await wait(600);
  await shot('g-phone-settings');
  say('settings: perf line', await H(() => document.querySelector('#phone [data-perf]').textContent));
  await tap('[data-mood="midnight"]'); await wait(300);
  await tap('[data-sky="sunset"]'); await wait(300);
  say('settings: mood/sky', await H(() => { const l = window.aura.house.lighting; return { mood: l.moodName, sky: l.skyName, pressed: [...document.querySelectorAll('#phone [aria-pressed="true"]')].map((b) => b.textContent) }; }));
  await page.locator(`${view} [data-option="fieldOfView"]`).fill('70');
  await page.locator(`${view} [data-option="speed"]`).fill('4');
  say('settings: sliders', await H(() => ({ fov: window.aura.house.fieldOfView, speed: window.aura.house.speed, stored: localStorage.getItem('aura-fov') })));
  await page.locator(`${view} [data-option="fieldOfView"]`).fill('62');
  await page.locator(`${view} [data-option="speed"]`).fill('3.1');
  await tap('[data-quality="low"]'); await wait(1500);
  say('settings: low', await H(() => ({ name: window.aura.house.performance.name, auto: window.aura.house.performance.auto, perf: document.querySelector('#phone [data-perf]').textContent })));
  await tap('[data-quality="auto"]'); await wait(1500);
  say('settings: auto', await H(() => ({ name: window.aura.house.performance.name, auto: window.aura.house.performance.auto })));
  await tap('[data-mood="create"]'); await tap('[data-sky="day"]');
  // Scroll to the bottom of settings and photograph it.
  await H(() => { const v = document.querySelector('#phone .phoneView'); v.scrollTop = v.scrollHeight; });
  await wait(300);
  await shot('g-phone-settings-bottom');
  await page.locator('#phone [data-close]').click();
  await wait(700);
  say('close', await H(() => ({ up: window.aura.house.phone.up, focus: document.activeElement?.id })));
  // The mark in the corner raises it too.
  await page.click('#auraMark'); await wait(600);
  say('mark opens', await H(() => window.aura.house.phone.up));
  // A click on the world lowers it.
  await page.mouse.click(300, 400); await wait(600);
  say('click on world closes', await H(() => window.aura.house.phone.up));
};
