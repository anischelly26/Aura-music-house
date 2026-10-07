import { fonts, palette } from "../house/materials.js";
import { projectBeats } from "../audio.js";
import { noteName } from "../project.js";

const INK = "#0b0a09", LINE = "#2a2622", DIM = "#6f675c", BONE = palette.bone, EMBER = palette.ember;
const db = (v) => (v > 0.00001 ? (20 * Math.log10(v)).toFixed(1) : "−∞");

/**
 * Paints every display in the house from the real project and the real meters.
 * Static content is cached per project revision; only the moving parts (playhead,
 * meters, waveforms) are redrawn, and only for displays in the room you are in.
 */
export class ScreenPainter {
  constructor(world) {
    this.w = world;
    this.last = 0;
    this.revision = -1;
    world.studio.store.addEventListener("change", () => this.invalidate());
  }
  invalidate() {
    for (const s of this.w.architecture.screens) s.dirty = true;
  }
  text(ctx, value, x, y, { size = 16, color = BONE, style = "mono", weight = 400, align = "left", spacing = null, max } = {}) {
    ctx.font = `${weight} ${style === "serif" ? "italic " : ""}${size}px ${fonts[style]}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) ctx.letterSpacing = (spacing ?? (style === "mono" ? size * 0.14 : style === "display" ? -size * 0.03 : 0)) + "px";
    if ("fontStretch" in ctx) ctx.fontStretch = style === "display" ? "condensed" : "normal";
    ctx.fillText(value, x, y, max);
  }
  layer(s) {
    if (!s.base) { s.base = document.createElement("canvas"); s.base.width = s.canvas.width; s.base.height = s.canvas.height; }
    const ctx = s.base.getContext("2d");
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, s.base.width, s.base.height);
    return ctx;
  }
  /** Lanes of clips for any project: the shared drawing behind the wall and the long view. */
  lanes(ctx, p, x, y, w, h, { maxTracks = 8, labels = true } = {}) {
    const beats = projectBeats(p), tracks = p.tracks.slice(0, maxTracks), lane = Math.min(64, h / Math.max(1, tracks.length)), left = labels ? Math.min(240, w * 0.17) : 0, span = w - left;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    for (let bar = 0; bar <= beats / 4; bar++) {
      const bx = Math.round(x + left + (bar * 4 * span) / beats) + 0.5;
      ctx.globalAlpha = bar % 4 === 0 ? 1 : 0.45;
      ctx.beginPath(); ctx.moveTo(bx, y - 14); ctx.lineTo(bx, y + lane * tracks.length); ctx.stroke();
      if (bar % 4 === 0 || beats <= 32) this.text(ctx, String(bar + 1).padStart(2, "0"), bx + 5, y - 6, { size: 11, color: DIM });
    }
    ctx.globalAlpha = 1;
    tracks.forEach((t, i) => {
      const ty = y + i * lane, quiet = t.mute || (p.tracks.some((x) => x.solo) && !t.solo);
      ctx.strokeStyle = LINE;
      ctx.beginPath(); ctx.moveTo(x, ty + lane - 0.5); ctx.lineTo(x + w, ty + lane - 0.5); ctx.stroke();
      if (labels) {
        ctx.fillStyle = t.color; ctx.fillRect(x, ty + lane * 0.3, 3, lane * 0.4);
        this.text(ctx, t.name.toUpperCase().slice(0, 18), x + 14, ty + lane * 0.5 + 4, { size: Math.min(13, lane * 0.26), color: quiet ? DIM : BONE, max: left - 22 });
      }
      for (const c of t.clips) {
        const cx = x + left + (c.start / beats) * span, cw = Math.max(3, (c.length / beats) * span - 3), ch = lane - 12;
        ctx.globalAlpha = quiet ? 0.28 : 1;
        ctx.fillStyle = t.color + "38"; ctx.fillRect(cx, ty + 6, cw, ch);
        ctx.fillStyle = t.color; ctx.fillRect(cx, ty + 6, cw, 2);
        if (c.asset && p.assets?.[c.asset]) {
          const peaks = p.assets[c.asset].peaks, mid = ty + 6 + ch / 2;
          for (let px = 0; px < cw; px += 2) { const v = peaks[Math.floor((px / cw) * peaks.length)] || 0; ctx.fillRect(cx + px, mid - v * ch * 0.45, 1, Math.max(1, v * ch * 0.9)); }
        } else if (c.notes.length) {
          let lo = 127, hi = 0;
          for (const n of c.notes) { lo = Math.min(lo, n.pitch); hi = Math.max(hi, n.pitch); }
          const range = Math.max(6, hi - lo);
          for (const n of c.notes) { if (n.start >= c.length) continue; ctx.fillRect(cx + (n.start / c.length) * cw, ty + 10 + (1 - (n.pitch - lo) / range) * (ch - 9), Math.max(2, (Math.min(n.duration, c.length - n.start) / c.length) * cw - 1), 2); }
        }
        ctx.globalAlpha = 1;
      }
    });
    return { left: x + left, span, beats, bottom: y + lane * tracks.length };
  }
  wall(s, state) {
    const { canvas: c } = s, W = c.width, H = c.height, piece = state.piece, p = state.playing ? state.playProject : state.project;
    if (s.dirty || s.pieceId !== piece?.id || s.projectRef !== p) {
      const ctx = this.layer(s);
      s.dirty = false; s.pieceId = piece?.id; s.projectRef = p;
      const foreign = piece && piece.kind !== "project";
      this.text(ctx, foreign ? "NOW PLAYING" : "THE ARRANGEMENT", 56, 62, { size: 13, color: DIM });
      this.text(ctx, (foreign ? piece.title : p.name).slice(0, 34), 54, 128, { size: 62, style: "serif", max: W * 0.6 });
      this.text(ctx, `${p.bpm} BPM   ${noteName(60 + p.root).replace(/\d+$/, "")} ${p.scale.toUpperCase()}   ${Math.ceil(projectBeats(p) / 4)} BARS   ${p.tracks.length} TRACKS`, 56, 168, { size: 14, color: "#b5a993" });
      if (foreign && piece.cover) { ctx.drawImage(piece.cover, W - 56 - 150, 34, 150, 150); ctx.strokeStyle = LINE; ctx.strokeRect(W - 56 - 150 + 0.5, 34.5, 150, 150); }
      s.geo = this.lanes(ctx, p, 56, 236, W - 112, H - 236 - 60, { maxTracks: 8 });
    }
    const ctx = c.getContext("2d"), g = s.geo;
    ctx.drawImage(s.base, 0, 0);
    // Loop region and playhead.
    const e = this.w.studio.engine;
    if (e.loop && e.loopEnd !== null) {
      ctx.fillStyle = "#ff5a2622";
      ctx.fillRect(g.left + (e.loopStart / g.beats) * g.span, 222, ((e.loopEnd - e.loopStart) / g.beats) * g.span, g.bottom - 222);
    }
    const x = g.left + (Math.min(state.beat, g.beats) / g.beats) * g.span;
    ctx.fillStyle = EMBER;
    ctx.fillRect(Math.round(x) - 1, 214, 2, g.bottom - 214);
    ctx.beginPath(); ctx.arc(Math.round(x), 214, 5, 0, Math.PI * 2); ctx.fill();
    const bar = Math.floor(state.beat / 4) + 1, beat = Math.floor(state.beat % 4) + 1;
    this.text(ctx, `${String(bar).padStart(2, "0")}.${beat}`, W - 56, H - 22, { size: 30, style: "display", weight: 700, align: "right", color: state.playing ? BONE : DIM });
    this.text(ctx, state.playing ? "PLAYING" : "READY", 56, H - 26, { size: 12, color: state.playing ? EMBER : DIM });
    // A thin live waveform across the foot of the wall.
    const wave = state.bands.wave;
    ctx.strokeStyle = state.playing ? "#efe7d8aa" : "#efe7d833";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < wave.length; i += 2) { const wx = 200 + (i / wave.length) * (W - 420), wy = H - 30 + wave[i] * 26; i ? ctx.lineTo(wx, wy) : ctx.moveTo(wx, wy); }
    ctx.stroke();
  }
  timeline(s, state) {
    const { canvas: c } = s, W = c.width, H = c.height, p = state.project;
    if (s.dirty) {
      const ctx = this.layer(s);
      s.dirty = false;
      this.text(ctx, "THE LONG VIEW", 44, 50, { size: 12, color: DIM });
      this.text(ctx, p.name.slice(0, 40), 44, 96, { size: 40, style: "serif", max: W * 0.7 });
      s.geo = this.lanes(ctx, p, 44, 150, W - 88, H - 190, { maxTracks: 10 });
    }
    const ctx = c.getContext("2d"), g = s.geo;
    ctx.drawImage(s.base, 0, 0);
    const x = g.left + (Math.min(state.projectBeat, g.beats) / g.beats) * g.span;
    ctx.fillStyle = EMBER;
    ctx.fillRect(Math.round(x) - 1, 132, 2, g.bottom - 132);
  }
  piano(s, state) {
    const { canvas: c } = s, W = c.width, H = c.height, p = state.project;
    if (s.dirty || s.sel !== state.trackId) {
      const ctx = this.layer(s);
      s.dirty = false; s.sel = state.trackId;
      const t = p.tracks.find((t) => t.id === state.trackId && !["drums", "audio"].includes(t.instrument)) || p.tracks.find((t) => !["drums", "audio"].includes(t.instrument)), clip = t?.clips[0];
      this.text(ctx, "THE NOTES", 40, 48, { size: 12, color: DIM });
      this.text(ctx, t ? t.name : "No melodic track yet", 40, 92, { size: 38, style: "serif" });
      s.clip = clip; s.trackRef = t;
      if (!clip?.notes.length) { this.text(ctx, "PLAY THE KEYS, OR OPEN THE PIANO ROLL", 40, H / 2, { size: 13, color: DIM }); return; }
      let lo = 127, hi = 0;
      for (const n of clip.notes) { lo = Math.min(lo, n.pitch); hi = Math.max(hi, n.pitch); }
      lo -= 2; hi += 2;
      const top = 130, gh = H - top - 40, row = gh / (hi - lo + 1);
      for (let pitch = lo; pitch <= hi; pitch++) {
        const y = top + (hi - pitch) * row;
        ctx.fillStyle = [1, 3, 6, 8, 10].includes(pitch % 12) ? "#131110" : "#191614";
        ctx.fillRect(40, y, W - 80, row - 1);
        if (pitch % 12 === 0) this.text(ctx, noteName(pitch), 46, y + row * 0.72, { size: Math.min(11, row * 0.8), color: DIM });
      }
      for (const n of clip.notes) { ctx.fillStyle = t.color; ctx.fillRect(40 + (n.start / clip.length) * (W - 80), top + (hi - n.pitch) * row + 1, Math.max(4, (n.duration / clip.length) * (W - 80) - 2), Math.max(2, row - 3)); }
      s.grid = { top, gh };
    }
    const ctx = c.getContext("2d");
    ctx.drawImage(s.base, 0, 0);
    if (s.clip && s.grid && state.playing) {
      const local = state.projectBeat - s.clip.start;
      if (local >= 0 && local < s.clip.length) { ctx.fillStyle = EMBER; ctx.fillRect(40 + (local / s.clip.length) * (W - 80), s.grid.top, 2, s.grid.gh); }
    }
  }
  drums(s, state) {
    const { canvas: c } = s, W = c.width, H = c.height, p = state.project;
    const t = p.tracks.find((t) => t.instrument === "drums"), clip = t?.clips.find((cl) => state.projectBeat >= cl.start && state.projectBeat < cl.start + cl.length) || t?.clips[0];
    if (s.dirty || s.clipRef !== clip) {
      const ctx = this.layer(s);
      s.dirty = false; s.clipRef = clip;
      this.text(ctx, "PATTERN", 40, 48, { size: 12, color: DIM });
      this.text(ctx, clip ? clip.name : "No drums yet", 40, 92, { size: 38, style: "serif" });
      this.text(ctx, `SWING ${Math.round(p.swing * 100)}%`, W - 40, 48, { size: 12, color: DIM, align: "right" });
      const rows = [["KICK", 36], ["SNARE", 38], ["CLAP", 39], ["HAT", 42], ["OPEN", 46]], top = 124, rh = (H - top - 34) / rows.length, cw = (W - 190) / 16;
      rows.forEach(([name, pitch], r) => {
        this.text(ctx, name, 40, top + r * rh + rh * 0.6, { size: 13, color: "#b5a993" });
        for (let i = 0; i < 16; i++) {
          const on = clip?.notes.some((n) => n.pitch === pitch && Math.abs(n.start - i / 4) < 0.05);
          ctx.fillStyle = on ? (i % 4 === 0 ? BONE : "#cdbf9f") : i % 4 === 0 ? "#26211d" : "#1a1715";
          ctx.fillRect(150 + i * cw + 3, top + r * rh + 5, cw - 6, rh - 10);
        }
      });
      s.grid = { top, cw, bottom: H - 34 };
    }
    const ctx = c.getContext("2d");
    ctx.drawImage(s.base, 0, 0);
    if (state.playing && clip && s.grid) {
      const step = Math.floor((((state.projectBeat - clip.start) % 4) + 4) % 4 * 4);
      ctx.fillStyle = "#ff5a2638";
      ctx.fillRect(150 + step * s.grid.cw, s.grid.top, s.grid.cw, s.grid.bottom - s.grid.top);
      ctx.fillStyle = EMBER;
      ctx.fillRect(150 + step * s.grid.cw, s.grid.bottom + 4, s.grid.cw, 3);
    }
  }
  master(s, state) {
    const { canvas: c } = s, W = c.width, H = c.height, ctx = c.getContext("2d"), m = state.metrics;
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
    this.text(ctx, "MASTER", 30, 40, { size: 13, color: DIM });
    this.text(ctx, db(m.peak), 30, 128, { size: 82, style: "display", weight: 700 });
    this.text(ctx, "dBFS SAMPLE PEAK", 30, 162, { size: 12, color: DIM });
    this.text(ctx, `RMS ${db(m.rms)}   CREST ${m.crest ? m.crest.toFixed(1) : "—"}   CORR ${m.correlation !== undefined ? m.correlation.toFixed(2) : "—"}`, 30, H - 34, { size: 14, color: "#b5a993" });
    // Twin bar meters with a held peak.
    const scale = (v) => Math.max(0, Math.min(1, (20 * Math.log10(v || 0.00001) + 60) / 60));
    s.hold = Math.max((s.hold || 0) * 0.985, m.peak || 0);
    for (let ch = 0; ch < 2; ch++) {
      const y = 70 + ch * 46, x = 380, w = W - x - 40, level = scale(ch ? m.rms * 1.15 : m.peak);
      ctx.fillStyle = "#1c1916"; ctx.fillRect(x, y, w, 28);
      for (let i = 0; i < 60; i++) { if (i / 60 > level) break; ctx.fillStyle = i > 54 ? EMBER : i > 44 ? "#e8c58c" : BONE; ctx.fillRect(x + (i / 60) * w + 1, y + 3, w / 60 - 3, 22); }
      if (!ch) { ctx.fillStyle = EMBER; ctx.fillRect(x + scale(s.hold) * w, y, 2, 28); }
    }
    for (const mark of [-48, -24, -12, -6, 0]) this.text(ctx, String(mark), 380 + ((mark + 60) / 60) * (W - 420), 62, { size: 11, color: DIM, align: "center" });
    // Spectrum as a single line, not a row of bars.
    const bins = m.spectrum;
    if (bins?.length) {
      ctx.strokeStyle = "#efe7d8cc"; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < 120; i++) { const index = Math.floor(2 ** ((i / 119) * Math.log2(bins.length - 1))), sx = 380 + (i / 119) * (W - 420), sy = H - 70 - (bins[index] / 255) * 150; i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }
      ctx.stroke();
    }
  }
  recording(s, state) {
    const { canvas: c } = s, W = c.width, H = c.height, ctx = c.getContext("2d"), r = state.recording;
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
    this.text(ctx, r?.active ? "RECORDING" : "INPUT", 28, 40, { size: 13, color: r?.active ? EMBER : DIM });
    if (r?.active) { ctx.fillStyle = EMBER; ctx.beginPath(); ctx.arc(W - 40, 34, 9, 0, Math.PI * 2); ctx.fill(); }
    this.text(ctx, r?.active ? `${Math.floor(r.seconds / 60)}:${String(r.seconds % 60).padStart(2, "0")}` : "Ready when you are", 28, 96, { size: 44, style: "serif" });
    const data = r?.wave || [];
    ctx.strokeStyle = BONE; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < data.length; i++) { const x = 28 + (i / data.length) * (W - 56), y = H * 0.68 + data[i] * H * 0.26; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    if (!data.length) { ctx.moveTo(28, H * 0.68); ctx.lineTo(W - 28, H * 0.68); }
    ctx.stroke();
  }
  scope(s, state) {
    const { canvas: c } = s, W = c.width, H = c.height, ctx = c.getContext("2d"), wave = state.bands.wave;
    ctx.fillStyle = "#06120c"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#1c3a2a"; ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo((i * W) / 8, 0); ctx.lineTo((i * W) / 8, H); ctx.moveTo(0, (i * H) / 8); ctx.lineTo(W, (i * H) / 8); ctx.stroke(); }
    // Trigger on a rising zero crossing so the trace stands still, as a real scope would.
    let start = 0;
    for (let i = 1; i < wave.length / 2; i++) if (wave[i - 1] <= 0 && wave[i] > 0) { start = i; break; }
    ctx.strokeStyle = "#9dffc4"; ctx.lineWidth = 2; ctx.shadowColor = "#9dffc4"; ctx.shadowBlur = 8; ctx.beginPath();
    const n = wave.length / 2;
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * W, y = H / 2 - wave[start + i] * H * 1.3; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  update(now) {
    if (now - this.last < 50) return;
    this.last = now;
    const w = this.w, e = w.studio.engine, room = w.currentRoom, playback = w.playback;
    const state = {
      project: w.studio.getProject(), playProject: e.playing && e.p ? e.p : w.studio.getProject(), piece: playback?.current, playing: e.playing, beat: e.beat,
      projectBeat: playback && playback.current?.kind !== "project" ? 0 : e.beat, metrics: w.metrics, bands: e.bands, recording: w.recording, trackId: w.studio.getTrack()?.id,
    };
    for (const s of w.architecture.screens) {
      if (s.room !== room && !s.always) continue;
      if (s.custom) { if (s.custom(s, state, now) !== false) s.texture.needsUpdate = true; continue; }
      const paint = this[s.type];
      if (!paint) continue;
      // Displays with nothing moving on them are only repainted when the project changes.
      const still = !state.playing && !s.dirty && s.painted && !["scope", "master", "recording", "wall"].includes(s.type);
      if (still) continue;
      if (s.type === "wall" && !state.playing && e.bands.level < 0.002 && s.painted && !s.dirty && s.pieceId === state.piece?.id && s.projectRef === state.project) continue;
      if (s.type === "scope" && e.bands.level < 0.002 && s.painted && !s.dirty) continue;
      paint.call(this, s, state);
      s.painted = true;
      s.texture.needsUpdate = true;
    }
  }
}
