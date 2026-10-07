// AURA school, end to end, with a real mouse and keyboard: each lesson is taken from its first line to its last.
// LESSON=rhythm,arrange picks lessons (default: all five). DEBUG=1 prints where each drag begins.
module.exports = async ({ page, shot, wait, boot }) => {
  await boot();
  const H = (fn, arg) => page.evaluate(fn, arg);
  await H(() => {
    const h = window.aura.house, v = () => h.camera.position.clone();
    window.T = {
      // Where a mesh (or a point in its local space) is on screen.
      at(mesh, local = null) {
        h.camera.updateMatrixWorld();
        mesh.updateWorldMatrix(true, false);
        const p = v();
        if (local) mesh.localToWorld(p.set(...local)); else mesh.getWorldPosition(p);
        p.project(h.camera);
        return { x: Math.round(((p.x + 1) / 2) * innerWidth), y: Math.round(((1 - p.y) / 2) * innerHeight) };
      },
      label(mesh) { const u = mesh?.userData.use; return u ? (typeof u.label === 'function' ? u.label() : u.label) : null; },
      control(device, start) { return h.guide.control(device, start); },
      state() { return { line: document.querySelector('#speechLine').textContent, chips: [...document.querySelectorAll('#speechChips button')].map((b) => b.textContent), marked: this.label(h.guide.marked), focused: h.interaction.focused?.name || null, beacon: !!h.guide.beacon }; },
    };
    window.__controls = [];
    h.events.addEventListener('control', (e) => window.__controls.push(e.detail.device + ':' + e.detail.control));
  });
  // Waits for AURA to finish a line that matches, and reports it.
  const line = async (pattern, timeout = 20000) => {
    const start = Date.now();
    let last = '', stable = 0;
    while (Date.now() - start < timeout) {
      const s = await H(() => window.T.state());
      if (pattern.test(s.line) && s.line === last) { if (++stable >= 3) { console.log(`   AURA: "${s.line}"  [marked: ${s.marked ?? '—'}] [chips: ${s.chips.join(' | ')}]`); return s; } }
      else stable = 0;
      last = s.line;
      await wait(150);
    }
    const s = await H(() => window.T.state());
    throw Error(`timed out waiting for ${pattern}; AURA is saying "${s.line}" (focused ${s.focused})`);
  };
  const chip = async (text) => { await page.locator('#speechChips button', { hasText: text }).first().click(); };
  // Aim the way a person does: move, let the view settle, correct, then press.
  const aim = async (p) => { await page.mouse.move(p.x, p.y); await wait(450); if (p.again) { const q = await p.again(); await page.mouse.move(q.x, q.y); await wait(250); return q; } return p; };
  const click = async (p, hold = 90) => { await aim(p); await page.mouse.down(); await wait(hold); await page.mouse.up(); await wait(160); };
  const drag = async (from, to, steps = 8) => { from = await aim(from); if (process.env.DEBUG) console.log('   aiming at', JSON.stringify({ x: from.x, y: from.y }), 'prompt:', await page.evaluate(() => document.querySelector('#prompt').textContent.trim()), 'project clips:', await page.evaluate(() => JSON.stringify(window.aura.house.studio.getProject().tracks.map((t) => t.clips.map((c) => [c.start, c.length]))))); await page.mouse.down(); await wait(80); for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps); await wait(35); } await wait(80); await page.mouse.up(); await wait(200); };
  const ctlOnce = (device, start) => H(({ device, start }) => { const d = window.aura.house[device], m = window.T.control(d, start); return m ? { ...window.T.at(m), label: window.T.label(m) } : null; }, { device, start });
  const ctl = async (device, start) => { const p = await ctlOnce(device, start); if (!p) throw Error('no control ' + start + ' on ' + device); return { ...p, again: () => ctlOnce(device, start) }; };
  const begin = async (id, opening, device) => {
    console.log(`\n=== ${id.toUpperCase()} ===`);
    await H(() => { const h = window.aura.house; h.goRoom('living', true); h.player.place(0.1, 7.6); h.lookAt(0.1, 1, 0); });
    await wait(500);
    H((id) => { window.aura.house.guide.lesson(id); }, id);
    await line(opening);
    console.log('   beacon lit:', (await H(() => window.T.state())).beacon);
    await chip('TAKE ME THERE');
    await page.waitForFunction((name) => window.aura.house.interaction.focused?.name === name && window.aura.house.director.holding, device, { timeout: 30000 });
    await wait(500);
  };
  const want = (process.env.LESSON || 'rhythm,synthesis,mixing,arrange,sampling').split(',');

  if (want.includes('rhythm')) {
    await begin('rhythm', /Rhythm begins/, 'drums');
    let s = await line(/Hit the kick/);
    await shot('e-rhythm-1-kick');
    await click(await ctl('drums', 'KICK'));
    s = await line(/Light 1, 5, 9 and 13|already has the kick/);
    await wait(1500); // nothing may advance the lesson but a hand
    s = await line(/Light 1, 5, 9 and 13|already has the kick/);
    const before = await H(() => { const c = window.aura.house.drums.clip(); return [0, 4, 8, 12].map((i) => !!c?.notes.some((n) => n.pitch === 36 && Math.abs(n.start - i / 4) < 0.05)); });
    console.log('   kick steps already lit:', JSON.stringify(before));
    if (before.every(Boolean)) await click(await ctl('drums', 'KICK · 11'));
    else for (const step of [0, 4, 8, 12]) if (!before[[0, 4, 8, 12].indexOf(step)]) await click(await ctl('drums', 'KICK · ' + String(step + 1).padStart(2, '0')));
    s = await line(/hit the snare/);
    await shot('e-rhythm-3-snare');
    await click(await ctl('drums', 'SNARE'));
    const snare = await H(() => { const c = window.aura.house.drums.clip(); return [4, 12].map((i) => !!c?.notes.some((n) => n.pitch === 38 && Math.abs(n.start - i / 4) < 0.05)); });
    console.log('   snare steps already lit:', JSON.stringify(snare));
    for (const [k, step] of [4, 12].entries()) if (!snare[k]) await click(await ctl('drums', 'SNARE · ' + String(step + 1).padStart(2, '0')));
    s = await line(/Press play/);
    await click(await ctl('drums', 'PLAY'));
    s = await line(/turn SWING/);
    const swing = await ctl('drums', 'SWING');
    await drag(swing, { x: swing.x, y: swing.y - 60 });
    s = await line(/That is a beat/);
    await shot('e-rhythm-done');
    console.log('   project:', JSON.stringify(await H(() => { const p = window.aura.studio?.getProject?.() || window.aura.house.studio.getProject(); return { swing: +p.swing.toFixed(2), playing: window.aura.house.studio.engine.playing }; })));
    await H(() => { window.aura.playback.pause(); window.aura.house.blur(true); window.aura.house.mentor.close(); });
  }

  if (want.includes('synthesis')) {
    await begin('synthesis', /three ideas/, 'synth');
    await line(/Hold any key/);
    await page.keyboard.down('KeyA'); await wait(250); await page.keyboard.up('KeyA');
    await line(/press SAW/);
    await shot('e-synth-2-saw');
    await click(await ctl('synth', 'SAW'));
    for (const [pattern, knob, dy] of [[/Turn BRIGHT down/, 'BRIGHT', 70], [/ATTACK is how/, 'ATTACK', -70], [/RELEASE is how/, 'RELEASE', -70]]) {
      await line(pattern);
      const k = await ctl('synth', knob);
      await drag(k, { x: k.x, y: k.y + dy });
    }
    await line(/Tone, filter, shape/);
    await shot('e-synth-done');
    console.log('   track:', JSON.stringify(await H(() => { const t = window.aura.house.keysTrack(); return { instrument: t.instrument, synth: t.synth }; })));
    await H(() => { window.aura.house.blur(true); window.aura.house.mentor.close(); });
  }

  if (want.includes('mixing')) {
    await begin('mixing', /deciding what matters/, 'mixer');
    await line(/Start the music/);
    await chip('PLAY');
    await line(/first fader all the way down/);
    await shot('e-mix-2-fader');
    const fader = await ctl('mixer', 'LEVEL');
    await drag(fader, { x: fader.x, y: fader.y + 70 });
    await line(/PAN is width/);
    const pan = await ctl('mixer', 'PAN');
    await drag(pan, { x: pan.x, y: pan.y + 40 });
    await line(/Solo a channel/);
    await click(await ctl('mixer', 'SOLO'));
    await line(/Balance first/);
    await shot('e-mix-done');
    console.log('   track 1:', JSON.stringify(await H(() => { const t = window.aura.house.studio.getProject().tracks[0]; return { gain: +t.gain.toFixed(2), pan: +t.pan.toFixed(2), solo: t.solo }; })));
    await click(await ctl('mixer', 'SOLO'));
    await H(() => { window.aura.playback.pause(); window.aura.house.blur(true); window.aura.house.mentor.close(); });
  }

  if (want.includes('arrange')) {
    await begin('arrange', /loop that changes/, 'timeline');
    await line(/Drag any clip/);
    await wait(900);
    await shot('e-arrange-1');
    // A point on a clip, in screen pixels: strip `row`, at `beat`.
    const onClipOnce = (which, offset = 0) => H(({ which, offset }) => {
      const tl = window.aura.house.timeline;
      for (let row = 0; row < 8; row++) {
        const t = tl.trackAt(row), c = t?.clips[0];
        if (!c) continue;
        const edge = tl.edge(c), beat = which === 'end' ? c.start + c.length - edge * 0.5 : c.start + c.length / 2 + offset;
        const local = [(tl.x(beat) / 1536 - 0.5) * 2.3, 0, 0];
        return { ...window.T.at(tl.strips[row], local), row, beat, start: c.start, length: c.length, name: t.name, pxPerBeat: Math.abs(window.T.at(tl.strips[row], [(tl.x(beat + 1) / 1536 - 0.5) * 2.3, 0, 0]).x - window.T.at(tl.strips[row], local).x) };
      }
      return null;
    }, { which, offset });
    const onClip = async (which, offset = 0) => ({ ...(await onClipOnce(which, offset)), again: () => onClipOnce(which, offset) });
    const count = () => H(() => { const st = window.aura.house.studio.store; return { clips: st.project.tracks.reduce((n, t) => n + t.clips.length, 0), undo: st.undoStack.length, cursor: window.aura.house.canvas.style.cursor }; });
    let c = await onClip('middle');
    console.log('   clip:', JSON.stringify(c));
    await drag(c, { x: c.x + c.pxPerBeat * 4, y: c.y });
    await line(/right edge/);
    c = await onClip('end');
    await aim(c);
    console.log('   at the edge:', JSON.stringify(await count()), 'prompt:', await page.evaluate(() => document.querySelector('#prompt').textContent.trim()));
    await drag(c, { x: c.x + c.pxPerBeat * 2, y: c.y });
    await line(/Hold Alt/);
    // Alt and a plain click must leave nothing behind.
    c = await onClip('middle');
    let before = await count();
    await page.keyboard.down('Alt');
    await click(c);
    await page.keyboard.up('Alt');
    console.log('   alt-click:', JSON.stringify(before), '->', JSON.stringify(await count()));
    await wait(700);
    console.log('   lesson still waiting:', (await H(() => window.T.state())).line.slice(0, 30));
    c = await onClip('middle');
    before = await count();
    await page.keyboard.down('Alt');
    await drag(c, { x: c.x - c.pxPerBeat * 8, y: c.y });
    await page.keyboard.up('Alt');
    const copied = await count();
    await H(() => window.aura.house.studio.store.undo());
    const undone = await count();
    await H(() => window.aura.house.studio.store.redo());
    console.log('   alt-drag:', JSON.stringify(before), '->', JSON.stringify(copied), 'one undo ->', JSON.stringify(undone), 'redo ->', JSON.stringify(await count()));
    await line(/Drag along the ruler/);
    const ruler = await H(() => { const tl = window.aura.house.timeline, f = (beat) => window.T.at(tl.ruler, [(tl.x(beat) / 1536 - 0.5) * 2.3, 0, 0]); return { a: f(4), b: f(12) }; });
    await drag(ruler.a, ruler.b);
    await line(/Move, trim, copy, loop/);
    await shot('e-arrange-done');
    console.log('   loop:', JSON.stringify(await H(() => { const e = window.aura.house.studio.engine; return { loop: e.loop, from: e.loopStart, to: e.loopEnd, undo: window.aura.house.studio.store.undoStack?.length }; })));
    await H(() => { window.aura.house.studio.engine.setLoopRegion(null, null); window.aura.house.blur(true); window.aura.house.mentor.close(); });
  }

  if (want.includes('sampling')) {
    await begin('sampling', /two good bars/, 'turntable');
    await line(/Choose a record/);
    await wait(600);
    await shot('e-sampling-1');
    const sleeve = await H(() => { const tt = window.aura.house.turntable, s = tt.sleeves[2]; return { ...window.T.at(s.mesh), title: s.piece?.title }; });
    console.log('   sleeve:', JSON.stringify(sleeve));
    await click(sleeve);
    await line(/cut two bars/);
    await page.waitForFunction(() => window.aura.playback.playing, null, { timeout: 15000 });
    await wait(2500);
    await shot('e-sampling-2-playing');
    const tracksBefore = await H(() => window.aura.house.studio.getProject().tracks.length);
    await click(await ctl('turntable', '2 BARS'));
    await line(/new audio track/, 60000);
    await shot('e-sampling-done');
    console.log('   project:', JSON.stringify(await H((n) => { const p = window.aura.house.studio.getProject(), t = p.tracks.at(-1); return { tracksBefore: n, tracks: p.tracks.length, last: t.name, instrument: t.instrument, clip: t.clips[0] && { start: t.clips[0].start, length: t.clips[0].length, asset: !!t.clips[0].asset }, assetSeconds: Object.values(p.assets || {}).map((a) => +a.duration.toFixed(2)) }; }, tracksBefore)));
    await H(() => { window.aura.playback.pause(); window.aura.house.blur(true); window.aura.house.mentor.close(); });
  }
  console.log('\ncontrols announced:', (await H(() => window.__controls)).join(', '));
};
