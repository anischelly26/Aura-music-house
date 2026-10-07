// The command list, by keyboard: a command chosen with Enter must leave the sheet it opens open.
module.exports = async ({ page, wait, boot }) => {
  await boot();
  const open = () => page.evaluate(() => document.querySelector('dialog[open]')?.id || null);
  for (const query of ['Keep a version', 'Go to Mixing', 'Listening mode']) {
    await page.evaluate(() => { window.__closed = []; for (const d of document.querySelectorAll('dialog')) d.addEventListener('close', () => window.__closed.push(d.id), { once: true }); });
    await page.keyboard.press('Control+k');
    await wait(400);
    const palette = await open();
    await page.keyboard.type(query);
    await wait(250);
    const first = await page.evaluate(() => document.querySelector('#commandResults button')?.textContent);
    await page.keyboard.press('Enter');
    await wait(900);
    console.log(query.padEnd(16), JSON.stringify({ palette, first, after: await open(), closed: await page.evaluate(() => window.__closed), mode: await page.evaluate(() => window.aura.house.mode), listening: await page.evaluate(() => window.aura.house.listening), room: await page.evaluate(() => window.aura.house.currentRoom) }));
    await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); window.aura.house.setListening(false); });
    await wait(300);
  }
};
