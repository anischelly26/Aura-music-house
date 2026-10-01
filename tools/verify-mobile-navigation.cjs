// Real Chromium touch events against the built house, including two simultaneous fingers.
const {chromium} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright' : 'playwright');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'docs/mobile-navigation');
const url = 'http://127.0.0.1:4324/dist/index.html';
let server, browser;
(async () => {
  fs.mkdirSync(output, {recursive:true});
  server = spawn(process.execPath, ['server.mjs'], {cwd:root, env:{...process.env,PORT:'4324'}, stdio:'ignore'});
  let ready = false;
  for(let i=0;i<80;i++) {try {if((await fetch(url)).ok) {ready=true;break;}} catch {} await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready, 'Owned test server started');
  browser = await chromium.launch({...(process.env.AURA_CHROMIUM_PATH ? {executablePath:process.env.AURA_CHROMIUM_PATH} : {}), headless:true, args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await context.addInitScript(() => {localStorage.setItem('aura-intro','off');localStorage.setItem('aura-house-quality','performance');});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e=>errors.push(e.message));
  async function load(p, target=url) {
    await p.goto(target);
    await p.waitForFunction(()=>window.aura?.house?.renderer);
    await p.evaluate(()=>aura.house.renderer.setAnimationLoop(null));
    await p.evaluate(()=>aura.house.modelsReady);
    await p.evaluate(()=>{const h=aura.house;h.goRoom('gallery',true);h.camera.position.set(3,1.72,27);h.lookAt(3,1.72,23);h.camera.updateMatrixWorld();h.renderer.render(h.scene,h.camera);});
  }
  await load(page);
  assert.equal(await page.locator('#touchMovePad').isVisible(),true);
  const cd = await context.newCDPSession(page);
  const touch = (type, touchPoints) => cd.send('Input.dispatchTouchEvent', {type,touchPoints});
  const pos = () => page.evaluate(()=>({x:aura.house.camera.position.x,z:aura.house.camera.position.z}));
  const advance = seconds => page.evaluate(seconds=>{for(let i=0;i<seconds*60;i++)aura.house.move(1/60);},seconds);
  const resetPosition = () => page.evaluate(()=>{const h=aura.house;h.goRoom('gallery',true);h.camera.position.set(3,1.72,27);h.lookAt(3,1.72,23);});
  let point;
  async function hold(dx,dy) {
    const box=await page.locator('#touchMovePad').boundingBox();
    point={x:box.x+box.width/2,y:box.y+box.height/2,id:1};
    await touch('touchStart',[point]);point={...point,x:point.x+dx,y:point.y+dy};
    await touch('touchMove',[point]);
    await page.waitForFunction(()=>Math.hypot(aura.house.touchControls.forward,aura.house.touchControls.strafe)>.8);
  }
  await hold(0,-38);
  const before=await pos();await advance(1);const after=await pos();
  assert.ok(before.z-after.z>2.9,'Holding the thumb control walks forward');
  const yaw=await page.evaluate(()=>aura.house.lookYaw);
  let look={x:270,y:290,id:2};await touch('touchStart',[point,look]);
  look={...look,x:330,y:270};await touch('touchMove',[point,look]);
  await page.waitForFunction(yaw=>Math.abs(aura.house.lookYaw-yaw)>.1,yaw,{timeout:3000}).catch(async error=>{console.log('Look state',JSON.stringify(await page.evaluate(()=>({drag:aura.house.drag,yaw:aura.house.lookYaw,input:{f:aura.house.touchControls.forward,id:aura.house.touchControls.pointerId},target:document.elementFromPoint(270,290)?.id,dialogs:[...document.querySelectorAll('dialog[open]')].map(x=>x.id)}))));throw error;});
  assert.ok(Math.abs((await page.evaluate(()=>aura.house.lookYaw))-yaw)>.1,'Second finger turns while walking');
  assert.ok(await page.evaluate(()=>aura.house.touchControls.forward>.9));
  await advance(.5);
  await touch('touchEnd',[point]);
  assert.deepEqual(await page.evaluate(()=>({f:aura.house.touchControls.forward,s:aura.house.touchControls.strafe})),{f:0,s:0});
  assert.ok(await page.evaluate(()=>aura.house.drag),'Looking finger remains active after walking finger releases');
  await touch('touchEnd',[]);await advance(2);const stopped=await pos();await advance(1);
  assert.ok(Math.hypot(stopped.x-(await pos()).x,stopped.z-(await pos()).z)<.001,'Released movement stops');
  assert.equal(await page.evaluate(()=>aura.house.journey),null);

  await resetPosition();
  await hold(38,0);const side=await pos();await advance(1);
  assert.ok((await pos()).x-side.x>2.9,'Thumb control strafes');
  await touch('touchCancel',[]);
  assert.equal(await page.evaluate(()=>aura.house.touchControls.strafe),0);

  await resetPosition();
  await hold(30,-30);const diagonal=await pos();await advance(1);const diagonalEnd=await pos();
  const diagonalDistance=Math.hypot(diagonalEnd.x-diagonal.x,diagonalEnd.z-diagonal.z);
  assert.ok(diagonalDistance>2.9&&diagonalDistance<3.35,'Diagonal input does not boost walking speed');
  await touch('touchEnd',[]);

  await resetPosition();
  await hold(0,38);await advance(12);const collision=await page.evaluate(()=>{const h=aura.house;return {walkable:h.architecture.canWalk(h.camera.position.x,h.camera.position.z),z:h.camera.position.z};});
  assert.equal(collision.walkable,true);assert.ok(collision.z<35,'Touch movement obeys the house boundary');
  await touch('touchEnd',[]);

  await resetPosition();
  await hold(0,-38);await page.locator('#houseMapButton').click();
  assert.ok(await page.locator('#roomMap').isVisible());assert.equal(await page.locator('#touchMovePad').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>({f:aura.house.touchControls.forward,s:aura.house.touchControls.strafe,v:aura.house.velocity.length()})),{f:0,s:0,v:0});
  const inDialog=await pos();await advance(1);assert.deepEqual(await pos(),inDialog);
  await touch('touchEnd',[]);await page.locator('[data-house-close="roomMap"]').click();
  assert.equal(await page.locator('#touchMovePad').isVisible(),true);

  await hold(0,-38);await page.locator('#houseModeButton').click();
  assert.equal(await page.evaluate(()=>aura.house.mode),'production');assert.equal(await page.locator('#touchMovePad').isVisible(),false);
  assert.equal(await page.evaluate(()=>aura.house.touchControls.forward),0);
  await touch('touchEnd',[]);await page.locator('#houseModeButton').click();
  assert.equal(await page.locator('#touchMovePad').isVisible(),true);

  await hold(0,-38);await page.setViewportSize({width:844,height:390});
  assert.equal(await page.evaluate(()=>aura.house.touchControls.forward),0,'Orientation change releases held controls');
  await touch('touchEnd',[]);
  for(const [width,height] of [[390,844],[320,568],[844,390]]) {
    await page.setViewportSize({width,height});
    await page.waitForFunction(()=>aura.house.camera.aspect===innerWidth/innerHeight);
    await page.evaluate(()=>{const h=aura.house;h.goRoom('gallery',true);h.camera.updateMatrixWorld();h.renderer.setAnimationLoop(()=>h.renderer.render(h.scene,h.camera));});
    const geometry=await page.evaluate(()=>{const pad=document.querySelector('#touchMovePad').getBoundingClientRect(),action=document.querySelector('#touchInteract').getBoundingClientRect(),editorial=document.querySelector('.roomEditorial').getBoundingClientRect();return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,pad:pad.toJSON(),action:action.toJSON(),editorial:editorial.toJSON()};});
    assert.ok(geometry.scrollWidth<=width+1);
    for(const box of [geometry.pad,geometry.action])assert.ok(box.left>=0&&box.right<=width&&box.top>=0&&box.bottom<=height&&box.height>=44);
    const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    assert.equal(overlap(geometry.pad,geometry.editorial),false,'Room tools do not cover movement');
    await page.screenshot({path:path.join(output,'phone-'+width+'.png'),timeout:60000});
    await page.evaluate(()=>aura.house.renderer.setAnimationLoop(null));
  }
  await page.setViewportSize({width:320,height:568});
  for(const id of ['gallery','idea','instrument','rhythm','record','arrange','living','master','terrace']) {
    await page.evaluate(id=>aura.house.goRoom(id,true),id);
    const bounds=await page.locator('.roomEditorial').boundingBox();
    assert.ok(bounds.y>=80,'Each room title remains below the phone navigation');
  }
  const offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));
  await load(offline,'file://'+path.join(root,'AURA.html'));
  assert.equal(await offline.locator('#touchMovePad').isVisible(),true);
  assert.equal(await offline.evaluate(()=>aura.house.models.loaded.length),5);

  const desktop=await browser.newContext({viewport:{width:1440,height:900},hasTouch:false});
  await desktop.addInitScript(()=>{localStorage.setItem('aura-intro','off');localStorage.setItem('aura-house-quality','performance');});
  const dp=await desktop.newPage();dp.on('pageerror',e=>errors.push(e.message));await load(dp);
  assert.equal(await dp.locator('#touchMovePad').isVisible(),false);
  await dp.keyboard.down('w');const desktopWalk=await dp.evaluate(()=>{const h=aura.house,z=h.camera.position.z;for(let i=0;i<60;i++)h.move(1/60);return z-h.camera.position.z;});await dp.keyboard.up('w');assert.ok(desktopWalk>2.9);
  assert.deepEqual(errors,[]);
  const result={forwardDistance:before.z-after.z,simultaneousWalkAndLook:true,releaseStops:true,cancelStops:true,diagonalDistance,collision,dialogsSuspend:true,productionSuspends:true,orientationResets:true,viewports:[[390,844],[320,568],[844,390]],portableTouch:true,desktopKeyboardDistance:desktopWalk,pageErrors:errors};
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.kill();});
