import * as THREE from "three";
import { Device, clamp } from "../device.js";
import { makeTrack, noteName, drumKits, uid } from "../../project.js";
import { fonts, palette } from "../../house/materials.js";

const BONE = palette.bone, EMBER = palette.ember, DIM = "#8c8478";
const ink = (ctx, size, color = "#cfc4b0", weight = 500, align = "center") => {
  ctx.font = `${weight} ${size}px ${fonts.mono}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  if ("letterSpacing" in ctx) ctx.letterSpacing = size * 0.1 + "px";
};
/** Mixer-style parameters follow the hand immediately and become one undoable step on release. */
function live(device, track, key, label) {
  let start;
  return {
    set: (value) => {
      const t = track();
      if (!t) return;
      if (start === undefined) start = t[key];
      t[key] = value;
      device.s.engine.updateMix(device.s.getProject());
    },
    done: () => {
      const t = track();
      if (!t || start === undefined) return;
      const final = t[key], id = t.id;
      t[key] = start;
      start = undefined;
      if (final !== t[key]) device.s.commit("Change " + label, (p) => { const target = p.tracks.find((x) => x.id === id); if (target) target[key] = final; });
    },
  };
}

// ——————————————————————————————————————————————————————————————
const PADS = [[36, "KICK"], [38, "SNARE"], [39, "CLAP"], [42, "HAT"], [46, "OPEN"], [45, "LOW TOM"], [50, "HI TOM"], [64, "CONGA"], [51, "RIDE"], [49, "CRASH"], [70, "SHAKER"], [38, "GHOST"]];

/**
 * A pad sampler in the MPC tradition: twelve velocity-sensitive pads, a sixteen-step
 * row for whichever voice was struck last, swing, kit, fill and humanise.
 */
export class DrumMachine extends Device {
  constructor(world, options) {
    super(world, { name: "drums", label: "DRUM MACHINE", verb: "PLAY", view: { position: [0, 0.5, 0.42], target: [0, 0.03, 0.01], fov: 46 }, range: 3.4, ...options });
    this.voice = 0;
    this.step = -1;
    this.hints = [["CLICK", "HIT / STEP"], ["DRAG", "TURN"], ["SPACE", "PLAY"], ["ESC", "BACK"]];
    const m = this.m, top = 0.056;
    this.body(this.box(0.44, 0.055, 0.34, 0, 0.0275, 0, m.black, this.group, 0.008));
    for (const side of [-1, 1]) this.box(0.014, 0.062, 0.345, side * 0.227, 0.031, 0, m.walnut);
    this.detail = new THREE.Group();
    this.group.add(this.detail);
    const g = this.detail;
    this.plate = this.faceplate(0.44, 0.34, 0, top + 0.0006, 0, (ctx, W, H, plate) => {
      const px = plate.px, at = (x, z) => [W / 2 + px(x), H / 2 + px(z)];
      ink(ctx, 13, "#a79c89");
      [["SWING", -0.185], ["LEVEL", -0.135], ["TONE", -0.085]].forEach(([label, x]) => ctx.fillText(label, ...at(x, -0.012)));
      [["PLAY", -0.19], ["KIT", -0.145], ["FILL", -0.1], ["CLEAR", -0.055]].forEach(([label, x]) => ctx.fillText(label, ...at(x, 0.063)));
      ctx.fillText("HUMAN", ...at(-0.19, 0.098));
      for (let i = 0; i < 16; i++) { ink(ctx, 11, i % 4 === 0 ? "#efe7d8" : "#7b7265"); ctx.fillText(String(i + 1).padStart(2, "0"), ...at(-0.195 + i * 0.026, 0.158)); }
      ink(ctx, 12, "#7b7265");
      PADS.forEach(([, name], i) => ctx.fillText(name, ...at(0.035 + (i % 4) * 0.05, 0.004 - Math.floor(i / 4) * 0.057 + 0.0275)));
      ink(ctx, 22, "#efe7d8", 500, "left");
      ctx.fillText("AURA  PADS-12", ...at(-0.2, -0.153));
    }, { parent: g });
    this.screen = this.faceplate(0.16, 0.048, -0.132, top + 0.0012, -0.108, (ctx, W, H) => {
      const t = this.track(), p = this.s.getProject();
      ctx.fillStyle = "#0a1410"; ctx.fillRect(0, 0, W, H);
      ink(ctx, H * 0.36, "#b9ffd6", 500, "left");
      ctx.fillText(PADS[this.voice][1], W * 0.05, H * 0.34);
      ink(ctx, H * 0.2, "#6fbf95", 400, "left");
      ctx.fillText(`${(drumKits[t?.drumKit || "classic"] || "").split(" · ")[0].toUpperCase()} · SW ${Math.round(p.swing * 100)}% · ${p.bpm}`, W * 0.05, H * 0.76);
    }, { resolution: 384, parent: g, emissive: true });
    this.box(0.166, 0.004, 0.054, -0.132, top - 0.001, -0.108, m.dark, g).castShadow = false;
    this.pads = PADS.map(([pitch, name], i) => {
      const pad = this.pad({ x: 0.035 + (i % 4) * 0.05, y: top, z: 0.004 - Math.floor(i / 4) * 0.057, size: 0.042, label: name, parent: g, hit: (velocity) => this.hit(i, velocity * (name === "GHOST" ? 0.4 : 1)) });
      return pad;
    });
    this.knob({ x: -0.185, y: top, z: -0.045, label: "SWING", parent: g, get: () => this.s.getProject().swing, set: (v) => { this.pendingSwing = v; }, done: (v) => { this.s.commit("Change swing", (p) => (p.swing = v)); this.screen.redraw(); } });
    const level = live(this, () => this.track(), "gain", "gain");
    this.knob({ x: -0.135, y: top, z: -0.045, label: "LEVEL", parent: g, get: () => this.track()?.gain ?? 0.62, ...level });
    const tone = live(this, () => this.track(), "cutoff", "cutoff");
    this.knob({ x: -0.085, y: top, z: -0.045, label: "TONE", parent: g, get: () => Math.log((this.track()?.cutoff ?? 12000) / 100) / Math.log(160), set: (v) => tone.set(Math.round(100 * 160 ** v)), done: tone.done });
    this.button({ x: -0.19, y: top, z: 0.035, w: 0.034, d: 0.02, label: "PLAY", parent: g, press: () => this.w.play(), lit: () => this.s.engine.playing });
    this.button({ x: -0.145, y: top, z: 0.035, w: 0.034, d: 0.02, label: "KIT", parent: g, press: () => this.nextKit() });
    this.button({ x: -0.1, y: top, z: 0.035, w: 0.034, d: 0.02, label: "FILL", parent: g, press: () => this.fill() });
    this.button({ x: -0.055, y: top, z: 0.035, w: 0.034, d: 0.02, label: "CLEAR", parent: g, press: () => this.clear() });
    this.button({ x: -0.19, y: top, z: 0.078, w: 0.034, d: 0.016, label: "HUMAN", parent: g, press: () => this.humanise() });
    for (let i = 0; i < 16; i++)
      this.button({ x: -0.195 + i * 0.026, y: top, z: 0.128, w: 0.021, d: 0.028, h: 0.006, parent: g, material: i % 4 === 0 ? m.metal : m.dark, glow: m.softlight, verb: "STEP", label: () => `${PADS[this.voice][1]} · ${String(i + 1).padStart(2, "0")}`, lit: () => this.has(i), press: () => this.toggle(i) });
    // A running light above the steps.
    this.lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.002, 0.004), new THREE.MeshBasicMaterial({ toneMapped: false }), 16);
    this.lampOff = new THREE.Color("#2a2623");
    this.lampOn = new THREE.Color(EMBER).multiplyScalar(1.4);
    for (let i = 0; i < 16; i++) { this.lamps.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-0.195 + i * 0.026, top + 0.001, 0.106)); this.lamps.setColorAt(i, this.lampOff); }
    g.add(this.lamps);
    this.bake();
    this.refresh();
  }
  track() {
    return this.s.getProject().tracks.find((t) => t.instrument === "drums");
  }
  clip() {
    return this.track()?.clips[0];
  }
  need() {
    if (!this.track()) this.s.addInstrument("drums");
    const t = this.track();
    this.s.select(t.id, t.clips[0]?.id);
    return t;
  }
  has(step) {
    const pitch = PADS[this.voice][0];
    return !!this.clip()?.notes.some((n) => n.pitch === pitch && Math.abs(n.start - step / 4) < 0.05);
  }
  hit(index, velocity) {
    const pitch = PADS[index][0];
    this.s.engine.audition(this.track() || this.w.drumTrack(), pitch, clamp(velocity, 0.05, 1)).catch((e) => this.s.toast(e.message));
    if (this.voice !== index) { this.voice = index; this.screen.redraw(); this.refresh(); }
  }
  toggle(step) {
    this.need();
    this.s.toggleStep(step, PADS[this.voice][0]);
    this.w.sound.toggle(this.has(step));
  }
  nextKit() {
    const t = this.need(), kits = Object.keys(drumKits), next = kits[(kits.indexOf(t.drumKit || "classic") + 1) % kits.length];
    this.s.commit("Change drum kit", (p) => { p.tracks.find((x) => x.id === t.id).drumKit = next; });
    this.hit(this.voice, 0.8);
    this.screen.redraw();
  }
  fill() {
    const t = this.need(), id = t.clips[0]?.id;
    if (!id) return;
    this.s.commit("Fill drum pattern", (p) => {
      const c = p.tracks.find((x) => x.id === t.id).clips.find((x) => x.id === id);
      c.notes = c.notes.filter((n) => n.start >= 4);
      for (let i = 0; i < 16; i++) for (const pitch of [36, 38, 42]) if ((pitch === 36 && i % 4 === 0) || (pitch === 38 && (i === 4 || i === 12)) || (pitch === 42 && i % 2 === 0)) c.notes.push({ id: uid(), pitch, start: i / 4, duration: 0.15, velocity: pitch === 42 ? 0.45 : 0.8 });
    });
  }
  clear() {
    const t = this.track(), id = t?.clips[0]?.id, pitch = PADS[this.voice][0];
    if (!id) return;
    this.s.commit("Clear " + PADS[this.voice][1].toLowerCase(), (p) => { const c = p.tracks.find((x) => x.id === t.id).clips.find((x) => x.id === id); c.notes = c.notes.filter((n) => n.pitch !== pitch || n.start >= 4); });
  }
  humanise() {
    const t = this.need();
    this.s.select(t.id, t.clips[0]?.id);
    this.s.humanizeClip(1);
  }
  refresh() {
    super.refresh();
    this.screen?.redraw();
  }
  update(dt, bands) {
    super.update(dt);
    const e = this.s.engine, clip = this.clip(), playing = e.playing && !this.w.playback?.foreign && clip;
    const step = playing ? Math.floor((((e.beat - clip.start) % 4) + 4) % 4 * 4) : -1;
    if (step === this.step) return;
    if (this.step >= 0) this.lamps.setColorAt(this.step, this.lampOff);
    this.step = step;
    if (step >= 0) this.lamps.setColorAt(step, this.lampOn);
    this.lamps.instanceColor.needsUpdate = true;
    if (step < 0) return;
    // Pads light as the pattern plays them, at the strength they were written.
    for (const n of clip.notes) {
      if (Math.abs(n.start - step / 4) > 0.05) continue;
      const index = PADS.findIndex(([pitch]) => pitch === n.pitch);
      if (index >= 0) this.pads[index].userData.flash(n.velocity * 0.8);
    }
  }
}

// ——————————————————————————————————————————————————————————————
const VOICES = [["SIN", "keys"], ["TRI", "pad"], ["SAW", "lead"], ["SQR", "reed"], ["FM", "bell"], ["PLK", "pluck"]];
const RELEASE = { keys: 0.4, pad: 0.65, bass: 0.12, pluck: 0.14, lead: 0.2, electric: 0.8, bell: 0.8, organ: 0.08, marimba: 0.25, harp: 0.25, strings: 0.65, flute: 0.12, reed: 0.16, brass: 0.12, choir: 0.65 };
const SHAPES = { attack: [0.001, 1000], release: [0.02, 100], brightness: [200, 80] };
const typing = ["KeyA", "KeyW", "KeyS", "KeyE", "KeyD", "KeyF", "KeyT", "KeyG", "KeyY", "KeyH", "KeyU", "KeyJ", "KeyK", "KeyO", "KeyL", "KeyP", "Semicolon"];

/**
 * A two-and-a-half octave synthesizer. The keys play the selected melodic track;
 * the buttons choose its oscillator character and the knobs shape attack, release,
 * brightness, space and level — the same parameters the precise editor exposes.
 */
export class Synth extends Device {
  constructor(world, options) {
    super(world, { name: "synth", label: "SYNTHESIZER", verb: "PLAY", view: { position: [0, 0.62, 0.62], target: [0, 0.02, -0.01], fov: 48 }, range: 3.6, ...options });
    this.octave = 0;
    this.preview = {};
    this.held = new Map();
    this.hints = [["A–;", "PLAY"], ["Z X", "OCTAVE"], ["DRAG", "TURN"], ["ESC", "BACK"]];
    const m = this.m, top = 0.071, a = this.a;
    this.body(this.box(0.9, 0.07, 0.36, 0, 0.035, 0, m.black, this.group, 0.008));
    for (const side of [-1, 1]) this.box(0.018, 0.078, 0.365, side * 0.459, 0.039, 0, m.walnut);
    this.detail = new THREE.Group();
    this.group.add(this.detail);
    const g = this.detail;
    this.plate = this.faceplate(0.88, 0.17, 0, top + 0.0006, -0.09, (ctx, W, H, plate) => {
      const px = plate.px, at = (x, z) => [W / 2 + px(x), H / 2 + px(z + 0.09)];
      ink(ctx, 13, "#a79c89");
      VOICES.forEach(([label], i) => ctx.fillText(label, ...at(-0.4 + i * 0.05, -0.027)));
      [["ATTACK", -0.05], ["RELEASE", 0.03], ["BRIGHT", 0.11], ["SPACE", 0.19], ["LEVEL", 0.27]].forEach(([label, x]) => ctx.fillText(label, ...at(x, -0.036)));
      ctx.fillText("OCT −", ...at(0.35, -0.027));
      ctx.fillText("OCT +", ...at(0.4, -0.027));
      ctx.fillText("REC", ...at(0.375, -0.108));
      ink(ctx, 11, "#7b7265");
      ctx.fillText("OSCILLATOR", ...at(-0.275, -0.008));
      ink(ctx, 20, "#efe7d8", 500, "left");
      ctx.fillText("AURA  MONO/POLY", ...at(-0.08, -0.155));
    }, { parent: g, resolution: 1536 });
    // A small scope shows what the hands are doing to the sound.
    this.scope = this.faceplate(0.3, 0.07, -0.275, top + 0.0012, -0.125, (ctx, W, H) => {
      ctx.fillStyle = "#0a1410"; ctx.fillRect(0, 0, W, H);
      const wave = this.s.engine.bands.wave, t = this.target();
      let start = 0;
      for (let i = 1; i < wave.length / 2; i++) if (wave[i - 1] <= 0 && wave[i] > 0) { start = i; break; }
      ctx.strokeStyle = "#9dffc4"; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let i = 0; i < wave.length / 2; i++) { const x = (i / (wave.length / 2 - 1)) * W * 0.62 + W * 0.36, y = H / 2 - wave[start + i] * H * 1.2; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      ink(ctx, H * 0.24, "#b9ffd6", 500, "left");
      ctx.fillText((t.name || "").toUpperCase().slice(0, 12), W * 0.03, H * 0.3);
      ink(ctx, H * 0.18, "#6fbf95", 400, "left");
      ctx.fillText(`${noteName(60 + this.octave * 12)} · ${this.held.size} HELD`, W * 0.03, H * 0.72);
    }, { resolution: 512, parent: g, emissive: true });
    this.box(0.306, 0.004, 0.076, -0.275, top - 0.001, -0.125, m.dark, g).castShadow = false;
    VOICES.forEach(([label, instrument], i) => this.button({ x: -0.4 + i * 0.05, y: top, z: -0.06, w: 0.03, d: 0.018, label, verb: "VOICE", parent: g, lit: () => this.target().instrument === instrument, press: () => this.setVoice(instrument) }));
    const shaped = (key, x, label) => this.knob({ x, y: top, z: -0.075, radius: 0.02, label, parent: g, get: () => this.shape(key), set: (v) => { this.preview[key] = SHAPES[key][0] * SHAPES[key][1] ** v; }, done: () => this.commitShape(key) });
    shaped("attack", -0.05, "ATTACK");
    shaped("release", 0.03, "RELEASE");
    shaped("brightness", 0.11, "BRIGHT");
    const space = live(this, () => this.owned(), "reverb", "reverb"), level = live(this, () => this.owned(), "gain", "gain");
    this.knob({ x: 0.19, y: top, z: -0.075, radius: 0.02, label: "SPACE", parent: g, get: () => this.target().reverb, ...space });
    this.knob({ x: 0.27, y: top, z: -0.075, radius: 0.02, label: "LEVEL", parent: g, get: () => this.target().gain, ...level });
    this.button({ x: 0.35, y: top, z: -0.06, w: 0.03, d: 0.018, label: "OCTAVE DOWN", parent: g, press: () => this.shift(-1) });
    this.button({ x: 0.4, y: top, z: -0.06, w: 0.03, d: 0.018, label: "OCTAVE UP", parent: g, press: () => this.shift(1) });
    this.button({ x: 0.375, y: top, z: -0.135, w: 0.03, label: "RECORD INTO CLIP", verb: "ARM", round: true, parent: g, glow: m.ember, lit: () => !!this.performance()?.capture, press: () => this.record() });
    // Keys: seventeen white, twelve black, two draw calls.
    const whiteNotes = [], whites = [], blacks = [];
    for (let pitch = 48; pitch <= 76; pitch++) if (![1, 3, 6, 8, 10].includes(pitch % 12)) whiteNotes.push(pitch);
    const width = 0.84 / whiteNotes.length, key = (x, y, z, pitch) => {
      const item = { matrix: new THREE.Matrix4().makeTranslation(x, y, z), pitch, depth: 0, down: false };
      item.use = { device: this, verb: "PLAY", key: "CLICK", label: () => noteName(pitch + this.octave * 12), direct: true, range: 2.4, cursor: "pointer", press: () => this.down("key" + pitch, pitch + this.octave * 12, 0.74, item), release: () => this.up("key" + pitch, item) };
      return item;
    };
    whiteNotes.forEach((pitch, i) => {
      const x = -0.42 + (i + 0.5) * width;
      whites.push(key(x, top + 0.004, 0.095, pitch));
      if ([0, 2, 5, 7, 9].includes(pitch % 12) && pitch < 76) blacks.push(key(x + width / 2, top + 0.012, 0.062, pitch + 1));
    });
    this.keyMeshes = [a.instanced(new THREE.BoxGeometry(width - 0.003, 0.016, 0.15), m.ivory, whites, this.group), a.instanced(new THREE.BoxGeometry(width * 0.58, 0.022, 0.09), m.black, blacks, this.group)];
    this.keys = [...whites, ...blacks];
    this.byPitch = new Map(this.keys.map((k) => [k.pitch, k]));
    this.matrix = new THREE.Matrix4();
    world.events.addEventListener("blur", () => this.releaseAll());
    addEventListener("keyup", (e) => { if (this.held.has(e.code)) this.up(e.code, this.byPitch.get(this.held.get(e.code).pitch - this.octave * 12)); });
    this.bake();
    this.refresh();
  }
  performance() {
    return window.aura.workbench?.performance;
  }
  /** The melodic track this synth is playing; a stand-in exists until the project has one. */
  target() {
    const t = this.w.keysTrack();
    return Object.keys(this.preview).length ? { ...t, synth: { ...(t.synth || {}), ...this.preview } } : t;
  }
  /** The same track, but only if it really belongs to the project and can be edited. */
  owned() {
    const t = this.w.keysTrack(), p = this.s.getProject();
    if (p.tracks.includes(t)) return t;
    this.s.addInstrument("keys");
    return this.s.getTrack();
  }
  shape(key) {
    const t = this.target(), fallback = key === "attack" ? (["pad", "strings", "choir"].includes(t.instrument) ? 0.18 : 0.008) : key === "release" ? RELEASE[t.instrument] ?? 0.2 : 12000;
    const value = this.preview[key] ?? t.synth?.[key] ?? fallback;
    return clamp(Math.log(value / SHAPES[key][0]) / Math.log(SHAPES[key][1]));
  }
  commitShape(key) {
    const value = this.preview[key], bounds = { attack: [0.001, 1], release: [0.02, 2], brightness: [200, 16000] }[key];
    delete this.preview[key];
    if (value === undefined) return;
    const id = this.owned().id;
    this.s.commit("Shape the voice", (p) => { const t = p.tracks.find((x) => x.id === id); t.synth = { ...(t.synth || {}), [key]: clamp(value, ...bounds) }; });
  }
  setVoice(instrument) {
    const id = this.owned().id;
    this.s.commit("Change voice", (p) => { p.tracks.find((x) => x.id === id).instrument = instrument; });
    this.s.select(id);
    this.audition();
  }
  audition() {
    const t = this.target();
    this.s.engine.audition(t, 60 + this.octave * 12 + this.s.getProject().root, 0.7).catch(() => {});
  }
  shift(by) {
    this.octave = clamp(this.octave + by, -2, 2);
    this.w.sound.toggle(by > 0);
  }
  async record() {
    const perf = this.performance();
    if (!perf) return;
    if (perf.capture) return perf.finish();
    const t = this.owned();
    this.s.select(t.id, t.clips[0]?.id);
    await perf.record();
    this.s.toast("Four clicks, then play. Your notes land in the selected clip.");
  }
  async down(id, pitch, velocity, item) {
    if (this.held.has(id) || pitch < 0 || pitch > 127) return;
    const entry = { pitch, voice: null, released: false };
    this.held.set(id, entry);
    if (item) item.down = true;
    this.emit("key", pitch);
    const perf = this.performance(), t = this.target();
    // While a take is being captured, notes go through the recorder so they are written to the clip.
    if (perf?.capture) { entry.viaRecorder = true; perf.on("synth:" + id, pitch, velocity); return; }
    try {
      const voice = await this.s.engine.noteOn(t, pitch, velocity);
      if (entry.released) voice.release();
      else entry.voice = voice;
    } catch (e) {
      this.s.toast(e.message);
    }
  }
  up(id, item) {
    const entry = this.held.get(id);
    if (item) item.down = false;
    if (!entry) return;
    entry.released = true;
    if (entry.viaRecorder) this.performance()?.off("synth:" + id);
    entry.voice?.release();
    this.held.delete(id);
  }
  releaseAll() {
    for (const [id, entry] of [...this.held]) this.up(id, this.byPitch.get(entry.pitch - this.octave * 12));
  }
  onKey(e) {
    if (e.repeat) return typing.includes(e.code);
    if (e.code === "KeyZ") { this.shift(-1); return true; }
    if (e.code === "KeyX") { this.shift(1); return true; }
    const offset = typing.indexOf(e.code);
    if (offset < 0) return false;
    const pitch = 60 + offset;
    this.down(e.code, pitch + this.octave * 12, 0.72, this.byPitch.get(pitch));
    return true;
  }
  onExit() {
    this.releaseAll();
  }
  update(dt, bands, t) {
    super.update(dt);
    for (const key of this.keys) {
      const target = key.down ? 1 : 0;
      if (Math.abs(target - key.depth) < 0.001) continue;
      key.depth += (target - key.depth) * (1 - Math.exp(-dt * (target ? 60 : 22)));
      this.matrix.makeRotationX(key.depth * 0.05).setPosition(0, -key.depth * 0.006, 0);
      key.mesh.setMatrixAt(key.index, this.matrix.premultiply(key.matrix));
      key.mesh.instanceMatrix.needsUpdate = true;
    }
    if ((this.focused || bands.level > 0.01) && t - (this.lastScope || 0) > 66) { this.lastScope = t; this.scope.redraw(); }
  }
}

// ——————————————————————————————————————————————————————————————
const CHANNELS = 8, PITCH = 0.062;

/**
 * A mixing console whose channels are the project's tracks. Faders, pan, reverb send,
 * low-mid EQ, mute and solo all drive the live mix; with WRITE armed, a fader ride
 * during playback is recorded as gain automation.
 */
export class Mixer extends Device {
  constructor(world, { scale = 1, ...options }) {
    super(world, { name: "mixer", label: "MIXING CONSOLE", verb: "MIX", view: { position: [0, 0.66 * scale, 0.5 * scale], target: [0, 0.02, 0], fov: 48 }, range: 3.4 + scale, ...options });
    this.group.scale.setScalar(scale);
    this.bank = 0;
    this.write = false;
    this.ride = null;
    this.hints = [["DRAG", "FADER / KNOB"], ["SHIFT", "FINE"], ["SPACE", "PLAY"], ["ESC", "BACK"]];
    const m = this.m, top = 0.051;
    this.body(this.box(0.66, 0.05, 0.42, 0, 0.025, 0, m.black, this.group, 0.008));
    for (const side of [-1, 1]) this.box(0.016, 0.062, 0.425, side * 0.338, 0.031, 0, m.walnut);
    this.box(0.66, 0.012, 0.03, 0, 0.056, -0.196, m.walnut);
    this.detail = new THREE.Group();
    this.group.add(this.detail);
    const g = this.detail, x = (i) => -0.268 + i * PITCH;
    this.plate = this.faceplate(0.66, 0.42, 0, top + 0.0006, 0, (ctx, W, H, plate) => {
      const px = plate.px, at = (xx, z) => [W / 2 + px(xx), H / 2 + px(z)], p = this.s.getProject();
      for (let i = 0; i < CHANNELS; i++) {
        const t = this.trackAt(i), cx = x(i);
        ctx.fillStyle = "#ffffff0a"; ctx.fillRect(...at(cx - PITCH / 2 + 0.002, -0.19), px(PITCH - 0.004), px(0.385));
        if (t) { ctx.fillStyle = t.color; ctx.fillRect(...at(cx - PITCH / 2 + 0.002, 0.182), px(PITCH - 0.004), px(0.006)); }
        ink(ctx, 13, t ? "#efe7d8" : "#5d564c");
        ctx.fillText(t ? t.name.toUpperCase().slice(0, 7) : "—", ...at(cx, 0.168));
        ink(ctx, 10, "#7b7265");
        ctx.fillText(String(i + this.bank + 1).padStart(2, "0"), ...at(cx, -0.182));
        for (const mark of [0, 0.25, 0.5, 0.75, 1]) { ctx.fillStyle = "#efe7d840"; ctx.fillRect(...at(cx - 0.02, 0.085 + (0.5 - mark) * 0.12), px(0.008), 1.5); }
      }
      ink(ctx, 10, "#7b7265", 500, "left");
      [["PAN", -0.15], ["SEND", -0.105], ["LOW·MID", -0.06], ["M · S", -0.02]].forEach(([label, z]) => ctx.fillText(label, ...at(-0.326, z - 0.021)));
      ink(ctx, 12, "#a79c89");
      ctx.fillText("MASTER", ...at(0.27, 0.168));
      ctx.fillText("WRITE", ...at(0.27, -0.085));
      ctx.fillText("◀ BANK ▶", ...at(0.27, -0.172));
      ink(ctx, 11, "#7b7265");
      ctx.fillText(`${this.bank + 1}–${Math.min(p.tracks.length, this.bank + CHANNELS)} OF ${p.tracks.length}`, ...at(0.27, -0.125));
    }, { parent: g, resolution: 1536 });
    // Meter bridge: a strip of light behind the faders.
    this.bridge = this.faceplate(0.64, 0.05, 0, 0.09, -0.2, (ctx, W, H) => {
      ctx.fillStyle = "#070706"; ctx.fillRect(0, 0, W, H);
      const metrics = this.w.metrics, scale = (v) => clamp((20 * Math.log10(v || 0.00001) + 54) / 54), col = W / (0.64 / PITCH), draw = (cx, level, colour) => {
        for (let s = 0; s < 14; s++) { const on = s / 14 < level; ctx.fillStyle = on ? (s > 11 ? EMBER : s > 8 ? "#e8c58c" : colour) : "#1d1a17"; ctx.fillRect(cx - col * 0.3, H - 6 - (s + 1) * ((H - 12) / 14) + 1, col * 0.6, (H - 12) / 14 - 2); }
      };
      for (let i = 0; i < CHANNELS; i++) { const t = this.trackAt(i); draw(W / 2 + ((x(i)) / 0.64) * W, t ? scale(metrics.tracks.get(t.id)?.peak) : 0, BONE); }
      draw(W / 2 + (0.27 / 0.64) * W, scale(metrics.peak), BONE);
    }, { parent: g, resolution: 640, emissive: true, rotationX: -0.5 });
    this.box(0.65, 0.058, 0.012, 0, 0.088, -0.207, m.black, g).rotation.x = -0.5;
    for (let i = 0; i < CHANNELS; i++) {
      const track = () => this.trackAt(i), name = (label) => () => `${label} · ${(track()?.name || "EMPTY").toUpperCase()}`;
      const gain = live(this, track, "gain", "gain"), pan = live(this, track, "pan", "pan"), send = live(this, track, "reverb", "reverb"), eq = live(this, track, "eq", "eq");
      this.knob({ x: x(i), y: top, z: -0.15, radius: 0.013, height: 0.016, label: name("PAN"), parent: g, get: () => ((track()?.pan ?? 0) + 1) / 2, set: (v) => pan.set(Math.abs(v - 0.5) < 0.03 ? 0 : v * 2 - 1), done: pan.done });
      this.knob({ x: x(i), y: top, z: -0.105, radius: 0.013, height: 0.016, label: name("SEND"), parent: g, material: m.metal, get: () => track()?.reverb ?? 0, ...send });
      this.knob({ x: x(i), y: top, z: -0.06, radius: 0.013, height: 0.016, label: name("LOW-MID"), parent: g, get: () => ((track()?.eq ?? 0) + 12) / 24, set: (v) => eq.set(Math.abs(v - 0.5) < 0.03 ? 0 : v * 24 - 12), done: eq.done });
      this.button({ x: x(i) - 0.013, y: top, z: -0.02, w: 0.02, d: 0.015, label: name("MUTE"), verb: "MUTE", parent: g, glow: m.softlight, lit: () => !!track()?.mute, press: () => track() && this.s.toggleTrack(track().id, "mute") });
      this.button({ x: x(i) + 0.013, y: top, z: -0.02, w: 0.02, d: 0.015, label: name("SOLO"), verb: "SOLO", parent: g, glow: m.ember, lit: () => !!track()?.solo, press: () => track() && this.s.toggleTrack(track().id, "solo") });
      this.fader({
        x: x(i), y: top, z: 0.085, travel: 0.12, label: name("LEVEL"), parent: g, get: () => track()?.gain ?? 0,
        set: (v) => { gain.set(v); this.rideTo(track(), v); },
        done: () => { gain.done(); this.finishRide(); },
      });
    }
    this.fader({ x: 0.27, y: top, z: 0.085, travel: 0.12, label: "MASTER", parent: g, cap: m.bronze, width: 0.022, get: () => this.s.getProject().master, set: (v) => { const p = this.s.getProject(); if (this.masterStart === undefined) this.masterStart = p.master; p.master = v; this.s.engine.updateMix(p); }, done: () => { const p = this.s.getProject(), final = p.master; p.master = this.masterStart ?? final; this.masterStart = undefined; this.s.commit("Master volume", (q) => (q.master = final)); } });
    this.button({ x: 0.27, y: top, z: -0.06, w: 0.034, d: 0.02, label: "WRITE AUTOMATION", verb: "ARM", parent: g, glow: m.ember, lit: () => this.write, press: () => { this.write = !this.write; this.s.toast(this.write ? "Write armed: ride a fader while the song plays." : "Write off."); } });
    this.button({ x: 0.255, y: top, z: -0.15, w: 0.022, d: 0.018, label: "PREVIOUS TRACKS", verb: "BANK", parent: g, press: () => this.setBank(-CHANNELS) });
    this.button({ x: 0.285, y: top, z: -0.15, w: 0.022, d: 0.018, label: "NEXT TRACKS", verb: "BANK", parent: g, press: () => this.setBank(CHANNELS) });
    this.bake();
    this.refresh();
  }
  trackAt(i) {
    return this.s.getProject().tracks[i + this.bank];
  }
  setBank(by) {
    const count = this.s.getProject().tracks.length;
    this.bank = clamp(this.bank + by, 0, Math.max(0, Math.floor((count - 1) / CHANNELS) * CHANNELS));
    this.refresh();
  }
  /** With WRITE armed and the song running, fader moves are sampled as automation points. */
  rideTo(track, value) {
    const e = this.s.engine;
    if (!this.write || !e.playing || !track || this.w.playback?.foreign) return;
    if (!this.ride || this.ride.id !== track.id) this.ride = { id: track.id, points: [], last: -1 };
    const beat = Math.round(e.beat * 4) / 4;
    if (beat === this.ride.last) { this.ride.points[this.ride.points.length - 1].value = value; return; }
    this.ride.last = beat;
    this.ride.points.push({ beat, value });
  }
  finishRide() {
    const ride = this.ride;
    this.ride = null;
    if (!ride || ride.points.length < 2) return;
    const from = ride.points[0].beat, to = ride.points.at(-1).beat;
    this.s.commit("Write gain automation", (p) => {
      const t = p.tracks.find((x) => x.id === ride.id);
      if (!t) return;
      // The ride replaces whatever was written across the same stretch of the song.
      t.automation = [...t.automation.filter((a) => a.beat < Math.min(from, to) || a.beat > Math.max(from, to)), ...ride.points.map((pt) => ({ beat: clamp(pt.beat, 0, 256), value: clamp(pt.value) }))].sort((x, y) => x.beat - y.beat).slice(0, 512);
    });
    this.s.toast(`Automation written: ${ride.points.length} points.`);
  }
  refresh() {
    super.refresh();
    const signature = this.s.getProject().tracks.map((t) => t.id + t.name + t.color).join("|") + this.bank;
    if (signature !== this.signature) { this.signature = signature; this.plate?.redraw(); }
  }
  update(dt, bands, t) {
    super.update(dt);
    if (t - (this.lastMeter || 0) > 70 && (bands.level > 0.003 || this.metersLit)) { this.lastMeter = t; this.metersLit = bands.level > 0.003; this.bridge.redraw(); }
  }
}
export { makeTrack };
