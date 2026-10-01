import { buildRack } from "./effects.js";
import { base64ToBytes } from "./storage.js";
export const frequency = (n) => 440 * 2 ** ((n - 69) / 12);
export function projectBeats(p) {
  return Math.min(
    256,
    Math.max(
      p.bars * 4,
      ...p.tracks.flatMap((t) => t.clips.map((c) => c.start + c.length)),
    ),
  );
}
export function trackTail(t) {
  const release=t.synth?.release??({keys:.4,pad:.65,bass:.12,pluck:.14,lead:.2,drums:1.2,electric:.8,bell:.8,organ:.08,marimba:.25,harp:.25,strings:.65,flute:.12,reed:.16,brass:.12,choir:.65}[t.instrument]??.18);
  const delay=Math.max(0,...(t.inserts||[]).filter(fx=>fx.enabled&&fx.type==="delay"&&fx.wet>0).map(fx=>{const feedback=fx.params.feedback??.3,time=fx.params.time??.375;return feedback>0?Math.min(30,time*Math.log(.001)/Math.log(feedback)):time;}));
  return release+(t.reverb>0?1.5:0)+delay;
}
function noise(ctx, seconds = 1) {
  const b = ctx.createBuffer(
    1,
    Math.ceil(ctx.sampleRate * seconds),
    ctx.sampleRate,
  );
  let seed = 193;
  for (let i = 0; i < b.length; i++) {
    seed = (seed * 16807) % 2147483647;
    b.getChannelData(0)[i] = (seed / 2147483647) * 2 - 1;
  }
  return b;
}
function impulse(ctx) {
  const b = ctx.createBuffer(
    2,
    Math.floor(ctx.sampleRate * 1.5),
    ctx.sampleRate,
  );
  let seed = 715;
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = ((seed / 2147483647) * 2 - 1) * (1 - i / d.length) ** 3 * 0.5;
    }
  }
  return b;
}
export function graph(ctx, p, destination = ctx.destination) {
  const master = ctx.createGain();
  master.gain.value = p.master;
  const analyzer = ctx.createAnalyser();
  analyzer.fftSize = 2048;
  master.connect(analyzer);
  analyzer.connect(destination);
  const split=ctx.createChannelSplitter(2), left=ctx.createAnalyser(), right=ctx.createAnalyser(), silent=ctx.createGain();
  left.fftSize=right.fftSize=2048;silent.gain.value=0;
  master.connect(split);split.connect(left,0);split.connect(right,1);left.connect(silent);right.connect(silent);silent.connect(ctx.destination);
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx);
  reverb.connect(master);
  const tracks = new Map();
  for (const t of p.tracks) {
    const input = ctx.createGain();
    const eq = ctx.createBiquadFilter();
    eq.type = "peaking";
    eq.frequency.value = 300;
    eq.Q.value = 0.7;
    eq.gain.value = t.eq;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = t.cutoff;
    filter.Q.value = 0.65;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = t.compress ? -20 : 0;
    comp.ratio.value = t.compress ? 3 : 1;
    comp.knee.value = 12;
    comp.attack.value = 0.012;
    comp.release.value = 0.18;
    const auto = ctx.createGain(),
      gain = ctx.createGain(),
      pan = ctx.createStereoPanner(),
      send = ctx.createGain(),
      meter = ctx.createAnalyser();
    meter.fftSize = 512;
    gain.gain.value =
      t.mute || (p.tracks.some((x) => x.solo) && !t.solo) ? 0 : t.gain;
    pan.pan.value = t.pan;
    send.gain.value = t.reverb * 0.55;
    const rack = buildRack(ctx, t.inserts || []);
    input
      .connect(eq)
      .connect(filter)
      .connect(comp)
      .connect(rack.input);
    rack.output.connect(auto)
      .connect(gain)
      .connect(pan)
      .connect(meter)
      .connect(master);
    pan.connect(send).connect(reverb);
    const meterSplit=ctx.createChannelSplitter(2),meterLeft=ctx.createAnalyser(),meterRight=ctx.createAnalyser();
    meterLeft.fftSize=meterRight.fftSize=512;
    pan.connect(meterSplit);meterSplit.connect(meterLeft,0);meterSplit.connect(meterRight,1);meterLeft.connect(silent);meterRight.connect(silent);
    tracks.set(t.id, { input, eq, filter, comp, rack, auto, gain, pan, send, meter, meterSplit,meterLeft,meterRight });
  }
  const g = { master, analyzer, reverb, split, left, right, silent, tracks, noise: noise(ctx), ctx };
  updateGraph(g, p);
  return g;
}
export function updateGraph(g, p) {
  g.master.gain.setTargetAtTime(p.master, g.ctx.currentTime, 0.01);
  const solo = p.tracks.some((t) => t.solo);
  for (const t of p.tracks) {
    const n = g.tracks.get(t.id);
    if (!n) continue;
    n.rack.update(t.inserts || []);
    n.gain.gain.setTargetAtTime(
      t.mute || (solo && !t.solo) ? 0 : t.gain,
      g.ctx.currentTime,
      0.015,
    );
    n.pan.pan.setTargetAtTime(t.pan, g.ctx.currentTime, 0.015);
    n.eq.gain.setTargetAtTime(t.eq, g.ctx.currentTime, 0.015);
    n.filter.frequency.setTargetAtTime(t.cutoff, g.ctx.currentTime, 0.02);
    n.comp.threshold.value = t.compress ? -20 : 0;
    n.comp.ratio.value = t.compress ? 3 : 1;
    n.send.gain.setTargetAtTime(t.reverb * 0.55, g.ctx.currentTime, 0.02);
  }
}
export function automationValue(points, beat) {
  if (!points.length) return 1;
  const a = [...points].sort((a, b) => a.beat - b.beat);
  if (beat <= a[0].beat) return a[0].value;
  for (let i = 1; i < a.length; i++)
    if (beat <= a[i].beat) {
      const f = (beat - a[i - 1].beat) / (a[i].beat - a[i - 1].beat || 1);
      return a[i - 1].value + (a[i].value - a[i - 1].value) * f;
    }
  return a.at(-1).value;
}
function scheduleAutomation(g, p, startBeat, origin) {
  const spb = 60 / p.bpm;
  for (const t of p.tracks) {
    const param = g.tracks.get(t.id).auto.gain;
    param.cancelScheduledValues(origin);
    param.setValueAtTime(automationValue(t.automation, startBeat), origin);
    for (const a of [...t.automation].sort((a, b) => a.beat - b.beat))
      if (a.beat > startBeat)
        param.linearRampToValueAtTime(
          a.value,
          origin + (a.beat - startBeat) * spb,
        );
  }
}
export function voice(ctx, g, track, n, time, duration) {
  const dest = g.tracks.get(track.id)?.input;
  if (!dest) return [];
  const env = ctx.createGain(),
    filter = ctx.createBiquadFilter();
  env.connect(dest);
  const sources = [],
    nodes = [env, filter];
  const v = n.velocity;
  const start = Math.max(ctx.currentTime, time),
    end = start + Math.max(0.05, duration);
  const osc = (type, f, level = 1, detune = 0) => {
    const s = ctx.createOscillator(),
      mix = ctx.createGain();
    s.type = type;
    s.frequency.setValueAtTime(f, start);
    s.detune.value = detune;
    mix.gain.value = level;
    s.connect(mix).connect(filter);
    sources.push(s);
    nodes.push(mix);
    return s;
  };
  filter.connect(env);
  filter.type = "lowpass";
  filter.frequency.value = 12000;
  let release = 0.18;
  const f = frequency(n.pitch);
  if (track.instrument === "drums") {
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(v * 0.8, start + 0.002);
    const kit = track.drumKit || "classic", soft=kit==="soft", hard=kit==="industrial";
    const pitch=n.pitch;
    if (pitch===36 || pitch===45 || pitch===50 || pitch===64) {
      const base = pitch===36 ? (hard?160:soft?100:135) : pitch===45?160:pitch===50?260:350;
      const s = osc(pitch===64?"triangle":"sine",base);
      s.frequency.exponentialRampToValueAtTime(pitch===36?43:base*.62,start+.12);
      release=pitch===36?.42:pitch===64?.22:.32;
      if(hard&&pitch===36)osc("triangle",55,.15);
      env.gain.exponentialRampToValueAtTime(.0001,start+release);
    } else if(pitch===51 || pitch===49) {
      for(const ratio of [1,1.42,2.17,3.71,5.43])osc("square",(pitch===51?460:320)*ratio,.035);
      filter.type="highpass";filter.frequency.value=pitch===51?2200:1800;
      release=pitch===51?.85:1.2;
      env.gain.exponentialRampToValueAtTime(.0001,start+release);
    } else {
      const s=ctx.createBufferSource();s.buffer=g.noise;s.loop=true;s.connect(filter);sources.push(s);
      const hat=[42,46,70].includes(pitch);
      filter.type=hat?"highpass":"bandpass";filter.frequency.value=hat?(soft?6000:hard?9000:7500):pitch===39?1200:1700;filter.Q.value=.65;
      release=pitch===42?.065:pitch===46?.34:pitch===70?.045:pitch===39?.23:.18;
      if(pitch===38)osc("triangle",soft?160:185,.25);
      if(pitch===39){for(const offset of [.012,.025,.04]){env.gain.setValueAtTime(v*.65,start+offset);env.gain.linearRampToValueAtTime(v*.12,start+offset+.008);}}
      env.gain.exponentialRampToValueAtTime(.0001,start+release);
    }
    duration = release + 0.05;
  } else {
    const attack = track.synth?.attack ?? (["pad","strings","choir"].includes(track.instrument) ? .18 : .008);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(
      v * (track.instrument === "bass" ? 0.38 : 0.21),
      start + Math.min(attack, duration / 3),
    );
    if (track.instrument === "keys") {
      osc("sine", f);
      osc("sine", f * 2, 0.28);
      osc("sine", f * 3, 0.1);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0001, v * 0.035), n.hold ? start + 2.5 : end);
      release = 0.4;
    } else if (track.instrument === "bass") {
      osc("sine", f, 0.9);
      osc("sawtooth", f, 0.24);
      filter.frequency.value = 450;
      env.gain.setValueAtTime(v * 0.28, Math.max(start + 0.01, end - 0.04));
      release = 0.12;
    } else if (track.instrument === "pad") {
      osc("triangle", f, 0.7, -8);
      osc("triangle", f, 0.7, 8);
      osc("sine", f * 2, 0.2);
      filter.frequency.value = 2200;
      env.gain.setValueAtTime(v * 0.18, end);
      release = 0.65;
    } else if (track.instrument === "pluck") {
      osc("sine", f);
      osc("sine", f * 3.002, 0.22);
      env.gain.exponentialRampToValueAtTime(0.0002, n.hold ? start + 1.8 : end);
      release = 0.14;
    } else if (track.instrument==="electric" || track.instrument==="bell") {
      const carrier=osc("sine",f,1),mod=ctx.createOscillator(),depth=ctx.createGain();
      mod.frequency.value=f*(track.instrument==="bell"?1.414:2);
      depth.gain.setValueAtTime(f*(track.instrument==="bell"?2.7:1.1),start);
      depth.gain.exponentialRampToValueAtTime(f*.03,end+.2);
      mod.connect(depth).connect(carrier.frequency);sources.push(mod);nodes.push(depth);
      osc("sine",f*2,.08);env.gain.exponentialRampToValueAtTime(.0002,n.hold?start+1.8:end);release=.8;
    } else if(track.instrument==="organ") {
      [1,2,3,4,6,8].forEach((ratio,i)=>osc("sine",f*ratio,[.55,.32,.18,.12,.08,.04][i]));
      env.gain.setValueAtTime(v*.18,end);release=.08;
    } else if(track.instrument==="marimba" || track.instrument==="harp") {
      const ratios=track.instrument==="marimba"?[1,4,10]:[1,2.003,3.009,5.02];
      ratios.forEach((ratio,i)=>osc("sine",f*ratio,[1,.2,.06,.03][i]));
      env.gain.exponentialRampToValueAtTime(.0002,n.hold?start+1.8:end);release=.25;
    } else if(track.instrument==="strings") {
      [-13,-7,-2,2,7,13].forEach(d=>osc("sawtooth",f,.16,d));
      filter.frequency.value=2800;env.gain.setValueAtTime(v*.14,end);release=.65;
    } else if(track.instrument==="flute") {
      osc("sine",f,.9);osc("sine",f*2,.12);osc("sine",f*3,.04);
      const breath=ctx.createBufferSource(),level=ctx.createGain();breath.buffer=g.noise;breath.loop=true;level.gain.value=.018;breath.connect(level).connect(filter);sources.push(breath);nodes.push(level);
      filter.frequency.value=4000;env.gain.setValueAtTime(v*.17,end);release=.12;
    } else if(track.instrument==="reed") {
      [1,3,5,7].forEach((r,i)=>osc("sine",f*r,[.8,.25,.1,.04][i]));
      filter.frequency.value=2100;filter.Q.value=1.4;env.gain.setValueAtTime(v*.18,end);release=.16;
    } else if(track.instrument==="brass") {
      osc("sawtooth",f,.7,-3);osc("sawtooth",f,.3,4);
      filter.Q.value=1.6;filter.frequency.setValueAtTime(350,start);filter.frequency.exponentialRampToValueAtTime(2400,start+Math.min(.12,duration/2));
      env.gain.setValueAtTime(v*.18,end);release=.12;
    } else if(track.instrument==="choir") {
      osc("sawtooth",f,.45,-7);osc("sawtooth",f,.45,7);osc("sine",f,.4);
      filter.type="bandpass";filter.frequency.value=850;filter.Q.value=1.6;
      env.gain.setValueAtTime(v*.16,end);release=.65;
    } else {
      osc("sawtooth", f, 0.5, -5);
      osc("sawtooth", f, 0.5, 5);
      filter.frequency.value = 2200;
      env.gain.setValueAtTime(v * 0.16, end);
      release = 0.2;
    }
    release = track.synth?.release ?? release;
    if(track.synth?.brightness)filter.frequency.setValueAtTime(track.synth.brightness,start);
    env.gain.exponentialRampToValueAtTime(0.0001, end + release);
  }
  const stop =
    track.instrument === "drums"
      ? start + duration + 0.2
      : end + release + 0.02;
  for (const s of sources) {
    s.start(start);
    s.stop(stop);
  }
  sources.release=()=>{
    const now=ctx.currentTime;
    if(track.instrument==="drums")return;
    env.gain.cancelAndHoldAtTime(now);env.gain.exponentialRampToValueAtTime(.0001,now+release);
    for(const source of sources){try{source.stop(now+release+.02);}catch{}}
  };
  let ended = 0;
  for (const s of sources)
    s.onended = () => {
      s.disconnect();
      if (++ended === sources.length) for (const n of nodes) n.disconnect();
    };
  return sources;
}
export function events(p, assets) {
  const spb = 60 / p.bpm,
    out = [];
  for (const t of p.tracks)
    for (const c of t.clips) {
      if (c.asset && assets.has(c.asset)) {
        out.push({
          beat: c.start,
          duration: c.length * spb,
          track: t,
          clip: c,
          buffer: assets.get(c.asset),
          offset: c.offset || 0,
        });
      } else
        for (const n of c.notes) {
          if (n.start >= c.length) continue;
          const swing =
            t.instrument === "drums" && Math.round(n.start * 4) % 2
              ? p.swing * 0.125
              : 0;
          out.push({
            beat: c.start + n.start + swing,
            duration: Math.min(n.duration, c.length - n.start) * spb,
            track: t,
            note: n,
          });
        }
    }
  return out.sort((a, b) => a.beat - b.beat);
}
const reversedBuffers=new WeakMap();
function reversed(ctx, buffer) {
  if(reversedBuffers.has(buffer))return reversedBuffers.get(buffer);
  const out=ctx.createBuffer(buffer.numberOfChannels,buffer.length,buffer.sampleRate);
  for(let ch=0;ch<buffer.numberOfChannels;ch++){const src=buffer.getChannelData(ch),dst=out.getChannelData(ch);for(let i=0;i<src.length;i++)dst[i]=src[src.length-1-i];}
  reversedBuffers.set(buffer,out);return out;
}
function playEvent(ctx, g, e, time, skip = 0) {
  if (e.buffer) {
    const s = ctx.createBufferSource(),
      gain = ctx.createGain();
    s.buffer = e.clip.reverse ? reversed(ctx,e.buffer) : e.buffer;
    const level=e.clip.gain??1;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + Math.max(.001, Math.min(e.clip.fadeIn??.005,(e.duration-skip)/2)));
    const available = Math.max(0, e.buffer.duration - e.offset - skip),
      dur = Math.min(e.duration - skip, available);
    if (dur <= 0.001) return [];
    gain.gain.setValueAtTime(level, time + Math.max(.001, dur - Math.min(e.clip.fadeOut??.01,dur/2)));
    gain.gain.linearRampToValueAtTime(0.0001, time + dur);
    s.connect(gain).connect(g.tracks.get(e.track.id).input);
    s.start(time, e.offset + skip, dur);
    s.onended = () => {
      s.disconnect();
      gain.disconnect();
    };
    return [s];
  }
  return voice(
    ctx,
    g,
    e.track,
    e.note,
    time,
    Math.max(0.02, e.duration - skip),
  );
}
export function encodeWav(buffer, bits = 16) {
  const bytes = bits === 24 ? 3 : 2;
  const n = buffer.length,
    channels = buffer.numberOfChannels;
  const a = new ArrayBuffer(44 + n * channels * bytes),
    v = new DataView(a);
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, a.byteLength - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * channels * bytes, true);
  v.setUint16(32, channels * bytes, true);
  v.setUint16(34, bytes * 8, true);
  str(36, "data");
  v.setUint32(40, n * channels * bytes, true);
  const data = Array.from({ length: channels }, (_, i) =>
    buffer.getChannelData(i),
  );
  for (let i = 0; i < n; i++)
    for (let c = 0; c < channels; c++) {
      const x = Math.max(-1, Math.min(1, data[c][i]));
      const offset = 44 + (i * channels + c) * bytes;
      if(bytes===2) v.setInt16(offset, x < 0 ? Math.round(x * 32768) : Math.round(x * 32767), true);
      else {const value=Math.round(x*(x<0?8388608:8388607));v.setUint8(offset,value&255);v.setUint8(offset+1,(value>>8)&255);v.setUint8(offset+2,(value>>16)&255);}
    }
  return a;
}
export class AudioEngine extends EventTarget {
  constructor() {
    super();
    this.assets = new Map();
    this.active = new Set();
    this.liveActive = new Set();
    this.playing = false;
    this.position = 0;
    this.loop = true;
    this.metronome = false;
    this.g = null;
    this.worker = null;
  }
  async init(resume = true) {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.output = this.ctx.createGain();
      this.projectOutput = this.ctx.createGain();this.projectOutput.connect(this.output);
      this.monitorStereo=this.ctx.createGain();this.monitorMono=this.ctx.createGain();this.monitorPhone=this.ctx.createGain();
      this.output.connect(this.monitorStereo).connect(this.ctx.destination);
      this.monitorRack=buildRack(this.ctx,[{id:"monitor-mono",type:"width",enabled:true,wet:1,params:{width:0}}]);
      this.output.connect(this.monitorRack.input);this.monitorRack.output.connect(this.monitorMono).connect(this.ctx.destination);
      const hp=this.ctx.createBiquadFilter(),lp=this.ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=300;lp.frequency.value=3400;
      this.output.connect(hp).connect(lp).connect(this.monitorPhone).connect(this.ctx.destination);
      this.setMonitor(this.monitorMode||"stereo",true);
      this.ctx.onstatechange = () => {
        if (this.ctx.state === "suspended" && this.playing) this.pause();
      };
    }
    if (resume) await this.ctx.resume();
    return this.ctx;
  }
  async loadAssets(p) {
    const entries = Object.entries(p.assets || {});
    if (!entries.length) {
      this.assets = new Map();
      return;
    }
    await this.init(false);
    const staged = new Map();
    for (const [id, a] of entries)
      staged.set(id, await this.ctx.decodeAudioData(base64ToBytes(a.data)));
    // Keep the current session's buffers intact if any imported asset fails.
    this.assets = staged;
  }

  async play(p, position = this.position) {
    if (this.playing) return;
    await this.init();
    this.p = p;
    this.position = Math.min(position, projectBeats(p) - 0.001);
    this.startBeat = this.position;
    this.origin = this.ctx.currentTime + 0.045;
    this.g = graph(this.ctx, p, this.projectOutput);
    this.list = events(p, this.assets);
    this.eventIndex = 0;
    this.clickIndex = Math.ceil(this.startBeat);
    this.nextLoop = null;
    this.playing = true;
    scheduleAutomation(this.g, p, this.startBeat, this.origin);
    while (
      this.eventIndex < this.list.length &&
      this.list[this.eventIndex].beat < this.startBeat
    ) {
      const e = this.list[this.eventIndex++],
        skip = ((this.startBeat - e.beat) * 60) / p.bpm;
      if (e.duration > skip)
        this.register(playEvent(this.ctx, this.g, e, this.origin, skip));
    }
    this.tick();
    if (!this.worker) {
      const url = URL.createObjectURL(
        new Blob(["setInterval(()=>postMessage(0),25)"], {
          type: "text/javascript",
        }),
      );
      this.worker = new Worker(url);
      URL.revokeObjectURL(url);
      this.worker.onmessage = () => this.tick();
    }
    this.dispatchEvent(new Event("transport"));
  }
  register(nodes, bucket=this.active) {
    for (const s of nodes) {
      bucket.add(s);
      s.addEventListener("ended", () => bucket.delete(s), { once: true });
    }
  }
  get beat() {
    return this.playing
      ? Math.max(
          this.startBeat,
          this.startBeat +
            ((this.ctx.currentTime - this.origin) * this.p.bpm) / 60,
        )
      : this.position;
  }
  scheduleCycle(cycle, end, horizon) {
    const spb=60/this.p.bpm;
    while (cycle.eventIndex < this.list.length) {
      const e = this.list[cycle.eventIndex],
        time = cycle.origin + (e.beat - cycle.startBeat) * spb;
      if (time >= horizon) break;
      cycle.eventIndex++;
      if (time >= this.ctx.currentTime - 0.015 && e.beat < end)
        this.register(
          playEvent(this.ctx, this.g, e, Math.max(time, this.ctx.currentTime)),
        );
    }
    while (
      this.metronome &&
      cycle.clickIndex < end &&
      cycle.origin + (cycle.clickIndex - cycle.startBeat) * spb < horizon
    ) {
      const time = cycle.origin + (cycle.clickIndex - cycle.startBeat) * spb;
      if (time >= this.ctx.currentTime) {
        const o = this.ctx.createOscillator(),
          v = this.ctx.createGain();
        o.frequency.value = cycle.clickIndex % 4 === 0 ? 1400 : 900;
        v.gain.setValueAtTime(0.06, time);
        v.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
        o.connect(v).connect(this.g.master);
        o.start(time);
        o.stop(time + 0.05);
        o.onended = () => {
          o.disconnect();
          v.disconnect();
        };
        this.register([o]);
      }
      cycle.clickIndex++;
    }
    if (!this.metronome) cycle.clickIndex = Math.ceil(Math.max(cycle.startBeat,cycle.startBeat+(this.ctx.currentTime-cycle.origin)/spb));
  }
  tick() {
    if (!this.playing) return;
    const end=projectBeats(this.p),spb=60/this.p.bpm,horizon=this.ctx.currentTime+.18;
    this.scheduleCycle(this,end,horizon);
    const boundary=this.origin+(end-this.startBeat)*spb;
    // Schedule the next pass before its deadline on the same graph. A loop
    // must not stop playback or insert another 45 ms transport lead-in.
    if(this.loop&&horizon>boundary){
      if(!this.nextLoop){
        this.nextLoop={origin:boundary,startBeat:0,eventIndex:0,clickIndex:0};
        scheduleAutomation(this.g,this.p,0,boundary);
      }
      this.scheduleCycle(this.nextLoop,end,horizon);
    }
    if (this.beat >= end) {
      if (this.loop) {
        Object.assign(this,this.nextLoop);
        this.nextLoop=null;
        this.tick();
      } else {
        this.stop();
        this.dispatchEvent(new Event("end"));
      }
    }
  }
  pause() {
    if (this.playing) this.position = this.beat;
    this.stop(false);
  }
  stop(reset = true) {
    this.playing = false;
    this.nextLoop=null;
    const stopAt=this.ctx?this.ctx.currentTime+.015:0;
    for (const s of this.active) {
      try {
        s.stop(stopAt);
      } catch {}
    }
    this.active.clear();
    if (this.g) {
      const now=this.ctx.currentTime,param=this.g.master.gain;
      const held=param.value;
      param.cancelScheduledValues(now);
      param.setValueAtTime(held,now);
      param.linearRampToValueAtTime(0,now+.012);
      const old = this.g;
      // Disconnect after the fade on the audio clock, even if rendering lags
      // behind wall-clock timers or the context is temporarily suspended.
      const cleanup=this.ctx.createBufferSource();
      cleanup.buffer=this.ctx.createBuffer(1,1,this.ctx.sampleRate);
      cleanup.onended=() => {
        old.master.disconnect();
        old.analyzer.disconnect();
        old.reverb.disconnect();
        for(const key of ["split","left","right","silent"])old[key].disconnect();
        for (const n of old.tracks.values())
          for (const node of Object.values(n)) node.disconnect();
        cleanup.disconnect();
      };
      cleanup.start(now+.025);
      this.g = null;
    }
    if (reset) this.position = 0;
    this.dispatchEvent(new Event("transport"));
  }
  async seek(p, beat) {
    const was = this.playing;
    this.stop(false);
    this.position = Math.max(0, Math.min(beat, projectBeats(p) - 0.001));
    if (was) await this.play(p, this.position);
  }
  async noteOn(t,pitch,velocity=.7) {
    await this.init();
    clearTimeout(this.liveIdleTimer);
    const signature=JSON.stringify({...t,clips:[],automation:[]});
    if(!this.live || this.liveSignature!==signature){
      if(this.live){const old=this.live;setTimeout(()=>{old.master.disconnect();old.reverb.disconnect();old.analyzer.disconnect();for(const key of ["split","left","right","silent"])old[key].disconnect();for(const nodes of old.tracks.values())for(const node of Object.values(nodes))node.disconnect();},2500);}
      this.live=graph(this.ctx,{master:.65,tracks:[{...t,mute:false,solo:false,automation:[]}]},this.projectOutput);this.liveSignature=signature;
    }
    const sources=voice(this.ctx,this.live,t,{pitch,velocity,hold:true},this.ctx.currentTime+.005,t.instrument==="drums"?.2:360);
    this.register(sources,this.liveActive);
    const live=this.live;
    return {release:()=>{
      sources.release();clearTimeout(this.liveIdleTimer);
      this.liveIdleTimer=setTimeout(()=>{
        if(this.live!==live||this.liveActive.size)return;
        live.master.disconnect();live.reverb.disconnect();live.analyzer.disconnect();for(const key of ["split","left","right","silent"])live[key].disconnect();for(const nodes of live.tracks.values())for(const node of Object.values(nodes))node.disconnect();
        this.live=null;this.liveSignature=null;
      },Math.ceil((trackTail(t)+.2)*1000));
    }};
  }
  async audition(t, pitch) {
    await this.init();
    const p = {
        master: 0.65,
        tracks: [{ ...t, mute: false, solo: false, automation: [] }],
      },
      g = graph(this.ctx, p, this.projectOutput);
    voice(
      this.ctx,
      g,
      t,
      { pitch, velocity: 0.7 },
      this.ctx.currentTime + 0.005,
      0.35,
    );
    setTimeout(() => {
      g.master.disconnect();
      g.analyzer.disconnect();
      g.reverb.disconnect();
      for(const key of ["split","left","right","silent"])g[key].disconnect();
      for (const n of g.tracks.values())
        for (const node of Object.values(n)) node.disconnect();
    }, Math.ceil((.4+Math.max(2,trackTail(t)))*1000));
  }
  setMonitor(mode,initial=false) {
    this.monitorMode=mode;
    if(!this.ctx)return;
    for(const [key,name] of [["monitorStereo","stereo"],["monitorMono","mono"],["monitorPhone","phone"]]){const value=mode===name?1:0;if(initial)this[key].gain.setValueAtTime(value,this.ctx.currentTime);else this[key].gain.setTargetAtTime(value,this.ctx.currentTime,.02);}
  }
  updateMix(p) {
    if (this.g) updateGraph(this.g, p);
  }
  async refresh(p) {
    const was = this.playing,
      beat = this.beat;
    this.stop(false);
    this.p = p;
    this.position = Math.min(beat, projectBeats(p) - 0.001);
    if (was) await this.play(p, this.position);
  }
  async render(p, options = {}) {
    const tail=Math.max(2,...p.tracks.map(trackTail));
    const seconds = (projectBeats(p) * 60) / p.bpm + tail;
    if (seconds > 390)
      throw Error("Export is limited to 6½ minutes in this release.");
    const sampleRate = options.sampleRate || 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate),
      g = graph(ctx, p);
    scheduleAutomation(g, p, 0, 0);
    for (const e of events(p, options.assets || this.assets))
      playEvent(ctx, g, e, (e.beat * 60) / p.bpm);
    return ctx.startRendering();
  }
  metrics() {
    if (!this.g)
      return {
        peak: 0,
        rms: 0,
        tracks: new Map(),
        spectrum: new Uint8Array(0),
      };
    const measure = (a) => {
      const d = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(d);
      let peak = 0,
        sum = 0;
      for (const x of d) {
        peak = Math.max(peak, Math.abs(x));
        sum += x * x;
      }
      return { peak, rms: Math.sqrt(sum / d.length) };
    };
    const stereoPower=(left,right)=>{
      const l=new Float32Array(left.frequencyBinCount),r=new Float32Array(right.frequencyBinCount);
      left.getFloatFrequencyData(l);right.getFloatFrequencyData(r);
      return Float32Array.from(l,(v,i)=>(10**(v/10)+10**(r[i]/10))/2);
    };
    const masterPower=stereoPower(this.g.left,this.g.right);
    const spectrum=Uint8Array.from(masterPower,v=>Math.max(0,Math.min(255,(10*Math.log10(v)-this.g.left.minDecibels)/(this.g.left.maxDecibels-this.g.left.minDecibels)*255)));
    const tracks = new Map();
    for (const [id, n] of this.g.tracks) {
      const l=measure(n.meterLeft),r=measure(n.meterRight), measured={peak:Math.max(l.peak,r.peak),rms:Math.sqrt((l.rms*l.rms+r.rms*r.rms)/2)};
      const bins = stereoPower(n.meterLeft,n.meterRight);
      let power = 0,
        weighted = 0;
      for (let i = 1; i < bins.length; i++) {
        const amplitude = bins[i];
        power += amplitude;
        weighted += (amplitude * i * this.ctx.sampleRate) / n.meter.fftSize;
      }
      measured.centroid = power > 1e-10 ? weighted / power : 0;
      measured.powerSpectrum=Array.from(bins);
      tracks.set(id, measured);
    }
    const left=new Float32Array(this.g.left.fftSize),right=new Float32Array(this.g.right.fftSize);
    this.g.left.getFloatTimeDomainData(left);this.g.right.getFloatTimeDomainData(right);
    let lr=0,ll=0,rr=0;for(let i=0;i<left.length;i++){lr+=left[i]*right[i];ll+=left[i]*left[i];rr+=right[i]*right[i];}
    let peak=0;for(let i=0;i<left.length;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
    const measured={peak,rms:Math.sqrt((ll+rr)/(left.length*2))};
    return { ...measured, crest:measured.rms?20*Math.log10(measured.peak/measured.rms):0, correlation:ll*rr?lr/Math.sqrt(ll*rr):0, left,right,tracks,spectrum };
  }
}
