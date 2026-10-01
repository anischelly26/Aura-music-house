import { uid } from './project.js';

/** Live polyphonic keyboard and optional Web MIDI; MIDI permission is user initiated. */
export class Performance {
  constructor(studio,changed){this.s=studio;this.changed=changed;this.held=new Map();this.enabled=false;this.base=60;this.velocity=.7;this.capture=null;this.mapping=['KeyA','KeyW','KeyS','KeyE','KeyD','KeyF','KeyT','KeyG','KeyY','KeyH','KeyU','KeyJ','KeyK','KeyO','KeyL','KeyP','Semicolon'];
    addEventListener('keydown',e=>{if(!this.enabled||e.target.closest('input,textarea,select')||e.ctrlKey||e.metaKey||e.altKey)return;const offset=this.mapping.indexOf(e.code);if(offset<0||e.repeat)return;e.preventDefault();this.on(e.code,this.base+offset,this.velocity);});
    addEventListener('keyup',e=>this.off(e.code));addEventListener('blur',()=>this.releaseAll());
  }
  async on(id,pitch,velocity){
    if(this.held.has(id))return;const t=this.s.getTrack();if(!t||t.instrument==='audio')return;
    const pending={pitch,velocity,released:false,start:this.s.engine.ctx?.currentTime};this.held.set(id,pending);
    try{pending.voice=await this.s.engine.noteOn(t,pitch,velocity);pending.start=this.s.engine.ctx.currentTime;if(pending.released)pending.voice.release();this.changed();}catch(e){this.held.delete(id);this.s.toast(e.message);}
  }
  off(id){const note=this.held.get(id);if(!note)return;note.released=true;note.voice?.release();this.held.delete(id);
    const cap=this.capture;if(cap&&note.start>=cap.start){const end=this.s.engine.ctx.currentTime,start=(note.start-cap.start)*cap.bpm/60,duration=(end-note.start)*cap.bpm/60;if(start<cap.length)cap.notes.push({id:uid(),pitch:note.pitch,start:Math.max(0,start),duration:Math.max(.02,Math.min(cap.length-start,duration)),velocity:note.velocity});}
    this.changed();
  }
  releaseAll(){for(const id of [...this.held.keys()])this.off(id);}
  async connect(){
    if(!navigator.requestMIDIAccess)throw Error('Web MIDI is unavailable in this browser. The computer keyboard remains playable.');
    this.access=await navigator.requestMIDIAccess({sysex:false});
    this.access.onstatechange=()=>this.attach();this.attach();return [...this.access.inputs.values()].map(p=>p.name||'MIDI input');
  }
  attach(){for(const input of this.access.inputs.values())input.onmidimessage=e=>{if(!this.enabled)return;const [status,pitch,velocity]=e.data,type=status&240,id=input.id+':'+(status&15)+':'+pitch;if(type===144&&velocity>0)this.on(id,pitch,velocity/127);else if(type===128||(type===144&&!velocity))this.off(id);};}
  async record(){
    const c=this.s.getClip(),t=this.s.getTrack(),p=this.s.getProject();if(!c||t?.instrument==='audio'||t?.instrument==='drums')throw Error('Select a melodic MIDI clip.');
    await this.s.engine.init();const ctx=this.s.engine.ctx,spb=60/p.bpm,start=ctx.currentTime+4*spb+.08;
    this.capture={trackId:t.id,clipId:c.id,length:c.length,bpm:p.bpm,start,notes:[]};
    for(let beat=0;beat<4;beat++){const o=ctx.createOscillator(),g=ctx.createGain(),time=start-(4-beat)*spb;o.frequency.value=beat===0?1200:800;g.gain.setValueAtTime(.05,time);g.gain.exponentialRampToValueAtTime(.0001,time+.04);o.connect(g).connect(this.s.engine.output);o.start(time);o.stop(time+.05);o.onended=()=>{o.disconnect();g.disconnect();};}
    this.captureTimer=setTimeout(()=>this.finish(),(start-ctx.currentTime+c.length*spb)*1000);this.changed();
  }
  finish(){
    if(!this.capture)return;this.releaseAll();const cap=this.capture;this.capture=null;clearTimeout(this.captureTimer);
    if(cap.notes.length)this.s.commit('Capture live MIDI',p=>{const clip=p.tracks.find(t=>t.id===cap.trackId)?.clips.find(c=>c.id===cap.clipId);if(clip)clip.notes.push(...cap.notes.slice(0,4096-clip.notes.length));});
    this.changed();
  }
}
