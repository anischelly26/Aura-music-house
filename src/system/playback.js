import { projectBeats } from "../audio.js";
import { noteName, validateProject } from "../project.js";
import { listProjects } from "../storage.js";
import { seeded } from "../house/layout.js";
import { fonts, palette } from "../house/materials.js";
import { compose } from "./composer.js";

const originals = [
  ["low-tide", "Low tide", "ambient", 11],
  ["paper-sun", "Paper sun", "lofi", 23],
  ["brass-hours", "Brass hours", "boombap", 37],
  ["glass-avenue", "Glass avenue", "house", 41],
  ["night-shift", "Night shift", "techno", 59],
  ["ember", "Ember", "trap", 67],
];
const schemes = [
  { ground: palette.ink, ink: palette.bone, accent: palette.ember },
  { ground: palette.bone, ink: palette.ink, accent: palette.ember },
  { ground: palette.oxblood, ink: palette.bone, accent: palette.brass },
  { ground: "#c9b48c", ink: palette.ink, accent: palette.oxblood },
  { ground: "#2c352c", ink: palette.bone, accent: palette.brass },
  { ground: palette.ember, ink: palette.ink, accent: palette.bone },
];
function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
/**
 * Sleeve artwork, drawn rather than fetched: one of four compositions in the house
 * palette, chosen from the piece's identity so a record always looks the same.
 */
