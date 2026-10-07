// The five skies, every seat (sit, look, stand, and land on floor that can be walked), listening mode, and the console game on the wall.
module.exports = async ({ page, shot, wait, boot }) => {
  await boot();
  const H = (fn, arg) => page.evaluate(fn, arg);
  const report = (label, value) => console.log(label.padEnd(28), typeof value === 'string' ? value : JSON.stringify(value));

  // ——— Skies, seen from the terrace and from the living room ———
  for (const sky of ['sunset', 'night', 'rain', 'fog', 'day']) {
    await H((sky) => { const h = window.aura.house; h.lighting.setSky(sky); h.goRoom('terrace', true); }, sky);
    await wait(5200);
    await shot('b-sky-' + sky + '-terrace');
    const state = await H(() => { const h = window.aura.house, l = h.lighting; return { sky: l.skyName, rainVisible: l.rain.visible, fogFar: Math.round(h.scene.fog.far), sun: +l.sun.intensity.toFixed(2), fps: Math.round(h.fps) }; });
    report('sky ' + sky, state);
    if (sky !== 'day') { await H(() => window.aura.house.goRoom('living', true)); await wait(1500); await shot('b-sky-' + sky + '-living'); }
  }

  // ——— Every seat: sit, look, stand ———
  const seats = await H(() => window.aura.house.architecture.seats.map((s, i) => ({ i, id: s.id, label: s.label, room: s.room, eye: s.eye && [s.eye.x, s.eye.y, s.eye.z].map((v) => +v.toFixed(2)), yaw: s.yaw, exit: s.exit })));
  report('seats', seats.length);
  for (const seat of seats) {
    const out = await H(async (i) => {
      const h = window.aura.house, a = h.architecture, s = a.seats[i];
      const room = s.room || (await import('/src/house/layout.js')).roomAt(s.eye.x, s.eye.z).id;
      h.goRoom(room, true);
      await new Promise((r) => setTimeout(r, 300));
      h.sit(s);
      await new Promise((r) => setTimeout(r, 1600));
      const c = h.camera.position, seated = { x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), bodySeated: document.body.classList.contains('seated'), room };
      return seated;
    }, seat.i);
    await shot('b-seat-' + String(seat.i).padStart(2, '0'));
    const after = await H(async () => {
      const h = window.aura.house, a = h.architecture;
      h.stand();
      await new Promise((r) => setTimeout(r, 500));
      const c = h.camera.position;
      return { x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), canWalk: a.canWalk(c.x, c.z), ground: +a.groundHeight(c.x, c.z).toFixed(2), seated: !!h.player.seat };
    });
    report(`seat ${seat.i} ${seat.label || seat.id || ''}`, { eye: seat.eye, sat: out, stood: after });
  }

  // ——— Listening mode ———
  await H(() => { const h = window.aura.house; h.goRoom('living', true); h.setListening(true); });
  await wait(1800);
  await shot('b-listening-moment');
  await wait(2500);
  await shot('b-listening');
  report('listening', await H(() => { const h = window.aura.house; return { listening: h.listening, playing: h.studio.engine.playing, mood: h.lighting.override, pace: h.player.pace, bodyClass: document.body.classList.contains('listening') }; }));
  await page.keyboard.press('KeyL');
  await wait(900);
  report('listening off (L key)', await H(() => { const h = window.aura.house; return { listening: h.listening, playing: h.studio.engine.playing, mood: h.lighting.override }; }));
  await H(() => window.aura.playback.pause());

  // ——— The console game on the wall ———
  await H(() => window.aura.house.console.enter());
  await wait(2200);
  await shot('b-console-enter');
  await page.mouse.move(720, 400);
  await page.mouse.click(720, 400);
  await wait(400);
  await page.keyboard.down('ArrowRight');
  await wait(700);
  await page.keyboard.up('ArrowRight');
  await wait(1500);
  await shot('b-console-playing');
  const game = await H(() => { const g = window.aura.game, h = window.aura.house; return { running: g.running, inWorld: g.inWorld, score: g.state.score, paddle: +g.state.paddle.toFixed(2), ballY: +g.state.ball.y.toFixed(2), focused: h.interaction.focused?.name, custom: !!h.architecture.wallScreen.custom }; });
  report('console', game);
  await page.mouse.move(300, 400);
  await wait(600);
  report('console paddle follows', await H(() => +window.aura.game.state.target.toFixed(2)));
  await page.mouse.move(1150, 400);
  await wait(600);
  report('console paddle follows', await H(() => +window.aura.game.state.target.toFixed(2)));
  await page.keyboard.press('Escape');
  await wait(1400);
  report('console left', await H(() => { const g = window.aura.game, h = window.aura.house; return { running: g.running, inWorld: g.inWorld, focused: h.interaction.focused?.name || null, custom: !!h.architecture.wallScreen.custom }; }));
  await shot('b-console-after');
};
