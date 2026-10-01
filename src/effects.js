import { uid } from "./id.js";
/** Native Web Audio inserts. Exactly the same graph is built for offline rendering. */
export const effects = {
  eq: {name:'Parametric EQ', params:{frequency:[20,16000,1000,1], gain:[-18,18,0,.1], q:[.1,12,.7,.1]}},
  compressor: {name:'Compressor', params:{threshold:[-60,0,-22,1], ratio:[1,20,3,.1], attack:[.001,.2,.012,.001], release:[.02,1,.18,.01]}},
  delay: {name:'Feedback delay', params:{time:[.02,1.5,.375,.005], feedback:[0,.85,.3,.01]}},
  saturation: {name:'Saturation', params:{drive:[1,20,3,.1]}},
  chorus: {name:'Chorus', params:{rate:[.1,8,.7,.1], depth:[0,.012,.004,.0001]}},
  tremolo: {name:'Tremolo', params:{rate:[.1,16,4,.1], depth:[0,1,.5,.01]}},
  filter: {name:'High-pass filter', params:{frequency:[20,4000,80,1], q:[.1,8,.7,.1]}},
  width: {name:'Stereo width', params:{width:[0,2,1,.01]}},
};
export function makeEffect(type) {
  const spec=effects[type];
  if(!spec)throw Error('Unsupported insert.');
  return {id:uid(), type, enabled:true, wet:type==='chorus'||type==='delay'?.25:1, params:Object.fromEntries(Object.entries(spec.params).map(([k,v])=>[k,v[2]]))};
}
export function buildRack(ctx, inserts=[]) {
  const input=ctx.createGain(), output=ctx.createGain();
  const nodes=[input,output], modulators=[], slots=[];
  let previous=input;
  const add=(node)=>{nodes.push(node);return node;};
  for(const fx of inserts) {
    if(!effects[fx.type]) continue;
    const entry=add(ctx.createGain()), exit=add(ctx.createGain());
    const dry=add(ctx.createGain()), wet=add(ctx.createGain());
    previous.connect(entry);entry.connect(dry).connect(exit);
    const p=fx.params||{}, bindings={}, set=(key,param)=>{bindings[key]=param;param.value=p[key]??effects[fx.type].params[key][2];};
    if(fx.type==='eq'||fx.type==='filter') {
      const filter=add(ctx.createBiquadFilter());filter.type=fx.type==='eq'?'peaking':'highpass';
      set('frequency',filter.frequency);set('q',filter.Q);if(fx.type==='eq')set('gain',filter.gain);
      entry.connect(filter).connect(wet);
    } else if(fx.type==='compressor') {
      const comp=add(ctx.createDynamicsCompressor());
      for(const key of ['threshold','ratio','attack','release']) set(key,comp[key]);
      comp.knee.value=12;entry.connect(comp).connect(wet);
    } else if(fx.type==='delay') {
      const delay=add(ctx.createDelay(2)), feedback=add(ctx.createGain());
      set('time',delay.delayTime);set('feedback',feedback.gain);
      entry.connect(delay).connect(wet);delay.connect(feedback).connect(delay);
    } else if(fx.type==='saturation') {
      const shaper=add(ctx.createWaveShaper());shaper.oversample='2x';
      const curve=drive=>{const d=new Float32Array(2048);for(let i=0;i<d.length;i++) d[i]=Math.tanh((i/(d.length-1)*2-1)*drive)/Math.tanh(drive);shaper.curve=d;};
      curve(p.drive??3);bindings.drive={setTargetAtTime:curve};entry.connect(shaper).connect(wet);
    } else if(fx.type==='chorus'||fx.type==='tremolo') {
      const lfo=add(ctx.createOscillator()), depth=add(ctx.createGain());
      set('rate',lfo.frequency);set('depth',depth.gain);
      const target=add(fx.type==='chorus'?ctx.createDelay(.1):ctx.createGain());
      if(fx.type==='chorus')target.delayTime.value=.018;
      else {target.gain.value=1-(p.depth??.5)/2;depth.gain.value=(p.depth??.5)/2;}
      lfo.connect(depth).connect(fx.type==='chorus'?target.delayTime:target.gain);
      entry.connect(target).connect(wet);lfo.start(0);modulators.push(lfo);
      if(fx.type==='tremolo')bindings.depth={setTargetAtTime:v=>{depth.gain.setTargetAtTime(v/2,ctx.currentTime,.02);target.gain.setTargetAtTime(1-v/2,ctx.currentTime,.02);}};
    } else if(fx.type==='width') {
      const split=add(ctx.createChannelSplitter(2)), merge=add(ctx.createChannelMerger(2));
      entry.connect(split);
      const matrix=[];
      for(let from=0;from<2;from++)for(let to=0;to<2;to++) {
        const gain=add(ctx.createGain());gain.gain.value=from===to?(1+(p.width??1))/2:(1-(p.width??1))/2;split.connect(gain,from);gain.connect(merge,0,to);matrix.push({gain,from,to});
      }
      const width=v=>matrix.forEach(({gain,from,to})=>gain.gain.setTargetAtTime(from===to?(1+v)/2:(1-v)/2,ctx.currentTime,.015));
      width(p.width??1);bindings.width={setTargetAtTime:width};merge.connect(wet);
    }
    dry.gain.value=fx.enabled===false?1:1-(fx.wet??1);wet.gain.value=fx.enabled===false?0:fx.wet??1;
    wet.connect(exit);slots.push({id:fx.id,dry,wet,bindings});previous=exit;
  }
  previous.connect(output);
  const rack={input,output,slots,update(inserts){
    for(const slot of slots){const fx=inserts.find(x=>x.id===slot.id);if(!fx)continue;
      const mix=fx.enabled===false?0:fx.wet??1;
      slot.dry.gain.setTargetAtTime(1-mix,ctx.currentTime,.015);slot.wet.gain.setTargetAtTime(mix,ctx.currentTime,.015);
      for(const [key,param] of Object.entries(slot.bindings))param.setTargetAtTime(fx.params?.[key]??effects[fx.type].params[key][2],ctx.currentTime,.015);
    }
  },disconnect(){for(const lfo of modulators){try{lfo.stop();}catch{}}for(const node of nodes)node.disconnect();}};
  rack.update(inserts);return rack;
}
