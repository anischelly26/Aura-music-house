const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.AURA_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-webgl','--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage();await page.goto('http://localhost:3000/');await page.waitForFunction(()=>aura?.engine);
 const results=await page.evaluate(async()=>{
  const {AudioEngine}=await import('/src/audio.js'),{AudioEngine:Before}=await import('/artifacts/audit-before-audio.js'),{newProject,makeTrack,makeClip}=await import('/src/project.js');
  const results=[];
  for(const [name,Engine]of [['before',Before],['after',AudioEngine]]){
   const engine=new Engine();await engine.init();const ctx=engine.ctx,p=newProject(true);p.bars=1;p.bpm=240;const t=makeTrack('audio');t.reverb=0;t.clips=[{...makeClip('Loop',0,4),asset:'loop',offset:0}];p.tracks=[t];
   const buffer=ctx.createBuffer(2,ctx.sampleRate*2,ctx.sampleRate);for(let ch=0;ch<2;ch++)buffer.getChannelData(ch).fill(.5);engine.assets.set('loop',buffer);
   const url=URL.createObjectURL(new Blob([`class LoopCapture extends AudioWorkletProcessor{process(inputs){if(inputs[0]?.[0])this.port.postMessage({frame:currentFrame,samples:inputs[0][0].slice()});return true;}}registerProcessor('loop-capture',LoopCapture);`],{type:'text/javascript'}));await ctx.audioWorklet.addModule(url);URL.revokeObjectURL(url);
   const capture=new AudioWorkletNode(ctx,'loop-capture'),packets=[];capture.port.onmessage=e=>packets.push(e.data);engine.output.connect(capture);capture.connect(ctx.destination);
   await engine.play(p);const first=engine.origin,boundary=(first+1)*ctx.sampleRate;for(let i=0;i<300;i++){await new Promise(r=>setTimeout(r,20));if(engine.origin!==first)break;}const second=engine.origin;
   for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,20));if(ctx.currentTime>second+.2)break;}engine.stop();await new Promise(r=>setTimeout(r,80));let zeros=0,samples=0,peak=0;
   for(const packet of packets)for(let i=0;i<packet.samples.length;i++){if(Math.abs(packet.frame+i-boundary)<ctx.sampleRate*.08){samples++;const v=Math.abs(packet.samples[i]);if(v<.001)zeros++;peak=Math.max(peak,v);}}
   results.push({name,cycleSeconds:1,restartGapMs:(second-first-1)*1000,boundarySamples:samples,silentBoundarySamples:zeros,boundaryPeak:peak});capture.disconnect();await ctx.close();
  }return results;
 });
 fs.writeFileSync(path.resolve(__dirname,'../docs/audit-2026-10-01/loop-measurements.json'),JSON.stringify(results,null,2));console.log(results);
 if(process.env.AURA_ASSERT_LOOP){assert.ok(results[0].restartGapMs>=40);assert.ok(Math.abs(results[1].restartGapMs)<.001);assert.ok(results.every(r=>r.boundarySamples>4000&&r.boundaryPeak>.1));assert.ok(results[1].silentBoundarySamples<5);}
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
