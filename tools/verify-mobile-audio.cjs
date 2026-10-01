// Trusted touch input and real Web Audio samples. The iOS session contract is
// simulated separately: Chromium cannot verify an iPhone's physical speaker.
const {chromium} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright' : 'playwright');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'docs/mobile-audio');
const artifacts = path.join(root, 'artifacts/mobile-audio');
const url = 'http://127.0.0.1:4325/dist/index.html';
let server, browser;
(async () => {
  fs.mkdirSync(output, {recursive:true});
  fs.mkdirSync(artifacts, {recursive:true});
  server = spawn(process.execPath, ['server.mjs'], {cwd:root, env:{...process.env,PORT:'4325'}, stdio:'ignore'});
  let ready = false;
  for(let i=0;i<80;i++) {try {if((await fetch(url)).ok) {ready=true;break;}} catch {} await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready, 'Owned test server started');
  browser = await chromium.launch({...(process.env.AURA_CHROMIUM_PATH ? {executablePath:process.env.AURA_CHROMIUM_PATH} : {}), headless:true, args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=document-user-activation-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const errors = [], measurements = {};
  async function load(target=url, sessionFixture=false, mobile=true) {
    const context = await browser.newContext({viewport:{width:mobile?390:1440,height:mobile?844:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
    await context.addInitScript(({sessionFixture}) => {
      localStorage.setItem('aura-intro','off');localStorage.setItem('aura-house-quality','performance');
      if(sessionFixture) {
        // Model iOS's requirement to select playback. The audio graph remains
        // native; this fixture prevents resume until the app selects a session.
        let type='auto';window.sessionChanges=[];
        const session={get type(){return type;},set type(value){type=value;sessionChanges.push(value);}};
        Object.defineProperty(navigator,'audioSession',{value:session,configurable:true});
        const Original=AudioContext;
        window.AudioContext=class extends Original {
          resume(){return ['playback','play-and-record'].includes(session.type)?super.resume():Promise.resolve();}
        };
      }
    },{sessionFixture});
    const page = await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(target);
    const cd = await context.newCDPSession(page);
    for(let i=0;i<100;i++) {
      const loaded=await cd.send('Runtime.evaluate',{expression:'!!window.aura?.house',returnByValue:true,userGesture:false});
      if(loaded.result.value)break;
      await new Promise(r=>setTimeout(r,100));
    }
    // Imported projects can create a context before any user gesture. Keep
    // autoplay restrictions enabled and create this one without a gesture.
    const state = await cd.send('Runtime.evaluate',{expression:'aura.engine.init(false).then(ctx=>ctx.state)',awaitPromise:true,returnByValue:true,userGesture:false});
    assert.equal(state.result.value,'suspended','Restoring assets does not autoplay');
    await cd.send('Runtime.evaluate',{expression:'('+(()=>{
      aura.house.renderer?.setAnimationLoop(null);
      const e=aura.engine;window.outputProbe=e.ctx.createAnalyser();outputProbe.fftSize=2048;
      const zero=e.ctx.createGain();zero.gain.value=0;
      e.monitorStereo.connect(outputProbe).connect(zero).connect(e.ctx.destination);
    }).toString()+')()',userGesture:false});
    return {context,page,cd};
  }
  async function sound(page,label,min=.002) {
    let peak=0,rms=0;
    for(let i=0;i<15;i++) {
      await page.waitForTimeout(60);
      const sample=await page.evaluate(()=>{const d=new Float32Array(outputProbe.fftSize);outputProbe.getFloatTimeDomainData(d);return {peak:Math.max(...d.map(Math.abs)),rms:Math.sqrt(d.reduce((a,x)=>a+x*x,0)/d.length),state:aura.engine.ctx.state};});
      assert.equal(sample.state,'running',label+' runs the audio clock');
      peak=Math.max(peak,sample.peak);rms=Math.max(rms,sample.rms);
    }
    assert.ok(rms>min,label+' produces real samples after the monitoring gain: '+rms);
    measurements[label]={peak,rms};
  }
  const {page,context,cd}=await load();
  // No UI gesture: startup fails visibly instead of hanging or claiming Play.
  const denied=await cd.send('Runtime.evaluate',{expression:'aura.engine.play(aura.store.project).then(()=>"unexpected playback",e=>e.message)',awaitPromise:true,returnByValue:true,userGesture:false});
  assert.match(denied.result.value,/Tap Listen or Play/);
  const stopped=await cd.send('Runtime.evaluate',{expression:'aura.engine.playing',returnByValue:true,userGesture:false});
  assert.equal(stopped.result.value,false);
  await page.locator('#housePlay').tap();
  await sound(page,'phone listen');
  await page.locator('#houseStop').tap();
  await page.waitForTimeout(150);
  await page.evaluate(()=>aura.workbench.open('voice'));
  await page.locator('#wbAudition').tap();await sound(page,'piano audition');
  await page.waitForTimeout(1800);
  await page.locator('#wbVoice').selectOption('lead');
  await page.locator('#wbAudition').tap();await sound(page,'synth audition');
  await page.waitForTimeout(1800);
  await page.locator('#wbVoice').selectOption('drums');
  await page.locator('#wbAudition').tap();await sound(page,'drum audition');
  await page.waitForTimeout(1800);
  await page.locator('#wbVoice').selectOption('keys');
  const key=page.locator('[data-live-key="0"]');await key.scrollIntoViewIfNeeded();
  const box=await key.boundingBox(),point={x:box.x+box.width/2,y:box.y+box.height/2,id:1};
  await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await sound(page,'held piano key');
  await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>aura.workbench.performance.held.size===0);
  await page.locator('#wbClose').tap();
  await page.locator('#housePlay').tap();await page.waitForTimeout(250);
  await page.evaluate(async()=>{
    const ctx=aura.engine.ctx,native=Object.getOwnPropertyDescriptor(BaseAudioContext.prototype,'state').get;
    Object.defineProperty(ctx,'state',{configurable:true,get(){return native.call(ctx)==='suspended'?'interrupted':native.call(ctx);}});
    await ctx.suspend();
  });
  await page.waitForFunction(()=>!aura.engine.playing);
  const interruptedBeat=await page.evaluate(()=>aura.engine.position);
  assert.ok(interruptedBeat>0);assert.equal(await page.locator('#audioState').textContent(),'TAP PLAY FOR SOUND');
  await page.evaluate(()=>delete aura.engine.ctx.state);
  await page.locator('#housePlay').tap();await sound(page,'resume after interruption');
  assert.ok(await page.evaluate(beat=>aura.engine.beat>=beat,interruptedBeat));
  await page.locator('#houseStop').tap();
  // A resume promise that resolves while still interrupted must not schedule.
  await page.evaluate(async()=>{const e=aura.engine;await e.ctx.suspend();e.savedResume=e.ctx.resume;e.ctx.resume=()=>Promise.resolve();});
  await page.locator('#housePlay').tap();
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Tap Listen or Play'));
  assert.equal(await page.evaluate(()=>aura.engine.playing),false);
  await page.evaluate(()=>{const e=aura.engine;e.ctx.resume=e.savedResume;});
  await page.locator('#housePlay').tap();await sound(page,'retry blocked sound');
  await page.evaluate(()=>{const h=aura.house;h.renderer.render(h.scene,h.camera);h.openDialog('houseSettings');});
  await page.screenshot({path:path.join(artifacts,'phone-sound-settings.png')});
  await context.close();

  const ios=await load(url,true);
  await ios.page.locator('#housePlay').tap();await sound(ios.page,'iOS session fixture listen');
  assert.equal(await ios.page.evaluate(()=>navigator.audioSession.type),'playback');
  await ios.page.locator('#houseStop').tap();
  await ios.page.evaluate(()=>aura.house.openDialog('recordPanel'));
  await ios.page.locator('#beginRecording').tap();
  await ios.page.waitForFunction(()=>aura.recording.active);
  assert.equal(await ios.page.evaluate(()=>navigator.audioSession.type),'play-and-record');
  await ios.page.evaluate(()=>aura.engine.audition(aura.store.project.tracks[0],60));
  assert.equal(await ios.page.evaluate(()=>navigator.audioSession.type),'play-and-record','Playing notes does not disable the microphone session');
  await ios.page.waitForTimeout(700);
  await ios.page.locator('#stopRecording').tap();
  await ios.page.waitForFunction(()=>!aura.recording.saving&&!aura.recording.active&&aura.engine.assets.size>0);
  assert.equal(await ios.page.evaluate(()=>navigator.audioSession.type),'playback');
  const take=await ios.page.evaluate(()=>{const b=[...aura.engine.assets.values()][0],d=b.getChannelData(0);return {duration:b.duration,peak:Math.max(...d.slice(0,100000).map(Math.abs))};});
  assert.ok(take.duration>.5&&take.peak>.01,'Recorded take contains native fake-device audio');measurements['microphone take']=take;
  await ios.page.evaluate(()=>aura.house.openDialog('recordPanel'));
  await ios.page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Microphone permission denied','NotAllowedError'));});
  await ios.page.locator('#beginRecording').tap();
  await ios.page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Microphone permission denied'));
  assert.equal(await ios.page.evaluate(()=>navigator.audioSession.type),'playback','Denied permission restores music output');
  assert.equal(await ios.page.evaluate(()=>!!aura.engine.captureActive||aura.recording.starting),false);
  await ios.page.evaluate(()=>aura.workbench.open('export'));
  const downloadPromise=ios.page.waitForEvent('download');await ios.page.locator('#wbExportMaster').tap();
  const download=await downloadPromise;await download.saveAs(path.join(artifacts,'phone-master.wav'));
  const wav=fs.readFileSync(path.join(artifacts,'phone-master.wav'));assert.equal(wav.toString('ascii',0,4),'RIFF');
  let max=0;for(let i=44;i<wav.length;i+=3){let v=wav.readUIntLE(i,3);if(v&0x800000)v-=0x1000000;max=Math.max(max,Math.abs(v)/8388608);}
  assert.ok(max>.01);measurements['export master']={bytes:wav.length,peak:max};
  const sessionChanges=await ios.page.evaluate(()=>sessionChanges);
  await ios.context.close();

  for(const [target,mobile,label] of [['http://127.0.0.1:4325/AURA.html',true,'portable phone'],[url,false,'desktop']]) {
    const other=await load(target,false,mobile);
    await other.page.locator('#housePlay')[mobile?'tap':'click']();await sound(other.page,label);
    await other.context.close();
  }
  assert.deepEqual(errors,[]);
  const report={browser:browser.version(),autoplay:'document-user-activation-required',viewport:'390x844',measurements,sessionChanges,checks:['trusted touch starts playback from a suspended restored context','startup without user activation times out with a retry prompt','piano, synth, drums and held notes produce post-monitor samples','interrupted transport pauses and resumes from its position','resolved but blocked resume never claims playback','playback session selected for music; play-and-record for microphone','microphone denied and completed paths restore playback','WAV export contains nonzero PCM','portable file and desktop playback work'],limitations:['Chromium touch emulation; physical iPhone/Android speaker output remains unverified','iOS session and interrupted state use explicit fixtures; the audio rendering and microphone capture are native'],pageErrors:errors};
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.kill();});
