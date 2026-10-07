// The four graphics presets, switched live: does each render without a GL error, and does the bloom pass of HIGH and ULTRA hold up
// at an instrument, on the terrace and at midnight?
module.exports = async ({ page, shot, wait, boot }) => {
  await boot();
  const info = await page.evaluate(() => { const h = window.aura.house; return { preset: h.performance.name, auto: h.performance.auto, finish: !!h.finish, pr: h.renderer.getPixelRatio() }; });
  console.log('start', JSON.stringify(info));
  await page.evaluate(() => window.aura.house.goRoom('living', true));
  await wait(1500);
  await shot('a-medium-living');
  for (const q of ['high', 'ultra', 'low', 'medium']) {
    const line = await page.evaluate(async (q) => {
      const h = window.aura.house;
      h.performance.set(q);
      await new Promise(r => setTimeout(r, 2500));
      let frames = 0, worst = 0; const start = performance.now(); let last = start;
      await new Promise(resolve => { const tick = (t) => { frames++; worst = Math.max(worst, t - last); last = t; if (t - start < 2500) requestAnimationFrame(tick); else resolve(); }; requestAnimationFrame(tick); });
      const gl = h.renderer.getContext();
      return `${q.padEnd(7)} finish=${!!h.finish} ${(frames * 1000 / (performance.now() - start)).toFixed(0)} fps worst ${worst.toFixed(0)} ms pr ${h.renderer.getPixelRatio().toFixed(2)} glError=${gl.getError()}`;
    }, q);
    console.log(line);
    await shot('a-' + q + '-living');
    if (q === 'high') {
      await page.evaluate(() => window.aura.house.drums.enter());
      await wait(1800);
      await shot('a-high-focus-drums');
      await page.evaluate(() => window.aura.house.blur(true));
      await page.evaluate(() => window.aura.house.goRoom('terrace', true));
      await wait(1500);
      await shot('a-high-terrace');
      await page.evaluate(() => window.aura.house.lighting.setMood('midnight'));
      await page.evaluate(() => window.aura.house.goRoom('living', true));
      await wait(4500);
      await shot('a-high-midnight-living');
      await page.evaluate(() => { window.aura.house.lighting.setMood('create'); window.aura.house.lighting.setSky('day'); });
      await wait(3500);
    }
  }
};
