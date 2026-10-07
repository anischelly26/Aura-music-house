/**
 * Interface and room sound, synthesized on the shared AudioContext and routed to
 * the engine's interface bus. Nothing here reaches the project output or an export.
 */
export class SoundDesign {
  constructor(engine) {
    this.engine = engine;
    this.enabled = localStorage.getItem("aura-ui-sound") !== "off";
    this.level = Number(localStorage.getItem("aura-ui-level") ?? 0.5);
    this.beds = null;
    this.targets = { room: 0, rain: 0, drone: 0 };
    this.lastStep = 0;
  }
  get ctx() {
    const ctx = this.engine.ctx;
    return ctx && ctx.state === "running" && this.engine.sfx ? ctx : null;
  }
  setEnabled(on) {
    this.enabled = on;
    localStorage.setItem("aura-ui-sound", on ? "on" : "off");
    this.applyBeds();
  }
  setLevel(value) {
    this.level = value;
    this.engine.sfxLevel = value;
    localStorage.setItem("aura-ui-level", String(value));
    if (this.engine.sfx) this.engine.sfx.gain.setTargetAtTime(value, this.engine.ctx.currentTime, 0.05);
  }
  noiseBuffer(ctx) {
    if (this.noise?.sampleRate === ctx.sampleRate) return this.noise;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = buffer.getChannelData(0);
    let seed = 4201, brown = 0;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      const white = (seed / 2147483647) * 2 - 1;
      brown = (brown + white * 0.04) / 1.02;
      data[i] = white * 0.5 + brown * 2.2;
    }
    return (this.noise = buffer);
  }
  /** One enveloped oscillator; the building block for every tactile sound. */
  tone({ type = "sine", from = 440, to = from, gain = 0.08, attack = 0.002, decay = 0.08, delay = 0, pan = 0 }) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + delay, osc = ctx.createOscillator(), amp = ctx.createGain(), place = ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + decay);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    place.pan.value = pan;
    osc.connect(amp).connect(place).connect(this.engine.sfx);
    osc.start(t);
    osc.stop(t + attack + decay + 0.03);
    osc.onended = () => { osc.disconnect(); amp.disconnect(); place.disconnect(); };
  }
  /** A filtered noise burst: footsteps, fabric, needle crackle, door air. */
  burst({ type = "bandpass", frequency = 1200, q = 1, gain = 0.06, attack = 0.003, decay = 0.09, delay = 0, pan = 0, sweep = 0 }) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + delay, source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), amp = ctx.createGain(), place = ctx.createStereoPanner();
    source.buffer = this.noiseBuffer(ctx);
    source.loop = true;
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, t);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * sweep), t + attack + decay);
    filter.Q.value = q;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    place.pan.value = pan;
    source.connect(filter).connect(amp).connect(place).connect(this.engine.sfx);
    source.start(t, Math.random() * 1.5);
    source.stop(t + attack + decay + 0.03);
    source.onended = () => { source.disconnect(); filter.disconnect(); amp.disconnect(); place.disconnect(); };
  }
  // ——— Vocabulary. Each sound is short, quiet and physical. ———
  tick() { this.tone({ type: "triangle", from: 1900, to: 1500, gain: 0.035, decay: 0.03 }); }
  press() { this.tone({ type: "sine", from: 210, to: 120, gain: 0.07, decay: 0.05 }); this.burst({ frequency: 3200, gain: 0.02, decay: 0.02 }); }
  release() { this.tone({ type: "sine", from: 160, to: 230, gain: 0.03, decay: 0.035 }); }
  toggle(on) { this.tone({ type: "square", from: on ? 620 : 420, to: on ? 880 : 300, gain: 0.018, decay: 0.045 }); this.burst({ frequency: 2400, gain: 0.03, decay: 0.018 }); }
  knob() {
    const now = performance.now();
    if (now - (this.lastKnob || 0) < 38) return;
    this.lastKnob = now;
    this.burst({ frequency: 5200, q: 4, gain: 0.014, decay: 0.012 });
  }
  fader() {
    const now = performance.now();
    if (now - (this.lastFader || 0) < 60) return;
    this.lastFader = now;
    this.burst({ type: "lowpass", frequency: 900, gain: 0.018, decay: 0.05 });
  }
  open() { this.tone({ from: 320, to: 640, gain: 0.03, decay: 0.16 }); this.burst({ type: "highpass", frequency: 3000, gain: 0.018, decay: 0.2, sweep: 2 }); }
  close() { this.tone({ from: 520, to: 260, gain: 0.028, decay: 0.14 }); }
  confirm() { this.tone({ from: 660, gain: 0.03, decay: 0.12 }); this.tone({ from: 990, gain: 0.025, decay: 0.18, delay: 0.07 }); }
  deny() { this.tone({ type: "triangle", from: 180, to: 140, gain: 0.05, decay: 0.12 }); }
  footstep(intensity = 1, soft = false) {
    const now = performance.now();
    if (now - this.lastStep < 180) return;
    this.lastStep = now;
    const pan = (Math.random() - 0.5) * 0.25;
    this.tone({ from: soft ? 70 : 95, to: 48, gain: (soft ? 0.03 : 0.05) * intensity, decay: 0.07, pan });
    this.burst({ type: "lowpass", frequency: soft ? 500 : 1500, gain: (soft ? 0.03 : 0.022) * intensity, decay: soft ? 0.09 : 0.05, pan });
  }
  land(intensity = 1) { this.tone({ from: 85, to: 40, gain: 0.08 * intensity, decay: 0.12 }); this.burst({ type: "lowpass", frequency: 700, gain: 0.04 * intensity, decay: 0.1 }); }
  door(opening = true) {
    this.burst({ type: "bandpass", frequency: opening ? 260 : 380, q: 0.6, gain: 0.05, attack: 0.12, decay: 0.75, sweep: opening ? 1.9 : 0.55 });
    this.tone({ from: 62, to: 48, gain: 0.05, attack: 0.05, decay: opening ? 0.5 : 0.25, delay: opening ? 0 : 0.5 });
  }
  seat() { this.burst({ type: "lowpass", frequency: 420, gain: 0.07, attack: 0.03, decay: 0.28 }); this.tone({ from: 110, to: 70, gain: 0.04, decay: 0.2, delay: 0.04 }); }
  needle() {
    this.tone({ from: 140, to: 60, gain: 0.07, decay: 0.09 });
    for (let i = 0; i < 9; i++) this.burst({ type: "highpass", frequency: 4200 + Math.random() * 3000, q: 2, gain: 0.02 * Math.random(), decay: 0.008, delay: 0.05 + Math.random() * 0.9 });
    this.burst({ type: "lowpass", frequency: 240, gain: 0.035, attack: 0.2, decay: 1.1 });
  }
  wake() {
    // AURA's voice: an open fifth that blooms, with a little air above it.
    [[293.66, 0], [440, 0.09], [880, 0.2], [1318.5, 0.3]].forEach(([f, delay], i) => this.tone({ from: f, gain: 0.05 / (1 + i * 0.5), attack: 0.03, decay: 0.9 - i * 0.12, delay, pan: (i - 1.5) * 0.18 }));
    this.burst({ type: "highpass", frequency: 5000, gain: 0.012, attack: 0.2, decay: 0.8 });
  }
  sleep() { [[440, 0], [293.66, 0.1]].forEach(([f, delay]) => this.tone({ from: f, gain: 0.03, attack: 0.02, decay: 0.5, delay })); }
  console() {
    [196, 293.66, 392, 587.33].forEach((f, i) => this.tone({ type: "triangle", from: f, gain: 0.04, attack: 0.01, decay: 0.3, delay: i * 0.085 }));
    this.burst({ type: "lowpass", frequency: 180, gain: 0.04, attack: 0.05, decay: 0.5 });
  }
  lamp(on) { this.tone({ type: "square", from: on ? 2400 : 1700, gain: 0.014, decay: 0.012 }); this.tone({ from: 140, to: 90, gain: 0.03, decay: 0.03, delay: 0.004 }); }
  wipe() { this.burst({ type: "bandpass", frequency: 600, q: 0.5, gain: 0.03, attack: 0.25, decay: 0.55, sweep: 6 }); }
  // ——— Continuous beds: room tone, rain on glass, the arrival drone. ———
  ensureBeds() {
    const ctx = this.ctx;
    if (!ctx || this.beds) return this.beds;
    const make = (type, frequency, q) => {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      source.buffer = this.noiseBuffer(ctx);
      source.loop = true;
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(this.engine.sfx);
      source.start(0, Math.random());
      return { gain, filter };
    };
    const drone = ctx.createGain(), tone = ctx.createBiquadFilter();
    drone.gain.value = 0;
    tone.type = "lowpass";
    tone.frequency.value = 900;
    tone.connect(drone).connect(this.engine.sfx);
    // D–A–F–E: the house's home chord, slightly detuned so it breathes.
    for (const [f, level] of [[73.42, 0.5], [110, 0.34], [174.61, 0.22], [329.63, 0.1], [73.9, 0.3]]) {
      const osc = ctx.createOscillator(), mix = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
      osc.frequency.value = f;
      osc.type = f > 300 ? "triangle" : "sine";
      mix.gain.value = level;
      lfo.frequency.value = 0.05 + Math.random() * 0.09;
      depth.gain.value = level * 0.35;
      lfo.connect(depth).connect(mix.gain);
      osc.connect(mix).connect(tone);
      osc.start();
      lfo.start();
    }
    this.beds = { room: make("lowpass", 190, 0.4), rain: make("bandpass", 2600, 0.35), drone: { gain: drone } };
    this.applyBeds(0.01);
    return this.beds;
  }
  ambience(values, time = 1.6) {
    Object.assign(this.targets, values);
    this.applyBeds(time);
  }
  applyBeds(time = 1.2) {
    const beds = this.beds || this.ensureBeds();
    if (!beds) return;
    const now = this.engine.ctx.currentTime, scale = { room: 0.09, rain: 0.11, drone: 0.2 };
    for (const key of Object.keys(scale))
      beds[key].gain.gain.setTargetAtTime(this.enabled ? this.targets[key] * scale[key] : 0, now, time / 3);
  }
}
