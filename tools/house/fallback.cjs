// No WebGL at all: the music tools must still open and work. Run with NOGL=1.
module.exports = async ({ page, shot, wait, boot }) => {
  await boot({ skip: false });
  await wait(2500);
  const H = (fn, arg) => page.evaluate(fn, arg);
  const say = (label, value) => console.log(label.padEnd(26), typeof value === 'string' ? value : JSON.stringify(value));
  const visible = (selector) => page.locator(selector).first().isVisible().catch(() => false);
  say('webgl', await H(() => { const c = document.createElement('canvas'); return { gl2: !!c.getContext('webgl2'), gl: !!c.getContext('webgl') }; }));
  say('state', await H(() => { const h = window.aura.house; return { house: !!h, renderer: !!h?.renderer, mode: h?.mode, entered: h?.entered, body: document.body.className, phone: !!h?.phone, mentor: !!h?.mentor }; }));
  say('gate / fallback', { gate: await visible('#gate'), fallback: await visible('#houseFallback'), text: await H(() => document.querySelector('#houseFallback').innerText.trim()) });
  await shot('h-fallback');
  // What can be seen and pressed?
  say('visible buttons', await H(() => [...document.querySelectorAll('button')].filter((b) => { const r = b.getBoundingClientRect(), s = getComputedStyle(b); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 && r.top < innerHeight && r.left < innerWidth && r.bottom > 0; }).map((b) => (b.id || b.textContent.trim().slice(0, 14))).slice(0, 60)));
  // Transport.
  await page.keyboard.press('Space');
  await wait(1500);
  say('space plays', await H(() => ({ playing: window.aura.house.studio.engine.playing, beat: +window.aura.house.studio.engine.beat.toFixed(1), ctx: window.aura.house.studio.engine.ctx?.state })));
  await page.keyboard.press('Space');
  await wait(300);
  // The button that would return to the house offers the command list instead.
  say('returnHouse button', { visible: await visible('#returnHouse'), text: await H(() => document.querySelector('#returnHouse').textContent) });
  if (await visible('#returnHouse')) { await page.click('#returnHouse'); await wait(500); }
  say('commands', await H(() => ({ open: !!document.querySelector('dialog[open]')?.id, id: document.querySelector('dialog[open]')?.id, items: [...document.querySelectorAll('dialog[open] button, dialog[open] li')].slice(0, 12).map((b) => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 34)) })));
  await shot('h-fallback-commands');
  // A room command opens that room's tool rather than walking anywhere.
  await page.keyboard.type('Go to mixing');
  await wait(300);
  await page.keyboard.press('Enter');
  await wait(700);
  say('go to mixing room', await H(() => ({ dialog: document.querySelector('dialog[open]')?.id || null, room: window.aura.house.currentRoom, mode: window.aura.house.mode })));
  await shot('h-fallback-room');
  await page.keyboard.press('Escape');
  await wait(300);
  // Keys that belong to the house must do nothing here.
  for (const key of ['Tab', 'KeyT', 'KeyL', 'KeyE', 'KeyM', 'Digit3', 'KeyW']) { await page.keyboard.press(key); await wait(120); }
  await page.keyboard.press('Control+Enter');
  await wait(500);
  say('after house keys', await H(() => ({ dialog: document.querySelector('dialog[open]')?.id || null, mode: window.aura.house.mode, listening: window.aura.house.listening, body: document.body.className })));
  await page.keyboard.press('Escape');
  await wait(300);
  // The other tools.
  for (const [name, open] of [['workbench', () => window.aura.workbench.open()], ['coach', () => window.aura.coach.open()], ['game', () => window.aura.game.open()]]) {
    await H(open);
    await wait(700);
    say(name, await H(() => ({ dialog: document.querySelector('dialog[open]')?.id || null })));
    await shot('h-fallback-' + name);
    await page.keyboard.press('Escape');
    await wait(300);
    await H(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  }
  // An edit in the editor is a real edit.
  say('edit', await H(() => { const s = window.aura.house.studio, before = s.store.undoStack.length; s.commit('Change tempo', (p) => (p.bpm = 100)); return { bpm: s.getProject().bpm, undo: s.store.undoStack.length - before }; }));
};