export function coverArt({ seed, title = "", subtitle = "", style = null, size = 512 }) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d"), random = seeded(hash(seed)), S = size;
  const scheme = schemes[Math.floor(random() * schemes.length)], kind = style ?? Math.floor(random() * 4);
  ctx.fillStyle = scheme.ground;
  ctx.fillRect(0, 0, S, S);
  // The title is set first, so the artwork can keep clear of it.
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${S * 0.118}px ${fonts.display}`;
  if ("fontStretch" in ctx) ctx.fontStretch = "condensed";
  if ("letterSpacing" in ctx) ctx.letterSpacing = -S * 0.003 + "px";
  const lines = [];
  for (const word of title.toUpperCase().split(" ")) { const last = lines[lines.length - 1]; if (last && ctx.measureText(last + " " + word).width < S * 0.84) lines[lines.length - 1] = last + " " + word; else lines.push(word); }
  lines.length = Math.min(3, lines.length);
  const titleTop = 0.79 - (lines.length - 1) * 0.102;
  ctx.strokeStyle = ctx.fillStyle = scheme.ink;
  if (kind === 0) {
    const cx = S * (0.4 + random() * 0.2), cy = S * (0.36 + random() * 0.12);
    for (let i = 0; i < 30; i++) { ctx.globalAlpha = 0.15 + random() * 0.55; ctx.lineWidth = S * (0.001 + random() * 0.005); ctx.beginPath(); ctx.ellipse(cx + (random() - 0.5) * S * 0.08, cy + (random() - 0.5) * S * 0.08, S * (0.06 + random() * 0.3), S * (0.06 + random() * 0.3), random() * 3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = scheme.accent; ctx.beginPath(); ctx.arc(cx, cy, S * 0.03, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 1) {
    // A sun over stacked horizons.
    ctx.fillStyle = scheme.accent; ctx.beginPath(); ctx.arc(S * (0.3 + random() * 0.4), S * 0.34, S * (0.12 + random() * 0.08), 0, Math.PI * 2); ctx.fill();
    const step = Math.min(0.035, (titleTop - 0.5) / 8);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = scheme.ink; ctx.globalAlpha = 0.16 + i * 0.09; const y = S * (0.42 + i * step); ctx.fillRect(0, y, S, S * 0.02 + i * S * 0.004); }
    ctx.globalAlpha = 1;
  } else if (kind === 2) {
    ctx.lineWidth = S * 0.004;
    for (let row = 0; row < 26; row++) { ctx.globalAlpha = 0.3 + (row / 26) * 0.7; ctx.beginPath(); const phase = random() * 6; for (let i = 0; i <= 90; i++) { const u = i / 90, env = Math.exp(-Math.pow((u - 0.5) * 3, 2)), y = S * 0.14 + row * S * 0.02 - Math.abs(Math.sin(u * 26 + phase)) * env * S * 0.06 * (0.3 + random() * 0.7); i ? ctx.lineTo(S * 0.1 + u * S * 0.8, y) : ctx.moveTo(S * 0.1, y); } ctx.stroke(); }
    ctx.globalAlpha = 1;
  } else {
    const tones = [scheme.ink, scheme.accent, scheme.ink + "88"];
    for (let i = 0; i < 6; i++) { ctx.fillStyle = tones[i % 3]; const w = S * (0.12 + random() * 0.46), h = S * (0.04 + random() * 0.2); ctx.fillRect(S * 0.08 + random() * (S * 0.84 - w), S * 0.08 + random() * (S * 0.56 - h), w, h); }
  }
  // Lettering: a condensed title, a catalogue line.
  ctx.fillStyle = scheme.ink;
  lines.forEach((line, i, all) => ctx.fillText(line, S * 0.08, S * 0.89 - (all.length - 1 - i) * S * 0.102, S * 0.84));
  ctx.font = `500 ${S * 0.026}px ${fonts.mono}`;
  if ("fontStretch" in ctx) ctx.fontStretch = "normal";
  if ("letterSpacing" in ctx) ctx.letterSpacing = S * 0.005 + "px";
  ctx.fillText(subtitle.toUpperCase(), S * 0.08, S * 0.945, S * 0.84);
  ctx.textAlign = "right";
  ctx.fillText("AURA", S * 0.92, S * 0.1);
  ctx.textAlign = "left";
  return canvas;
}

/**
 * One listening state for the whole house. The phone, the wall, the turntable and
 * the precise editor all look at this object, and it drives the single audio engine.
 */
export class Playback extends EventTarget {
  constructor(studio) {
    super();
    this.s = studio;
    this.e = studio.engine;
    this.covers = new Map();
    this.foreign = null;
    this.foreignAssets = null;
    this.radio = null;
    this.pressed = this.readPressed();
    this.loopBeforeForeign = null;
    this.current = this.projectPiece();
    studio.store.addEventListener("change", (event) => {
      if (event.detail === "Project opened") { this.select("project", false); this.covers.clear(); }
      if (this.current.kind === "project") this.current = this.projectPiece();
      this.changed();
    });
    this.e.addEventListener("transport", () => this.changed());
    // A record that has played through hands over to the next one on the shelf.
    this.e.addEventListener("end", () => { if (this.foreign) this.step(1, true).catch(() => {}); });
  }
  changed() {
    this.dispatchEvent(new Event("change"));
  }
  describe(p) {
    return `${p.bpm} BPM · ${noteName(60 + p.root).replace(/\d+$/, "")} ${p.scale}`;
  }
  projectPiece() {
    const p = this.s.getProject();
    return { id: "project", kind: "project", title: p.name, artist: "Your project", detail: this.describe(p), seed: p.id };
  }
  /** AURA originals: composed on demand by the rule-based writer, never fetched. */
  originals() {
    if (!this.radio) this.radio = originals.map(([id, title, style, seed]) => ({ id: "original:" + id, kind: "original", title, artist: "AURA originals", style, seedNumber: seed, seed: "original:" + id }));
    for (const piece of this.radio) if (!piece.detail && piece.project) piece.detail = this.describe(piece.project);
    return this.radio;
  }
  readPressed() {
    try {
      const list = JSON.parse(localStorage.getItem("aura-vinyl") || "[]");
      return Array.isArray(list) ? list.filter((x) => x && typeof x.id === "string" && typeof x.title === "string").slice(0, 40) : [];
    } catch {
      return [];
    }
  }
  records() {
    return this.pressed.map((r) => ({ id: "vinyl:" + r.id, kind: "vinyl", title: r.title, artist: "Pressed in this house", detail: r.detail, seed: r.seed, style: r.style, projectId: r.projectId, pressedAt: r.pressedAt }));
  }
  /** Everything that can be played, in shelf order. */
  library() {
    return [this.projectPiece(), ...this.records(), ...this.originals()];
  }
  /** Presses the open project to a record with a chosen sleeve. */
  press({ style = null, seed = null } = {}) {
    const p = this.s.getProject(), record = { id: Date.now().toString(36), projectId: p.id, title: p.name, detail: this.describe(p), seed: seed || p.id + ":" + Date.now(), style, pressedAt: Date.now() };
    this.pressed = [record, ...this.pressed.filter((r) => r.projectId !== p.id || r.seed !== record.seed)].slice(0, 40);
    localStorage.setItem("aura-vinyl", JSON.stringify(this.pressed));
    this.changed();
    return this.records()[0];
  }
  unpress(id) {
    this.pressed = this.pressed.filter((r) => "vinyl:" + r.id !== id);
    localStorage.setItem("aura-vinyl", JSON.stringify(this.pressed));
    this.changed();
  }
  cover(piece = this.current, size = 512) {
    const key = piece.seed + "|" + piece.title + "|" + (piece.style ?? "") + "|" + size;
    if (!this.covers.has(key)) this.covers.set(key, coverArt({ seed: piece.seed, title: piece.title, subtitle: piece.detail || piece.artist, style: piece.style ?? null, size }));
    return this.covers.get(key);
  }
  async projectFor(piece) {
    if (piece.kind === "project") return { project: this.s.getProject(), assets: null };
    if (piece.kind === "original") {
      if (!piece.project) piece.project = validateProject(compose(piece.seedNumber, piece.style, piece.title));
      piece.detail = this.describe(piece.project);
      return { project: piece.project, assets: null };
    }
    // A pressed record plays the saved session it was cut from.
    if (piece.projectId === this.s.getProject().id) return { project: this.s.getProject(), assets: null, live: true };
    const saved = (await listProjects()).find((x) => x.id === piece.projectId);
    if (!saved) throw Error("The session behind this record is no longer saved on this device.");
    validateProject(saved);
    return { project: saved, assets: await this.e.decodeAssets(saved) };
  }
  get playing() {
    return this.e.playing;
  }
  get project() {
    return this.foreign || this.s.getProject();
  }
  /** Position within the current piece. */
  get progress() {
    const p = this.project, beats = projectBeats(p), beat = Math.min(this.e.beat, beats);
    return { beat, beats, seconds: (beat * 60) / p.bpm, duration: (beats * 60) / p.bpm, fraction: beats ? beat / beats : 0 };
  }
  select(id, notify = true) {
    const piece = id === "project" ? this.projectPiece() : this.library().find((x) => x.id === id);
    if (!piece || (piece.id === this.current.id && (piece.kind === "project") === !this.foreign)) { if (notify) this.changed(); return piece; }
    if (this.e.playing || this.e.position) this.e.stop();
    if (this.foreign && this.loopBeforeForeign !== null) { this.e.loop = this.loopBeforeForeign; this.loopBeforeForeign = null; }
    this.foreign = null;
    this.foreignAssets = null;
    this.current = piece;
    if (notify) this.changed();
    return piece;
  }
  async play(id = null) {
    if (id && id !== this.current.id) this.select(id, false);
    const piece = this.current, { project, assets, live } = await this.projectFor(piece);
    if (this.current !== piece) return;
    if (piece.kind === "project" || live) {
      this.foreign = null;
      if (this.loopBeforeForeign !== null) { this.e.loop = this.loopBeforeForeign; this.loopBeforeForeign = null; }
      await this.e.play(project);
    } else {
      // Listening to a record: play it through once, then move along the shelf.
      if (this.loopBeforeForeign === null) this.loopBeforeForeign = this.e.loop;
      this.e.loop = false;
      this.foreign = project;
      this.foreignAssets = assets;
      piece.cover = this.cover(piece, 256);
      await this.e.play(project, this.e.position, { assets: assets || new Map() });
    }
    this.changed();
  }
  pause() {
    this.e.pause();
    this.changed();
  }
  async toggle() {
    if (this.e.playing) this.pause();
    else await this.play();
  }
  stop() {
    this.e.stop();
    this.changed();
  }
  async step(direction, keepPlaying = false) {
    const list = this.library(), index = Math.max(0, list.findIndex((x) => x.id === this.current.id)), was = keepPlaying || this.e.playing;
    this.select(list[(index + direction + list.length) % list.length].id, false);
    if (was) await this.play();
    else this.changed();
  }
  next() {
    return this.step(1);
  }
  previous() {
    return this.step(-1);
  }
  async seek(fraction) {
    const p = this.project;
    await this.e.seek(p, Math.max(0, Math.min(0.999, fraction)) * projectBeats(p));
    this.changed();
  }
}
