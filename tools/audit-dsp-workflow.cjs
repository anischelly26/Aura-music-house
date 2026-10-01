const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=path.resolve(__dirname,'../docs/audit-2026-10-01');
const artifacts=path.resolve(__dirname,'../artifacts');fs.mkdirSync(artifacts,{recursive:true});fs.mkdirSync(out,{recursive:true});
const baseline=require('node:child_process').execFileSync('git',['show','1a9ae64646204ae32b8805d891218bbd7c6f6666:src/audio.js'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'}).replaceAll('./effects.js','/src/effects.js').replaceAll('./storage.js','/src/storage.js');
fs.writeFileSync(path.join(artifacts,'audit-before-audio.js'),baseline);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.AURA_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-webgl','--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const page=await browser.newPage({viewport:{width:1366,height:900},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:3000/'+(process.env.AURA_AUDIT_BUILT?'dist/index.html':''));await page.waitForFunction(()=>window.aura?.workbench);
 const report={};
 report.lens=await page.locator('#lensContent').innerText();assert.match(report.lens,/fit the project scale/);
 report.dsp=await page.evaluate(async()=>{
  const {AudioEngine}=await import('/src/audio.js'),{AudioEngine:BeforeEngine}=await import('/artifacts/audit-before-audio.js'),{newProject,makeTrack,makeClip}=await import('/src/project.js');
  const probes=[];
  for(const [name,Engine]of [['before',BeforeEngine],['after',AudioEngine]]){
   const engine=new Engine();await engine.init();engine.loop=false;const ctx=engine.ctx,p=newProject(true);p.bars=8;p.bpm=120;
   const t=makeTrack('audio');t.reverb=0;t.gain=.65;t.clips=[{...makeClip('Probe',0,32),asset:'probe',offset:0}];p.tracks=[t];
   const anti=ctx.createBuffer(2,ctx.sampleRate*16,ctx.sampleRate);
   for(let i=0;i<anti.length;i++){const x=Math.sin(2*Math.PI*1000*i/ctx.sampleRate)*.2;anti.getChannelData(0)[i]=x;anti.getChannelData(1)[i]=-x;}
   engine.assets.set('probe',anti);await engine.play(p);
   let meter;for(let attempt=0;attempt<200;attempt++){await new Promise(r=>setTimeout(r,20));meter=engine.metrics();if(ctx.currentTime>engine.origin+.25&&meter.rms>.04)break;}
   const track=meter.tracks.get(t.id);
   const result={name,antiPhaseMasterRms:meter.rms,antiPhaseTrackRms:track.rms,spectrumPeak:Math.max(...meter.spectrum),centroid:track.centroid,correlation:meter.correlation};engine.stop();
   const url=URL.createObjectURL(new Blob([`class AuditCapture extends AudioWorkletProcessor{process(inputs){if(inputs[0]?.[0])this.port.postMessage({frame:currentFrame,samples:inputs[0][0].slice()});return true;}}registerProcessor('audit-capture',AuditCapture);`],{type:'text/javascript'}));
   await ctx.audioWorklet.addModule(url);URL.revokeObjectURL(url);const recorder=new AudioWorkletNode(ctx,'audit-capture'),packets=[];recorder.port.onmessage=e=>packets.push(e.data);engine.output.connect(recorder);recorder.connect(ctx.destination);
   const constant=ctx.createBuffer(2,ctx.sampleRate*16,ctx.sampleRate);for(let ch=0;ch<2;ch++)constant.getChannelData(ch).fill(.5);
   engine.assets.set('probe',constant);await engine.play(p);for(let attempt=0;attempt<200;attempt++){await new Promise(r=>setTimeout(r,20));if(ctx.currentTime>engine.origin+.2&&engine.metrics().rms>.2)break;}const stopFrame=Math.floor(ctx.currentTime*ctx.sampleRate);engine.stop();await new Promise(r=>setTimeout(r,180));
   let previous=0,maxStep=0,prePeak=0,postPeak=0,windowSamples=0;for(const packet of packets)for(let i=0;i<packet.samples.length;i++){const frame=packet.frame+i,x=packet.samples[i];if(Math.abs(frame-stopFrame)<ctx.sampleRate*.05){maxStep=Math.max(maxStep,Math.abs(x-previous));windowSamples++;if(frame<stopFrame)prePeak=Math.max(prePeak,Math.abs(x));else if(frame>stopFrame+ctx.sampleRate*.025)postPeak=Math.max(postPeak,Math.abs(x));}previous=x;}
   result.stopDiscontinuity=maxStep;result.stopWindowSamples=windowSamples;result.stopPrePeak=prePeak;result.stopPostPeak=postPeak;probes.push(result);recorder.disconnect();await ctx.close();
  }
  return probes;
 });
 console.log('DSP probe evidence',JSON.stringify(report.dsp));fs.writeFileSync(path.join(out,'dsp-probes.json'),JSON.stringify(report.dsp,null,2));
 assert.ok(report.dsp[0].antiPhaseMasterRms>.01);assert.ok(report.dsp[0].antiPhaseTrackRms<1e-5);assert.equal(report.dsp[0].spectrumPeak,0);
 assert.ok(report.dsp[1].antiPhaseTrackRms>.05);assert.ok(report.dsp[1].spectrumPeak>100);assert.ok(Math.abs(report.dsp[1].centroid-1000)<100);
 assert.ok(report.dsp.every(x=>x.stopWindowSamples>2000&&x.stopPrePeak>.1&&x.stopPostPeak<.001),'AudioWorklet must capture audible signal and the stopped output');
 assert.ok(report.dsp[0].stopDiscontinuity>.1);assert.ok(report.dsp[1].stopDiscontinuity<.01);
 console.log('Measured real-time stereo cancellation and stop transition',report.dsp);
 await page.click('#productionWorkbenchButton');await page.click('[data-wbtab="voice"]');await page.selectOption('#wbVoice','organ');await page.keyboard.down('a');await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>aura.workbench.performance.held.size),1);await page.keyboard.up('a');
 await page.click('#wbCapture');await page.waitForTimeout(2250);await page.keyboard.down('a');await page.waitForTimeout(200);await page.keyboard.up('a');await page.click('#wbCaptureStop');
 assert.ok(await page.evaluate(()=>aura.store.project.tracks[0].clips[0].notes.some(n=>n.pitch===60&&n.start<2&&n.duration<1)));
 await page.click('[data-wbtab="effects"]');for(const fx of ['eq','compressor','delay','saturation','chorus','tremolo','filter','width']){await page.selectOption('#wbEffectType',fx);await page.click('#wbAddEffect');}
 assert.equal(await page.evaluate(()=>aura.store.project.tracks[0].inserts.length),8);await page.click('#wbSaveChain').catch(()=>{});await page.fill('#wbChainName','Audit chain');await page.click('#wbSaveChain');await page.click('#wbLoadChain');
 report.effectBypass=await page.evaluate(async()=>{const {makeTrack,makeClip}=await import('/src/project.js'),{makeEffect}=await import('/src/effects.js'),{measureBuffer}=await import('/src/analysis.js');const t=makeTrack('keys');t.reverb=0;const c=makeClip('Tone',0,1);c.notes=[{id:'n',pitch:60,start:0,duration:.5,velocity:.7}];t.clips=[c];const p={bpm:120,bars:1,master:.7,swing:0,tracks:[t],assets:{}},dry=measureBuffer(await aura.engine.render(p)).rms,results=[];for(const type of ['eq','compressor','delay','saturation','chorus','tremolo','filter','width']){const fx=makeEffect(type);t.inserts=[fx];const wet=measureBuffer(await aura.engine.render(p));fx.enabled=false;const bypass=measureBuffer(await aura.engine.render(p));results.push({type,wetRms:wet.rms,bypassDifference:Math.abs(bypass.rms-dry)});}return results;});assert.ok(report.effectBypass.every(x=>Number.isFinite(x.wetRms)&&x.bypassDifference<1e-7));
 await page.click('[data-wbtab="listen"]');
 const wav=Buffer.from(await page.evaluate(async()=>{const {encodeWav}=await import('/src/audio.js');await aura.engine.init();const b=aura.engine.ctx.createBuffer(2,44100*2,44100);for(let ch=0;ch<2;ch++)for(let i=10000;i<10256;i++)b.getChannelData(ch)[i]=.9*Math.sin((i-10000)*Math.PI/16);return Array.from(new Uint8Array(encodeWav(b)));}));
 await page.setInputFiles('#wbReference',{name:'Sparse-peak-reference.wav',mimeType:'audio/wav',buffer:wav});await page.waitForFunction(()=>aura.workbench.reference);await page.click('#wbMatch');await page.waitForFunction(()=>!aura.workbench.busy);report.referencePeakAfterMatch=await page.evaluate(()=>aura.workbench.reference.gain*aura.workbench.reference.metrics.peak);assert.ok(report.referencePeakAfterMatch<=.991);
 await page.click('#wbListenB');await page.waitForTimeout(100);await page.click('[data-wbtab="effects"]');assert.equal(await page.evaluate(()=>aura.workbench.refSource),null);await page.waitForTimeout(120);assert.ok(await page.evaluate(()=>aura.engine.projectOutput.gain.value>.95));
 await page.click('[data-wbtab="listen"]');await page.click('#wbListenB');await page.click('#wbClose');await page.waitForFunction(()=>aura.workbench.refSource===null);await page.evaluate(()=>aura.engine.stop());
 report.saveFailure=await page.evaluate(async()=>{aura.store.commit('Quota fixture',p=>p.name='Unsaved audit fixture');const original=indexedDB.open;indexedDB.open=()=>{throw new DOMException('Simulated full disk','QuotaExceededError');};let rejected=false;try{await aura.house.studio.persist();}catch{rejected=true;}finally{indexedDB.open=original;}return {rejected,state:document.querySelector('#saveState').textContent};});assert.ok(report.saveFailure.rejected);assert.equal(report.saveFailure.state,'Not saved');
 await page.evaluate(async()=>{aura.store.commit('Saved audit',p=>p.name='Audit saved session');await aura.house.studio.persist();});const projectData=p=>{const {savedAt,recoveryAt,...data}=p;return data;},saved=projectData(await page.evaluate(()=>aura.store.project));await page.reload();await page.waitForFunction(()=>aura?.store?.project?.name==='Audit saved session');assert.deepEqual(projectData(await page.evaluate(()=>aura.store.project)),saved);
 // Actual piano-roll draw, delete and undo through pointer/keyboard input.
 await page.click('[data-work="compose"]');const box=await page.locator('#piano').boundingBox(),notes=await page.evaluate(()=>aura.store.project.tracks[0].clips[0].notes.length);await page.mouse.dblclick(box.x+100,box.y+170);assert.equal(await page.evaluate(()=>aura.store.project.tracks[0].clips[0].notes.length),notes+1);await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>aura.store.project.tracks[0].clips[0].notes.length),notes);
 await page.click('[data-work="arrange"]');assert.ok(await page.locator('#timeline').isVisible());await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('#timeline').isVisible());await page.screenshot({path:path.join(out,'after-mobile-arrange.png')});await page.setViewportSize({width:1366,height:900});
 await page.click('#productionWorkbenchButton');await page.keyboard.press('Control+k');assert.equal(await page.locator('dialog[open]').count(),1);await page.fill('#commandSearch','piano');assert.match(await page.locator('#commandResults').innerText(),/piano/i);await page.keyboard.press('Escape');
 // Fresh fake-device take checks graph/capture/decoding, not a real microphone.
 await page.evaluate(()=>aura.house.openTool('record'));await page.click('#beginRecording');await page.waitForTimeout(550);await page.click('#stopRecording');await page.waitForFunction(()=>!aura.recording.saving);assert.ok(await page.evaluate(()=>aura.store.project.tracks.some(t=>t.instrument==='audio')));
 await page.evaluate(()=>document.querySelector('#recordPanel').close());await page.click('#productionWorkbenchButton');await page.click('[data-wbtab="export"]');
 for(const [button,file]of [['#wbExportProject','workflow.aura'],['#wbExportMidi','workflow.mid'],['#wbExportMaster','workflow-master.wav']]){const event=page.waitForEvent('download',{timeout:90000});await page.click(button);await(await event).saveAs(path.join(out,file));}
 // A bounded two-track stem batch, keeping imported audio in the project export.
 await page.evaluate(()=>aura.store.commit('Stem audit',p=>p.tracks.forEach((t,i)=>t.mute=i>1)));const event=page.waitForEvent('download',{timeout:90000});await page.click('#wbExportStems');await(await event).saveAs(path.join(out,'workflow-stems.zip'));
 report.errors=errors;assert.deepEqual(errors,[]);report.completed=['real-time stereo meters','sample discontinuity','held keyboard notes','MIDI capture','all eight inserts','saved chain','reference RMS headroom','reference dismissal','save failure','save/reload equality','piano-roll editing/undo','desktop/mobile arrangement','command palette','fake microphone capture','project/MIDI/master/stem downloads'];
 fs.writeFileSync(path.join(out,'workflow-measurements.json'),JSON.stringify(report,null,2));console.log('AUDIT WORKFLOW PASSED',report.completed);await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
