// Frame rate with the music playing, and the cost of the first look at each room.
// Headless requestAnimationFrame is not capped at the display rate, so readings above 60 are real headroom.
// PLAY=0 measures in silence. Q=low|medium|high|ultra fixes the preset.
module.exports = async ({ page, boot }) => {
  await boot({ settle: 4000 });
  if (process.env.PLAY !== "0") await page.evaluate(() => window.aura.house.play());
  console.log(await page.evaluate(() => { const h = window.aura.house, gl = h.renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info"); return (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown gpu") + " · preset " + h.performance.name + (h.performance.auto ? " (auto)" : "") + " · " + innerWidth + "x" + innerHeight; }));
  // Each room entered for the first time: the worst of its first forty frames, and how many shader programs exist afterwards.
  // The program count should not grow from room to room; if it does, something is being compiled at a doorway.
  console.log("FIRST VISIT\n" + (await page.evaluate(async () => {
    const h = window.aura.house, out = [];
    for (const id of ["living", "terrace", "master", "rhythm", "instrument", "record", "arrange", "idea", "gallery"]) {
      h.goRoom(id, true);
      let worst = 0, last = performance.now(), frames = 0;
      await new Promise((resolve) => { const tick = () => { const now = performance.now(); if (frames > 0) worst = Math.max(worst, now - last); last = now; if (++frames < 40) requestAnimationFrame(tick); else resolve(); }; requestAnimationFrame(tick); });
      out.push(`${id.padEnd(11)} worst frame ${String(Math.round(worst)).padStart(4)} ms   programs ${h.renderer.info.programs.length}   textures ${h.renderer.info.memory.textures}`);
    }
    return out.join("\n");
  })));
  // Then a steady reading from each room's arrival view, and from the three places people stand longest in the living room.
  const spots = await page.evaluate(async () => { const { rooms, views } = await import("/src/house/layout.js"); return rooms.map((r) => [r.name, ...views[r.id]]); });
  spots.push(["Living room, at the desk", 6.6, -4.9, 8.2, 0.9, -4.9], ["Living room, on the sofa", 0.1, 5.2, 0.1, 0.4, -5], ["Living room, from the steps", 5.6, 7.4, -1, 0.9, -1.5]);
  console.log("STEADY");
  for (const [name, x, z, lx, ly, lz] of spots) {
    console.log(await page.evaluate(async ({ name, x, z, lx, ly, lz }) => {
      const h = window.aura.house;
      h.player.place(x, z); h.lookAt(lx, ly, lz); h.roomSet = false; h.setRoom((await import("/src/house/layout.js")).roomAt(x, z).id);
      await new Promise((r) => setTimeout(r, 1500));
      const times = []; let last = performance.now(); const start = last;
      await new Promise((resolve) => { const tick = () => { const now = performance.now(); times.push(now - last); last = now; if (now - start < 3000) requestAnimationFrame(tick); else resolve(); }; requestAnimationFrame(tick); });
      times.sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / times.length, info = h.renderer.info.render;
      return `${name.padEnd(28)} ${(1000 / mean).toFixed(0).padStart(3)} fps   95th percentile frame ${times[Math.floor(times.length * 0.95)].toFixed(0).padStart(3)} ms   ${String(info.calls).padStart(3)} draws  ${String(Math.round(info.triangles / 1000)).padStart(3)}k triangles   ${h.renderer.getPixelRatio().toFixed(2)}×  ${h.performance.name}`;
    }, { name, x, z, lx, ly, lz }));
  }
};
