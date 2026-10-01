import { Performance } from "./performance.js";
import { presets, drumKits, scaleIntervals, uid, makeTrack, makeClip, noteName } from './project.js';
import { effects, makeEffect } from './effects.js';
import { encodeWav } from './audio.js';
import { encodeMidi } from './midi.js';
import { zipFiles } from './zip.js';
import { measureBuffer, dbfs, spectralOverlap } from './analysis.js';
import { download, listRecovery } from './storage.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeName=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)||'AURA';
const options=(items,value)=>items.map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('');
const range=(id,label,min,max,step,value)=>`<label class="wbControl" for="${id}"><span><span id="${id}-label">${esc(label)}</span><output>${Number(value).toFixed(step<.01?3:step<1?2:0)}</output></span><input id="${id}" aria-labelledby="${id}-label" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;

export function transformPhrase(notes, operation, length) {
  let out=structuredClone(notes);
  if(operation==='up'||operation==='down')out.forEach(n=>n.pitch=Math.max(0,Math.min(127,n.pitch+(operation==='up'?12:-12))));
  if(operation==='reverse')out.forEach(n=>n.start=Math.max(0,length-n.start-Math.min(n.duration,length-n.start)));
  if(operation==='legato') {
    const onsets=[...new Set(out.map(n=>Math.round(n.start*1000)/1000))].sort((a,b)=>a-b);
    out.forEach(n=>n.duration=Math.max(.001,(onsets.find(s=>s>n.start+.001)??length)-n.start));
  }
  if(operation==='strum') {
    const groups=new Map();for(const n of out){const key=Math.floor(n.start*2)/2;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(n);}
    for(const [start,group]of groups){group.sort((a,b)=>a.pitch-b.pitch).forEach((n,i)=>{n.start=Math.min(length-.01,start+i*.035);n.duration=Math.min(n.duration,length-n.start);});}
  }
  if(operation==='chop')out=out.flatMap(n=>{const pieces=[];for(let offset=0;offset<n.duration-.001;offset+=.25)pieces.push({...n,id:uid(),start:n.start+offset,duration:Math.min(.2,n.duration-offset,length-n.start-offset)});return pieces;});
  if(operation==='arp') {
    const pitches=[...new Set(out.map(n=>n.pitch))].sort((a,b)=>a-b);out=[];
    if(pitches.length)for(let step=0;step<length*4;step++)out.push({id:uid(),pitch:pitches[step%pitches.length],start:step/4,duration:.2,velocity:step%4?.55:.75});
  }
  return out.filter(n=>n.start<length&&n.duration>0).slice(0,4096);
}

export class Workbench {
  constructor(studio, house) {
    this.s=studio;this.house=house;this.tab='voice';this.reference=null;this.refSource=null;this.busy=false;
    this.performance=new Performance(studio,()=>this.performanceStatus());
    const dialog=document.createElement('dialog');dialog.id='workbench';dialog.className='workbench';
    dialog.innerHTML='<div class="wbHeader"><div><small>AURA / STUDIO WORKBENCH</small><h2>Shape the sound.</h2></div><button id="wbClose" aria-label="Close workbench">×</button></div><div class="wbTabs"></div><div class="wbContext"></div><div class="wbBody"></div><div class="wbFooter"><span id="wbStatus">All changes belong to your project. Undo is available.</span><button id="wbUndo">Undo</button><button id="wbPlay">Listen</button></div>';
    document.body.append(dialog);this.dialog=dialog;
    dialog.addEventListener("close",()=>{this.performance.enabled=false;this.performance.releaseAll();this.performance.finish();this.sampleSource?.stop();this.stopReference();});
    dialog.querySelector('#wbClose').onclick=()=>dialog.close();
    dialog.querySelector('#wbUndo').onclick=()=>studio.store.undo();
    dialog.querySelector('#wbPlay').onclick=this.safe(async()=>{if(studio.engine.playing)studio.engine.pause();else await studio.engine.play(studio.getProject());});
    dialog.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.target.closest('textarea,input:not([type="range"]),select')){
        e.preventDefault();e.stopPropagation();e.shiftKey?studio.store.redo():studio.store.undo();
      }
    });
    studio.registerCommands([['Open the studio workbench','',()=>this.open()],['Shape the current voice','',()=>this.open('voice')],['Edit the insert chain','',()=>this.open('effects')],['Export aligned stems or MIDI','',()=>this.open('export')],['Compare a reference track','',()=>this.open('listen')]]);
    studio.store.addEventListener('change',()=>{if(dialog.open)this.render();});
    studio.engine.addEventListener('transport',()=>{if(!studio.engine.playing)this.stopReference();});
    const button=(parent,id)=>{const b=document.createElement('button');b.id=id;b.textContent='Workbench';b.onclick=()=>this.open();parent.append(b);};
    button(document.querySelector('.houseTopRight'),'houseWorkbenchButton');
    button(document.querySelector('#productionRoomLabel'),'productionWorkbenchButton');
    for(const [panel,tab,label]of [['masterPanel','listen','Reference A/B & analysis'],['exportPanel','export','Export formats, stems & MIDI']]){
      const b=document.createElement('button');b.textContent=label;b.className='housePrimary';b.onclick=()=>{document.querySelector('#'+panel).close();this.open(tab);};document.querySelector('#'+panel).append(b);
    }
    this.timer=setInterval(()=>{if(dialog.open&&this.tab==='listen')this.drawAnalysis();},100);
  }
  safe(fn){return async(...args)=>{try{await fn(...args);}catch(e){this.status(e.message);this.s.toast(e.message);console.error(e);}};}
  status(message){this.dialog.querySelector('#wbStatus').textContent=message;}
  open(tab=this.tab){this.tab=tab;document.exitPointerLock?.();this.house?.keys.clear();if(this.house){this.house.journey=null;this.house.velocity.set(0,0);}for(const d of document.querySelectorAll('dialog[open]'))if(d!==this.dialog)d.close();this.render();if(!this.dialog.open)this.dialog.showModal();}
  bind(id,fn,event='onclick'){const el=this.dialog.querySelector('#'+id);if(el)el[event]=this.safe(fn);}
  render(){
    if(this.tab!=='listen'&&this.refSource)this.stopReference();
    const focused=document.activeElement;
    const focusId=this.dialog.contains(focused)?focused.id:null, focusTab=focused?.dataset?.wbtab;
    const sameTab=this.renderedTab===this.tab, scroll=sameTab?(this.dialog.querySelector('.wbBody')?.scrollTop||0):0;
    this.performance.enabled=this.tab==='voice';
    if(this.tab!=='voice')this.performance.releaseAll();
    const t=this.s.getTrack(),p=this.s.getProject();
    const tabs=[['voice','Instruments'],['effects','Insert chain'],['midi','Phrase & chords'],['samples','Audio library'],['listen','Reference room'],['export','Deliverables'],['recovery','Recovery']];
    this.dialog.querySelector('.wbTabs').innerHTML=tabs.map(([id,label])=>`<button data-wbtab="${id}" class="${this.tab===id?'active':''}">${label}</button>`).join('');
    this.dialog.querySelectorAll('[data-wbtab]').forEach(b=>b.onclick=()=>{this.tab=b.dataset.wbtab;this.render();});
    this.dialog.querySelector('.wbContext').innerHTML=`<label>Current track <select id="wbTrack">${options(p.tracks.map(t=>[t.id,t.name]),t?.id)}</select></label><span>${esc(this.s.getClip()?.name??'No clip selected')} · ${p.bpm} BPM · ${noteName(p.root+60).slice(0,-1)} ${esc(p.scale)}</span>`;
    this.bind('wbTrack',e=>{this.s.select(e.target.value);this.render();},'onchange');
    this.body=this.dialog.querySelector('.wbBody');
    if(this.tab==='voice')this.voice(t);
    else if(this.tab==='effects')this.chain(t);
    else if(this.tab==='midi')this.midi(t);
    else if(this.tab==='samples')this.samples();
    else if(this.tab==='listen')this.listen();
    else if(this.tab==='recovery')this.recovery().catch(e=>this.status(e.message));
    else this.exports();
    this.renderedTab=this.tab;
    this.body.scrollTop=scroll;
    const replacement=focusId?document.getElementById(focusId):focusTab?this.dialog.querySelector(`[data-wbtab="${focusTab}"]`):null;
    if(replacement&&!replacement.disabled)replacement.focus({preventScroll:true});
    this.dialog.querySelector('#wbUndo').disabled=!this.s.store.undoStack.length;
  }
  voice(t){
    if(!t){this.body.innerHTML='<p>Select a track to shape its voice.</p>';return;}
    const spec=presets.find(x=>x.id===t.instrument);
    if(t.instrument==='audio'){this.body.innerHTML='<p>This is a decoded audio track. Use the audio library to shape its clip.</p>';return;}
    this.body.innerHTML=`<div class="wbTwo"><section><h3>${esc(spec?.name)}</h3><p>${esc(spec?.description)}. These are synthesized voices; acoustic sample libraries are not installed.</p><label class="wbSelect">Instrument <select id="wbVoice">${options(presets.map(x=>[x.id,x.name+' · '+x.category]),t.instrument)}</select></label>${t.instrument==='drums'?`<label class="wbSelect">Kit character <select id="wbKit">${options(Object.entries(drumKits),t.drumKit||'classic')}</select></label>`:range('voiceAttack','Attack · seconds',.001,1,.001,t.synth?.attack??(['pad','strings','choir'].includes(t.instrument)?.18:.008))+range('voiceRelease','Release · seconds',.02,2,.01,t.synth?.release??.4)+range('voiceBrightness','Brightness · Hz',200,16000,50,t.synth?.brightness??12000)}<button id="wbAudition">Audition ${t.instrument==='drums'?'kick':'C4'}</button> <button id="wbShowPerformance">Play & capture</button></section><section><h3>A playable sound palette.</h3><p>Choose a voice on this track, or add another instrument. Every entry uses a distinct synthesis recipe.</p><div class="wbVoiceGrid">${presets.map(v=>`<button data-addvoice="${v.id}"><strong>${esc(v.name)}</strong><small>${esc(v.category)}</small></button>`).join('')}</div></section></div>`;
    this.bind('wbVoice',e=>{this.performance.releaseAll();this.s.commit('Change instrument',()=>{t.instrument=e.target.value;delete t.synth;});},'onchange');
    this.bind('wbKit',e=>this.s.commit('Change drum kit',()=>t.drumKit=e.target.value),'onchange');
    for(const [id,key]of [['voiceAttack','attack'],['voiceRelease','release'],['voiceBrightness','brightness']])this.bind(id,e=>this.s.commit('Shape instrument',()=>{t.synth??={};t.synth[key]=Number(e.target.value);}),'onchange');
    const performance=document.createElement("section");performance.className="wbPerformance";performance.innerHTML=`<h3>Play and capture.</h3><p>Computer keys A W S E D F T G Y H U J K O L P ; play chromatically. Press and hold for sustain.</p><div class="wbActions"><button id="wbOctaveDown">Octave down</button><span id="wbOctave">C${Math.floor(this.performance.base/12)-1}</span><button id="wbOctaveUp">Octave up</button><button id="wbMidiConnect">Connect MIDI input</button><button id="wbCapture">Capture MIDI · 4-beat count-in</button><button id="wbCaptureStop" ${this.performance.capture?'':'disabled'}>Keep performance</button></div><div class="wbKeyboard">${Array.from({length:17},(_,i)=>`<button data-live-key="${i}" class="${[1,3,6,8,10].includes((this.performance.base+i)%12)?'black':''}">${noteName(this.performance.base+i)}</button>`).join('')}</div><p id="wbPerformanceStatus" class="wbMuted">Capture appends notes at clip beat zero; the project transport stays independent.</p>`;this.body.append(performance);
    this.bind('wbShowPerformance',()=>this.body.querySelector('.wbPerformance').scrollIntoView({block:'start',behavior:this.house?.reduced?'auto':'smooth'}));
    this.bind('wbOctaveDown',()=>{this.performance.releaseAll();this.performance.base=Math.max(24,this.performance.base-12);this.render();});
    this.bind('wbOctaveUp',()=>{this.performance.releaseAll();this.performance.base=Math.min(96,this.performance.base+12);this.render();});
    this.bind('wbMidiConnect',async()=>{const names=await this.performance.connect();this.status(names.length?'Connected: '+names.join(', '):'MIDI access granted. Connect a MIDI input to play.');});
    this.bind('wbCapture',()=>{if(!this.performance.capture)return this.performance.record();});
    this.bind('wbCaptureStop',()=>this.performance.finish());
    this.body.querySelectorAll('[data-live-key]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);this.performance.on('pointer:'+b.dataset.liveKey,this.performance.base+Number(b.dataset.liveKey),.7);};b.onpointerup=b.onpointercancel=()=>this.performance.off('pointer:'+b.dataset.liveKey);});
    this.performanceStatus();
    this.bind('wbAudition',()=>this.s.engine.audition(t,t.instrument==='drums'?36:60));
    this.body.querySelectorAll('[data-addvoice]').forEach(b=>b.onclick=()=>{this.s.addInstrument(b.dataset.addvoice);this.render();});
  }
  performanceStatus(){
    if(!this.dialog)return;const el=this.dialog.querySelector("#wbPerformanceStatus"),cap=this.performance.capture;
    if(el)el.textContent=cap?"Capture armed: four-beat count-in, then "+cap.length+" beats. Notes kept: "+cap.notes.length:this.performance.held.size+" held notes. Capture appends notes at clip beat zero; project transport is independent.";
    const stop=this.dialog.querySelector("#wbCaptureStop");if(stop)stop.disabled=!cap;
  }
  chain(t){
    if(!t){this.body.innerHTML='<p>Select a track.</p>';return;}
    const inserts=t.inserts||[];
    this.body.innerHTML=`<div class="wbChainIntro"><div><h3>Inserts / ${esc(t.name)}</h3><p>After the channel EQ and compressor, before automation and fader. Order, bypass, and blend are heard in the mix and the offline render.</p></div><select id="wbEffectType">${options(Object.entries(effects).map(([id,e])=>[id,e.name]),'eq')}</select><button id="wbAddEffect">Add insert</button></div><div class="wbEffects">${inserts.map((fx,i)=>`<section class="wbEffect"><header><strong>${i+1}. ${effects[fx.type].name}</strong><label><input data-fxenable="${i}" type="checkbox" ${fx.enabled?'checked':''}> Active</label><button data-fxup="${i}" ${i===0?'disabled':''}>Move up</button><button data-fxremove="${i}" aria-label="Remove ${effects[fx.type].name}">Remove</button></header><div class="wbEffectParams">${Object.entries(effects[fx.type].params).map(([key,[min,max,def,step]])=>range(`fx-${i}-${key}`,key,min,max,step,fx.params[key]??def)).join('')}${range(`fx-${i}-wet`,'Wet / dry',0,1,.01,fx.wet)}</div></section>`).join('')||'<p class="wbEmpty">Your insert rack is empty. Add a processor to start.</p>'}</div><div class="wbPreset"><input id="wbChainName" placeholder="Chain preset name" aria-label="Chain preset name"><button id="wbSaveChain">Save chain preset</button><select id="wbSavedChains" aria-label="Saved effect chain">${options(Object.keys(this.chainPresets()).map(k=>[k,k]),'')}</select><button id="wbLoadChain">Load preset</button></div>`;
    this.bind('wbAddEffect',()=>{if(inserts.length>=12)throw Error('Up to 12 inserts per channel.');const type=this.dialog.querySelector('#wbEffectType').value;this.s.commit('Add insert',()=>{t.inserts??=[];t.inserts.push(makeEffect(type));});});
    for(const [i,fx]of inserts.entries()){
      for(const key of [...Object.keys(effects[fx.type].params),'wet'])this.bind(`fx-${i}-${key}`,e=>this.s.commit('Change insert parameter',()=>{if(key==='wet')fx.wet=Number(e.target.value);else fx.params[key]=Number(e.target.value);}),'onchange');
    }
    this.body.querySelectorAll('[data-fxenable]').forEach(b=>b.onchange=()=>this.s.commit('Bypass insert',()=>inserts[Number(b.dataset.fxenable)].enabled=b.checked));
    this.body.querySelectorAll('[data-fxup]').forEach(b=>b.onclick=()=>this.s.commit('Reorder inserts',()=>{const i=Number(b.dataset.fxup);[inserts[i-1],inserts[i]]=[inserts[i],inserts[i-1]];}));
    this.body.querySelectorAll('[data-fxremove]').forEach(b=>b.onclick=()=>this.s.commit('Remove insert',()=>inserts.splice(Number(b.dataset.fxremove),1)));
    this.bind('wbSaveChain',()=>{const name=this.dialog.querySelector('#wbChainName').value.trim();if(!name)throw Error('Name the preset first.');const saved=this.chainPresets();saved[name]=structuredClone(inserts);localStorage.setItem('aura-effect-chains',JSON.stringify(saved));this.render();this.status('Chain preset saved on this device.');});
    this.bind('wbLoadChain',()=>{const selected=this.dialog.querySelector('#wbSavedChains').value,saved=this.chainPresets()[selected];if(!saved)throw Error('Save a chain preset first.');this.s.commit('Load insert preset',()=>t.inserts=saved.map(fx=>({...structuredClone(fx),id:uid()})));});
  }
  chainPresets(){try{return JSON.parse(localStorage.getItem('aura-effect-chains')||'{}');}catch{return {};}}
  midi(t){
    const c=this.s.getClip(),p=this.s.getProject();
    if(!c||t?.instrument==='audio'){this.body.innerHTML='<p>Select a melodic MIDI clip in the arrangement.</p>';return;}
    this.body.innerHTML=`<div class="wbTwo"><section><h3>Phrase tools</h3><p>Applies to all ${c.notes.length} notes in ${esc(c.name)}. Every operation is one undo step.</p><div class="wbActions">${[['up','Octave up'],['down','Octave down'],['legato','Legato'],['strum','Strum'],['chop','Chop to 16ths'],['arp','Arpeggiate'],['reverse','Reverse phrase']].map(([id,label])=>`<button data-phrase="${id}">${label}</button>`).join('')}<button id="wbDoublePhrase">Repeat phrase ×2</button></div><div class="wbNotePreview">${c.notes.slice(0,32).map(n=>`<span>${noteName(n.pitch)}</span>`).join('')}</div><label class="wbSelect">Clip <select id="wbClip">${options(t.clips.map(c=>[c.id,c.name+' · '+c.start+' beats']),c.id)}</select></label></section><section><h3>Diatonic chord pads</h3><p>Triads derived from the project scale. Insert into this clip, then edit each note in the piano roll.</p><label class="wbSelect">Insert at beat <input id="wbChordBeat" type="number" min="0" max="${Math.max(0,c.length-1)}" step=".25" value="0"></label><label class="wbSelect">Inversion <select id="wbInversion"><option value="0">Root position</option><option value="1">First inversion</option><option value="2">Second inversion</option></select></label><div class="wbChords">${(scaleIntervals[p.scale]||scaleIntervals.Minor).map((v,i)=>`<button data-chord="${i}"><small>${i+1}</small>${noteName(60+p.root+v).slice(0,-1)}</button>`).join('')}</div><p class="wbMuted">Pentatonic and blues scales produce scale-derived triads rather than traditional seven-degree harmony.</p></section></div>`;
    this.bind('wbClip',e=>{this.s.select(t.id,e.target.value);this.render();},'onchange');
    this.body.querySelectorAll('[data-phrase]').forEach(b=>b.onclick=()=>this.s.commit('Transform phrase: '+b.dataset.phrase,()=>c.notes=transformPhrase(c.notes,b.dataset.phrase,c.length)));
    this.bind('wbDoublePhrase',()=>{if(c.start+c.length*2>256||c.notes.length*2>4096)throw Error('Phrase is at the project limit.');this.s.commit('Repeat phrase',()=>{const length=c.length;c.notes.push(...c.notes.map(n=>({...n,id:uid(),start:n.start+length})));c.length*=2;p.bars=Math.max(p.bars,Math.ceil((c.start+c.length)/4));});});
    this.body.querySelectorAll('[data-chord]').forEach(b=>b.onclick=()=>{
      const intervals=scaleIntervals[p.scale],degree=Number(b.dataset.chord),start=Math.max(0,Math.min(c.length-.01,Number(this.dialog.querySelector('#wbChordBeat').value)||0)),inversion=Number(this.dialog.querySelector('#wbInversion').value);
      const pitches=[0,2,4].map(offset=>{const step=degree+offset;return 60+p.root+intervals[step%intervals.length]+Math.floor(step/intervals.length)*12;});
      for(let i=0;i<inversion;i++)pitches.push(pitches.shift()+12);
      if(c.notes.length>4093)return this.status('Clip note limit reached.');
      this.s.commit('Insert scale chord',()=>c.notes.push(...pitches.map(pitch=>({id:uid(),pitch,start,duration:Math.min(1,c.length-start),velocity:.65}))));
      pitches.forEach(pitch=>this.s.engine.audition(t,pitch).catch(e=>this.status(e.message)));
    });
  }
  samples(){
    const p=this.s.getProject(),assets=Object.entries(p.assets),c=this.s.getClip();
    this.body.innerHTML=`<header class="wbChainIntro"><div><h3>Your audio library</h3><p>Local, decoded audio with real waveforms. Tempo, key, and category tags are entered by you.</p></div><label class="wbFile">Import audio<input id="wbImportAudio" type="file" accept="audio/*"></label></header><div class="wbSearch"><input id="wbSampleQuery" placeholder="Search filenames and category tags" aria-label="Search local samples"><select id="wbSampleFilter"><option value="all">All samples</option><option value="favorites">Favorites</option></select></div><div class="wbSamples">${assets.map(([id,a])=>`<article class="wbSample" data-sample="${id}" data-search="${esc((a.name+' '+(a.category||'')).toLowerCase())}" data-favorite="${a.favorite?'true':'false'}"><header><strong>${esc(a.name)}</strong><small>${a.duration.toFixed(2)} s</small><button data-favorite="${id}">${a.favorite?'★':'☆'}</button></header><canvas width="500" height="64" data-wave="${id}" aria-label="Decoded audio waveform"></canvas><div class="wbSampleMeta"><input data-category="${id}" placeholder="Category" value="${esc(a.category||'')}" aria-label="Sample category"><input data-bpm="${id}" type="number" min="40" max="240" placeholder="BPM" value="${a.bpm||''}" aria-label="Sample BPM tag"><input data-key="${id}" placeholder="Key" value="${esc(a.key||'')}" aria-label="Sample key tag"></div><div class="wbActions"><button data-preview="${id}">Preview</button><button data-place="${id}">Place at playhead</button></div></article>`).join('')||'<p>Import a recording, loop, or one-shot to build your library.</p>'}</div>${c?.asset?`<section class="wbAudioClip"><h3>Selected audio clip / ${esc(c.name)}</h3>${range('wbClipGain','Clip gain',0,2,.01,c.gain??1)}${range('wbFadeIn','Fade in · seconds',0,2,.01,c.fadeIn??.005)}${range('wbFadeOut','Fade out · seconds',0,2,.01,c.fadeOut??.01)}<label><input id="wbReverseAudio" type="checkbox" ${c.reverse?'checked':''}> Reverse audio</label></section>`:''}`;
    this.bind('wbImportAudio',async e=>{await this.s.importAudio(e.target.files[0]);this.render();},'onchange');
    const filter=()=>{const query=this.dialog.querySelector('#wbSampleQuery').value.toLowerCase(),favorite=this.dialog.querySelector('#wbSampleFilter').value==='favorites';this.body.querySelectorAll('[data-sample]').forEach(row=>row.hidden=!row.dataset.search.includes(query)||(favorite&&row.dataset.favorite!=='true'));};
    this.bind('wbSampleQuery',filter,'oninput');this.bind('wbSampleFilter',filter,'onchange');
    for(const [id,a]of assets){
      const canvas=this.body.querySelector(`[data-wave="${id}"]`),ctx=canvas.getContext('2d');ctx.fillStyle='#26382f';ctx.fillRect(0,0,500,64);ctx.fillStyle='#cebb91';a.peaks.forEach((v,i)=>ctx.fillRect(i/a.peaks.length*500,32-v*29,Math.max(1,500/a.peaks.length),v*58));
      const favorite=this.body.querySelector(`button[data-favorite="${id}"]`);favorite.onclick=()=>this.s.commit('Favorite sample',()=>a.favorite=!a.favorite);
      for(const key of ['category','bpm','key'])this.body.querySelector(`[data-${key}="${id}"]`).onchange=e=>this.s.commit('Tag sample',()=>{a[key]=key==='bpm'?Math.max(40,Math.min(240,Number(e.target.value)||40)):e.target.value.slice(0,80);});
      this.body.querySelector(`[data-preview="${id}"]`).onclick=this.safe(async()=>{await this.s.engine.init();this.sampleSource?.stop();const source=this.s.engine.ctx.createBufferSource(),gain=this.s.engine.ctx.createGain();source.buffer=this.s.engine.assets.get(id);gain.gain.value=.5;source.connect(gain).connect(this.s.engine.output);source.start();source.stop(this.s.engine.ctx.currentTime+Math.min(8,source.buffer.duration));source.onended=()=>{source.disconnect();gain.disconnect();if(this.sampleSource===source)this.sampleSource=null;};this.sampleSource=source;});
      this.body.querySelector(`[data-place="${id}"]`).onclick=()=>{let track;const start=Math.floor(Math.min(255,this.s.engine.beat)*4)/4;this.s.commit('Place audio at playhead',()=>{track=makeTrack('audio',p.tracks.length);const clip=makeClip(a.name,start,Math.min(256-start,Math.max(.25,a.duration*p.bpm/60)));clip.asset=id;clip.offset=0;track.name=a.name;track.clips=[clip];if(p.tracks.length>=64)throw Error('Maximum 64 tracks.');p.tracks.push(track);p.bars=Math.max(p.bars,Math.ceil((start+clip.length)/4));});this.s.select(track.id);this.render();};
    }
    for(const [id,key]of [['wbClipGain','gain'],['wbFadeIn','fadeIn'],['wbFadeOut','fadeOut']])this.bind(id,e=>this.s.commit('Shape audio clip',()=>c[key]=Number(e.target.value)),'onchange');
    this.bind('wbReverseAudio',e=>this.s.commit('Reverse audio clip',()=>c.reverse=e.target.checked),'onchange');
  }
  listen(){
    this.body.innerHTML=`<div class="wbTwo"><section><h3>Reference A/B</h3><p>Compare at the same elapsed position. Optional RMS matching uses measured full-render energy. The reference stays in this listening session.</p><label class="wbFile">Load a reference<input id="wbReference" type="file" accept="audio/*"></label><p id="wbRefName">${esc(this.reference?.name||'No reference loaded')}</p><div class="wbActions"><button id="wbListenA" class="${this.refSource?'':'active'}">A · Your project</button><button id="wbListenB" class="${this.refSource?'active':''}" ${this.reference?'':'disabled'}>B · Reference</button><button id="wbMatch" ${this.reference?'':'disabled'}>Measure & match RMS</button></div><label class="wbSelect">Monitoring <select id="wbMonitor">${options([['stereo','Full-range stereo'],['mono','Mono compatibility'],['phone','Small speaker · 300–3400 Hz']],this.s.engine.monitorMode||'stereo')}</select></label><p class="wbMuted">Monitoring changes only the listening path. Exports always use the full-range project graph.</p><div id="wbMeasured">${this.matchInfo||'RMS matching has not been measured.'}</div></section><section><h3>Measured signal</h3><div class="wbMeters"><div><small>SAMPLE PEAK</small><strong id="wbPeak">−∞</strong></div><div><small>RMS</small><strong id="wbRms">−∞</strong></div><div><small>CREST · dB</small><strong id="wbCrest">0</strong></div><div><small>L/R CORRELATION</small><strong id="wbCorrelation">0</strong></div></div><canvas id="wbSpectrum" width="600" height="150" aria-label="Live master frequency spectrum"></canvas><canvas id="wbPhase" width="300" height="150" aria-label="Live left-right phase scope"></canvas><p class="wbMuted">Project signal before monitoring. Sample peak and RMS, not LUFS or true peak.</p><div id="wbOverlap"></div></section></div>`;
    this.bind('wbReference',async e=>{const file=e.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw Error('Reference limit: 20 MB.');await this.s.engine.init();const buffer=await this.s.engine.ctx.decodeAudioData(await file.arrayBuffer());this.stopReference();this.reference={name:file.name,buffer,metrics:measureBuffer(buffer),gain:1};this.matchInfo=null;this.render();},'onchange');
    this.bind('wbListenA',()=>{this.stopReference();this.render();});
    this.bind('wbListenB',async()=>{if(!this.s.engine.playing)await this.s.engine.play(this.s.getProject());this.startReference();this.render();});
    this.bind('wbMatch',async()=>{if(this.busy)return;this.busy=true;this.status('Rendering the project to measure full-session RMS…');try{const reference=this.reference,revision=this.s.store.revision;const buffer=await this.s.engine.render(structuredClone(this.s.getProject())),m=measureBuffer(buffer),ref=reference.metrics;if(reference!==this.reference||revision!==this.s.store.revision)throw Error('The project or reference changed. Measure again.');if(!m.rms||!ref.rms)throw Error('Cannot match silent audio.');this.reference.gain=Math.min(4,m.rms/ref.rms,.99/ref.peak);this.refGain?.gain.setTargetAtTime(this.reference.gain,this.s.engine.ctx.currentTime,.03);this.matchInfo=`Project ${dbfs(m.rms)} dBFS RMS · reference ${dbfs(ref.rms)} dBFS RMS · trim ${dbfs(this.reference.gain)} dB. Release and effect tails included.${this.reference.gain<m.rms/ref.rms?' Trim limited to preserve sample-peak headroom; RMS levels may differ.':''}`;this.render();this.status('Full-render RMS comparison complete.');}finally{this.busy=false;}});
    this.bind('wbMonitor',async e=>{await this.s.engine.init();this.s.engine.setMonitor(e.target.value);},'onchange');
  }
  startReference(){
    if(!this.reference)return;this.stopReference();const engine=this.s.engine,ctx=engine.ctx,source=ctx.createBufferSource(),gain=ctx.createGain();
    source.buffer=this.reference.buffer;gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(this.reference.gain,ctx.currentTime+.015);source.connect(gain).connect(engine.output);
    const offset=engine.beat*60/this.s.getProject().bpm;
    if(offset>=source.buffer.duration)throw Error('The reference ends before this project position.');
    engine.projectOutput.gain.setTargetAtTime(0,ctx.currentTime,.015);source.start(ctx.currentTime,offset);this.refSource=source;this.refGain=gain;
    source.onended=()=>{source.disconnect();gain.disconnect();if(this.refSource===source){this.refSource=null;engine.projectOutput.gain.setTargetAtTime(1,ctx.currentTime,.015);if(this.dialog.open&&this.tab==='listen')this.render();}};
  }
  stopReference(){if(this.refSource){const now=this.s.engine.ctx.currentTime;this.refGain.gain.cancelAndHoldAtTime(now);this.refGain.gain.linearRampToValueAtTime(0,now+.012);this.refSource.stop(now+.015);this.refSource=null;this.refGain=null;}this.s.engine.projectOutput?.gain.setTargetAtTime(1,this.s.engine.ctx.currentTime,.015);}
  drawAnalysis(){
    const m=this.s.engine.metrics();
    for(const [id,value]of [['wbPeak',dbfs(m.peak)],['wbRms',dbfs(m.rms)],['wbCrest',(m.crest||0).toFixed(1)],['wbCorrelation',(m.correlation||0).toFixed(2)]]){const el=this.dialog.querySelector('#'+id);if(el)el.textContent=value;}
    const spectrum=this.dialog.querySelector('#wbSpectrum');if(!spectrum)return;const ctx=spectrum.getContext('2d');ctx.fillStyle='#1c2b24';ctx.fillRect(0,0,600,150);ctx.strokeStyle='#cebb91';ctx.beginPath();
    for(let i=0;i<240;i++){const hz=20*(1000**(i/239)),index=Math.round(hz*2048/(this.s.engine.ctx?.sampleRate||48000)),value=m.spectrum[index]||0,x=i/239*600,y=135-value/255*120;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();ctx.fillStyle='#a7b8ad';ctx.font='12px sans-serif';ctx.fillText('20 Hz',8,146);ctx.fillText('1 kHz',Math.log(50)/Math.log(1000)*600,146);ctx.fillText('20 kHz',550,146);
    const phase=this.dialog.querySelector('#wbPhase'),pc=phase.getContext('2d');pc.fillStyle='#1c2b24';pc.fillRect(0,0,300,150);pc.strokeStyle='#43564b';pc.beginPath();pc.moveTo(150,5);pc.lineTo(150,145);pc.moveTo(5,75);pc.lineTo(295,75);pc.stroke();pc.fillStyle='#cebb91';if(m.left)for(let i=0;i<m.left.length;i+=2)pc.fillRect(150+(m.left[i]-m.right[i])*130,75-(m.left[i]+m.right[i])*65,1.5,1.5);
    const pairs=[],tracks=this.s.getProject().tracks;
    for(let i=0;i<tracks.length;i++)for(let j=i+1;j<tracks.length;j++){const a=m.tracks.get(tracks[i].id),b=m.tracks.get(tracks[j].id);if(a?.rms>.002&&b?.rms>.002)pairs.push({a:tracks[i].name,b:tracks[j].name,value:spectralOverlap(a.powerSpectrum,b.powerSpectrum)});}
    pairs.sort((a,b)=>b.value-a.value);
    const overlap=this.dialog.querySelector('#wbOverlap');overlap.innerHTML=pairs.length?'<h4>Spectrum similarity</h4>'+pairs.slice(0,3).map(x=>`<p>${esc(x.a)} / ${esc(x.b)} · ${Math.round(x.value*100)}%</p>`).join('')+'<small>Shared spectral energy is a prompt to listen, not proof of masking.</small>':'<p>Play two audible tracks to compare measured spectra.</p>';
  }
  async recovery(){
    this.body.innerHTML='<h3>Recovery and versions.</h3><p>Autosave keeps up to five previous snapshots per project, at one-minute intervals. Named musical memories remain separate.</p><div id="wbRecoveryList">Loading snapshots…</div><button id="wbNamedMemory">Open musical memory</button>';
    this.bind('wbNamedMemory',()=>{this.dialog.close();this.house?.openMemory();});
    const projectId=this.s.getProject().id,records=await listRecovery(projectId);if(this.tab!=="recovery"||this.s.getProject().id!==projectId)return;
    const list=this.body.querySelector('#wbRecoveryList');list.innerHTML=records.map(record=>`<button class="wbRecovery" data-recovery="${esc(record.id)}"><strong>${esc(record.name)}</strong><small>${new Date(record.savedAt).toLocaleString()} · ${record.project.tracks.length} tracks</small></button>`).join('')||'<p class="wbMuted">Snapshots appear after editing and autosaving for one minute. Download an AURA project for an independent backup.</p>';
    list.querySelectorAll('[data-recovery]').forEach(b=>b.onclick=this.safe(async()=>{const record=records.find(r=>r.id===b.dataset.recovery);await this.s.persist();await this.s.selectProject(structuredClone(record.project));this.render();this.status('Recovered '+record.name); }));
  }
  exports(){
    this.body.innerHTML='<div class="wbTwo"><section><h3>Render your piece.</h3><p>Full-range stereo PCM with instruments, inserts, channel automation, and the release tail.</p><label class="wbSelect">Sample rate<select id="wbExportRate"><option value="44100">44.1 kHz</option><option value="48000">48 kHz</option></select></label><label class="wbSelect">PCM depth<select id="wbExportBits"><option value="24">24 bit</option><option value="16">16 bit</option></select></label><div class="wbActions"><button id="wbExportMaster">Download master WAV</button><button id="wbExportStems">Download aligned stems ZIP</button></div><p class="wbMuted">Stems use each audible track’s channel processing and the project master level. All start at zero and share the same length. Delay tails are capped at 30 seconds.</p></section><section><h3>Keep it editable.</h3><p>A standard MIDI file preserves note pitch, timing, velocity, clip placement, and tempo. Your AURA project also keeps audio and effect settings.</p><div class="wbActions"><button id="wbExportMidi">Download standard MIDI</button><button id="wbExportProject">Download AURA project</button></div><p class="wbMuted">WAV and MIDI are supported. Compressed audio codecs and native VST/AU plugins require an additional runtime and are not exposed as working features.</p></section></div>';
    this.bind('wbExportMaster',()=>this.exportAudio(false));this.bind('wbExportStems',()=>this.exportAudio(true));
    this.bind('wbExportMidi',()=>download(new Blob([encodeMidi(this.s.getProject())],{type:'audio/midi'}),safeName(this.s.getProject().name)+'.mid'));
    this.bind('wbExportProject',()=>download(new Blob([JSON.stringify(this.s.getProject(),null,2)],{type:'application/json'}),safeName(this.s.getProject().name)+'.aura'));
  }
  async exportAudio(stems){
    if(this.busy)return;this.busy=true;
    const p=structuredClone(this.s.getProject()),assets=new Map(this.s.engine.assets),rate=Number(this.dialog.querySelector('#wbExportRate').value),bits=Number(this.dialog.querySelector('#wbExportBits').value);
    this.dialog.querySelector('#wbExportMaster').disabled=this.dialog.querySelector('#wbExportStems').disabled=true;
    try{
      if(stems){const solo=p.tracks.some(t=>t.solo),tracks=p.tracks.filter(t=>!t.mute&&(!solo||t.solo));if(!tracks.length)throw Error('No audible tracks to export.');if(tracks.length>24)throw Error('Export up to 24 stems per ZIP in this browser release.');const files=[];
        for(const [i,t]of tracks.entries()){this.status(`Rendering stem ${i+1} / ${tracks.length}: ${t.name}`);const snapshot={...p,tracks:p.tracks.map(x=>({...x,mute:x.id!==t.id,solo:false}))};const buffer=await this.s.engine.render(snapshot,{sampleRate:rate,assets});files.push({name:String(i+1).padStart(2,'0')+'_'+safeName(t.name)+'.wav',data:encodeWav(buffer,bits)});}
        files.push({name:'session.mid',data:encodeMidi(p)});download(zipFiles(files),safeName(p.name)+'_stems.zip');this.status(`${tracks.length} aligned stems + MIDI exported · ${rate} Hz / ${bits} bit.`);
      }else{this.status('Rendering the master…');const buffer=await this.s.engine.render(p,{sampleRate:rate,assets}),metrics=measureBuffer(buffer);download(new Blob([encodeWav(buffer,bits)],{type:'audio/wav'}),safeName(p.name)+'.wav');this.status(`Exported ${rate} Hz / ${bits} bit · peak ${dbfs(metrics.peak)} dBFS${metrics.peak>1?' · clipping: lower master and re-export':''}.`);}
      this.house?.architecture.exported?.();
    }finally{this.busy=false;if(this.tab==='export'){this.dialog.querySelector('#wbExportMaster')?.removeAttribute("disabled");this.dialog.querySelector('#wbExportStems')?.removeAttribute("disabled");}}
  }
}
