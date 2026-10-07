import * as THREE from "three";
import { Device, clamp } from "../device.js";
import { projectBeats } from "../../audio.js";
import { makeClip } from "../../project.js";
import { uid } from "../../id.js";
import { fonts, palette, liveTexture, liveMaterial } from "../../house/materials.js";

const ROWS = 8, ROW = 72, RULER = 44, W = 1536, STRIP_W = 2.3, STRIP_D = 0.102, GAP = 0.02, HEAD = 244, TOOLS = ["SPLIT", "DUPLICATE", "QUANTIZE", "LOOP", "DELETE", "+ TRACK", "PRECISE ↗"];
const cursors = { MOVE: "grab", RESIZE: "ew-resize", TRIM: "ew-resize" };
const INK = "#0b0a09e6", LINE = "#efe7d81f", DIM = "#8c8478", BONE = palette.bone, EMBER = palette.ember;

/**
 * The coffee table is the timeline. At rest the arrangement lies flat in the glass;
 * when you sit down to compose it rises into layered strips, one per track, that
 * can be moved, trimmed, split, copied, looped and muted by hand. Every gesture is
 * an ordinary undoable edit of the same project the precise editor works on.
 */
export class SpatialTimeline extends Device {
  constructor(world) {
    super(world, { name: "timeline", label: "THE TIMELINE", verb: "COMPOSE", room: "living", position: [0.1, -0.03, 3.02], view: { position: [0, 1.06, 1.72], target: [0, 0.03, -0.12], fov: 50 }, range: 4.6 });
    this.dim = 0.7;
    this.reach = 900;
    this.hints = [["DRAG", "MOVE"], ["EDGE", "TRIM"], ["ALT", "COPY"], ["S", "SPLIT"], ["Q", "QUANTIZE"], ["L", "LOOP"], ["SPACE", "PLAY"], ["ESC", "BACK"]];
    this.rise = 0;
    this.rowOffset = 0;
    this.viewStart = 0;
    this.viewBeats = 32;
    this.dirty = true;
    this.hoverBeat = null;
    this.plane = new THREE.Plane();
    this.point = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.buildTable();
    this.buildStage();
    this.s.store.addEventListener("change", () => { this.fit(); this.dirty = true; });
    this.s.engine.addEventListener("transport", () => (this.dirty = true));
    world.events.addEventListener("project", () => (this.dirty = true));
    this.fit();
  }
  buildTable() {
    const { m, a } = this, top = this.box(2.6, 0.05, 1.25, 0, -0.025, 0, m.walnut);
    this.body(top);
    this.box(2.36, 0.006, 1.06, 0, 0.002, 0, m.smoked).castShadow = false;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(0.04, 0.37, 0.04, sx * 1.22, -0.235, sz * 0.55, m.bronze);
    this.box(2.3, 0.025, 0.9, 0, -0.3, 0, m.walnut);
    for (let i = 0; i < 4; i++) this.box(0.21, 0.012, 0.29, -0.82 + i * 0.012, -0.281 + i * 0.012, 0.1 + (i % 2) * 0.02, i % 2 ? m.paper : m.dark).rotation.y = i * 0.07;
    this.standby = this.live(this.box(2.3, 0.004, 0.004, 0, 0.003, 0.6, m.ember));
    this.standby.castShadow = false;
    const p = this.group.position;
    a.furniture.push({ minX: p.x - 1.3 - 0.2, maxX: p.x + 1.3 + 0.2, minZ: p.z - 0.625 - 0.2, maxZ: p.z + 0.625 + 0.2 });
    a.contact(p.x, p.z, 3.4, 2, this.w.scene, -0.428);
  }
  buildStage() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = RULER + ROWS * ROW;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.texture = liveTexture(this.canvas);
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.material = liveMaterial(new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, opacity: 0.4, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
    this.bake();
    this.stage = this.live(new THREE.Group());
    this.stage.position.set(0, 0.012, 0.52);
    this.group.add(this.stage);
    const H = this.canvas.height, strip = (depth, y0, y1, z) => {
      const geo = new THREE.PlaneGeometry(STRIP_W, depth), uv = geo.attributes.uv;
      for (let i = 0; i < 4; i++) uv.setY(i, uv.getY(i) > 0.5 ? 1 - y0 / H : 1 - y1 / H);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.position.set(0, 0, z);
      mesh.renderOrder = 6;
      this.stage.add(mesh);
      return mesh;
    };
    const rulerDepth = 0.062;
    this.ruler = strip(rulerDepth, 0, RULER, -rulerDepth / 2);
    this.usable(this.ruler, {
      verb: "SEEK", label: "DRAG TO LOOP", focusOnly: true, cursor: "col-resize",
      press: () => { const beat = this.beatAt(); this.rulerStart = beat; this.rulerMoved = false; },
      drag: () => {
        const beat = this.beatAt();
        if (beat === null || this.rulerStart === null) return;
        if (Math.abs(beat - this.rulerStart) >= 1) { this.rulerMoved = true; this.pendingLoop = [Math.floor(Math.min(beat, this.rulerStart)), Math.ceil(Math.max(beat, this.rulerStart))]; this.dirty = true; }
      },
      end: () => {
        const e = this.s.engine, p = this.project();
        if (this.rulerMoved && this.pendingLoop) { e.loop = true; e.setLoopRegion(...this.pendingLoop); this.w.sound.confirm(); this.emit("loop", this.pendingLoop); }
        else if (this.rulerStart !== null) e.seek(p, Math.max(0, Math.round(this.rulerStart * 4) / 4)).catch((err) => this.s.toast(err.message));
        this.pendingLoop = null;
        this.dirty = true;
      },
    });
    this.strips = [];
    for (let i = 0; i < ROWS; i++) {
      const mesh = strip(STRIP_D, RULER + i * ROW, RULER + (i + 1) * ROW, -rulerDepth - GAP - STRIP_D / 2 - i * (STRIP_D + GAP));
      mesh.userData.row = i;
      this.strips.push(mesh);
      this.usable(mesh, {
        verb: () => this.verbAt(i), label: () => this.trackAt(i)?.name.toUpperCase() || "", focusOnly: true, cursor: () => cursors[this.verbAt(i)] || "pointer",
        press: (hit, event) => this.press(i, event),
        drag: ({ event }) => this.drag(event),
        end: () => this.end(),
      });
    }
    this.depth = rulerDepth + GAP + ROWS * (STRIP_D + GAP);
    // The playhead is a blade of light, not a repainted texture.
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.003, 1), new THREE.MeshBasicMaterial({ color: EMBER, toneMapped: false }));
    this.head.material.color.multiplyScalar(1.6);
    this.blade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: EMBER, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.blade.rotation.y = Math.PI / 2;
    this.stage.add(this.head, this.blade);
    this.head.renderOrder = this.blade.renderOrder = 7;
    // Tools along the near edge of the table.
    this.toolCanvas = document.createElement("canvas");
    this.toolCanvas.width = 1536;
    this.toolCanvas.height = 56;
    const ctx = this.toolCanvas.getContext("2d");
    this.toolTexture = new THREE.CanvasTexture(this.toolCanvas);
    this.toolTexture.colorSpace = THREE.SRGBColorSpace;
    this.toolMaterial = new THREE.MeshBasicMaterial({ map: this.toolTexture, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    const paint = () => {
      ctx.clearRect(0, 0, 1536, 56);
      TOOLS.forEach((label, i) => {
        const x = i * (1536 / TOOLS.length);
        ctx.strokeStyle = "#efe7d866"; ctx.lineWidth = 2; ctx.strokeRect(x + 8, 6, 1536 / TOOLS.length - 16, 44);
        ctx.fillStyle = BONE; ctx.font = `500 19px ${fonts.mono}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
        ctx.fillText(label, x + 1536 / TOOLS.length / 2, 29);
      });
      this.toolTexture.needsUpdate = true;
    };
    paint();
    this.w.whenFontsReady(paint);
    this.tools = new THREE.Group();
    this.tools.position.set(0, 0.03, 0.59);
    this.tools.rotation.x = -0.5;
    this.group.add(this.tools);
    TOOLS.forEach((label, i) => {
      const width = STRIP_W / TOOLS.length, geo = new THREE.PlaneGeometry(width, 0.084), uv = geo.attributes.uv;
      for (let k = 0; k < 4; k++) uv.setX(k, (i + (uv.getX(k) > 0.5 ? 1 : 0)) / TOOLS.length);
      const chip = new THREE.Mesh(geo, this.toolMaterial);
      chip.position.set(-STRIP_W / 2 + width * (i + 0.5), 0, 0);
      chip.renderOrder = 6;
      this.tools.add(chip);
      this.usable(chip, { verb: "TOOL", label, focusOnly: true, cursor: "pointer", press: () => this.w.sound.press(), run: () => this.tool(label) });
    });
    this.tools.visible = false;
  }
  project() {
    return this.s.getProject();
  }
  rows() {
    return Math.max(0, Math.min(ROWS, this.project().tracks.length - this.rowOffset));
  }
  /** Strip 0 is nearest the composer and holds the last visible track; the first track sits furthest away. */
  trackAt(strip) {
    const n = this.rows();
    return strip < n ? this.project().tracks[this.rowOffset + n - 1 - strip] : undefined;
  }
  /** Keeps the whole arrangement in view unless the composer has zoomed in. */
  fit() {
    const total = Math.max(16, projectBeats(this.project()));
    if (!this.zoomed) { this.viewStart = 0; this.viewBeats = total; }
    this.viewBeats = clamp(this.viewBeats, 4, total);
    this.viewStart = clamp(this.viewStart, 0, Math.max(0, total - this.viewBeats));
    this.rowOffset = clamp(this.rowOffset, 0, Math.max(0, this.project().tracks.length - ROWS));
  }
  // ——— Geometry: where on the arrangement is the cursor? ———
  fraction() {
    this.stage.updateWorldMatrix(true, false);
    this.normal.set(0, 1, 0).transformDirection(this.stage.matrixWorld);
    this.plane.setFromNormalAndCoplanarPoint(this.normal, this.stage.getWorldPosition(this.point));
    if (!this.w.interaction.raycaster.ray.intersectPlane(this.plane, this.point)) return null;
    return (this.stage.worldToLocal(this.point).x + STRIP_W / 2) / STRIP_W;
  }
  beatAt() {
    const f = this.fraction();
    if (f === null) return null;
    const px = f * W, beat = this.viewStart + ((px - HEAD) / (W - HEAD)) * this.viewBeats;
    this.px = px;
    return beat;
  }
  x(beat) {
    return HEAD + ((beat - this.viewStart) / this.viewBeats) * (W - HEAD);
  }
  clipAt(track, beat) {
    return track?.clips.find((c) => beat >= c.start && beat <= c.start + c.length);
  }
  /** How much of each end of a clip is a handle, in beats: a steady width under the hand, never more than a quarter of the clip. */
  edge(clip) {
    return Math.min(clip.length / 4, Math.max(0.12, this.viewBeats * 0.012));
  }
  verbAt(row) {
    const t = this.trackAt(row);
    if (!t) return "ADD";
    const beat = this.beatAt();
    if (this.px < HEAD) return this.px > 172 ? (this.px > 208 ? "SOLO" : "MUTE") : "SELECT";
    this.hoverBeat = beat;
    const clip = this.clipAt(t, beat);
    if (!clip) return "SELECT";
    const edge = this.edge(clip);
    return beat > clip.start + clip.length - edge ? "RESIZE" : beat < clip.start + edge ? "TRIM" : "MOVE";
  }
  // ——— Editing ———
  press(row, event) {
    const t = this.trackAt(row), s = this.s;
    this.gesture = null;
    if (!t) return;
    const beat = this.beatAt();
    if (this.px < HEAD) {
      if (this.px > 208) s.toggleTrack(t.id, "solo");
      else if (this.px > 172) s.toggleTrack(t.id, "mute");
      else s.select(t.id);
      this.w.sound.toggle(true);
      this.emit(this.px > 208 ? "solo" : this.px > 172 ? "mute" : "select", t.id);
      return;
    }
    let clip = this.clipAt(t, beat);
    if (!clip) { s.select(t.id); this.dirty = true; return; }
    const original = structuredClone(this.project()), source = clip.id, copied = !!event?.altKey;
    if (copied) {
      // Alt-drag leaves the original where it was and carries a copy away. The copy joins the project with the gesture, so one undo takes it back.
      clip = { ...structuredClone(clip), id: uid() };
      clip.notes.forEach((n) => (n.id = uid()));
      t.clips.push(clip);
    }
    s.select(t.id, clip.id);
    const edge = this.edge(clip), kind = copied ? "move" : beat > clip.start + clip.length - edge ? "resize" : beat < clip.start + edge ? "trim" : "move";
    this.gesture = { kind, id: clip.id, source, track: t.id, beat, start: clip.start, length: clip.length, offset: clip.offset || 0, notes: kind === "trim" ? clip.notes.map((n) => ({ ...n })) : null, original, copied };
    this.w.canvas.style.cursor = kind === "move" ? "grabbing" : "ew-resize";
    this.w.sound.press();
    this.dirty = true;
  }
  drag(event) {
    const g = this.gesture;
    if (!g) return;
    const beat = this.beatAt(), clip = this.s.getClip(), p = this.project();
    if (beat === null || !clip || clip.id !== g.id) return;
    const snap = (v) => (event.shiftKey ? v : Math.round(v * 4) / 4), delta = beat - g.beat;
    if (g.kind === "move") clip.start = clamp(snap(g.start + delta), 0, 256 - clip.length);
    else if (g.kind === "resize") clip.length = clamp(snap(g.length + delta), 0.25, 256 - clip.start);
    else {
      // Trimming the front keeps what remains exactly where it was in time.
      const shift = clamp(snap(delta), -g.start, g.length - 0.25);
      clip.start = g.start + shift;
      clip.length = g.length - shift;
      if (clip.asset) clip.offset = Math.max(0, g.offset + (shift * 60) / p.bpm);
      else clip.notes = g.notes.map((n) => ({ ...n, start: n.start - shift })).filter((n) => n.start + n.duration > 0).map((n) => (n.start < 0 ? { ...n, duration: n.duration + n.start, start: 0 } : n));
    }
    if (clip.start !== g.lastStart || clip.length !== g.lastLength) { g.lastStart = clip.start; g.lastLength = clip.length; this.w.sound.knob(); }
    this.dirty = true;
  }
  end() {
    const g = this.gesture, store = this.s.store;
    this.gesture = null;
    if (!g) return;
    this.w.canvas.style.cursor = "";
    // A copy that was never carried anywhere would lie exactly on its original; it is taken back out.
    const track = store.project.tracks.find((t) => t.id === g.track);
    if (g.copied && track?.clips.find((c) => c.id === g.id)?.start === g.start) { track.clips = track.clips.filter((c) => c.id !== g.id); this.s.select(g.track, g.source); }
    if (JSON.stringify(g.original) === JSON.stringify(store.project)) { this.dirty = true; return; }
    // The live preview becomes one undoable step.
    const after = structuredClone(store.project);
    store.project = g.original;
    try {
      this.s.commit(g.copied ? "Copy clip" : g.kind === "move" ? "Move clip" : g.kind === "resize" ? "Resize clip" : "Trim clip", () => { store.project = after; });
      this.s.select(g.track, g.id);
      this.w.sound.release();
      this.emit(g.kind, g.id);
    } catch (e) {
      this.s.toast(e.message);
    }
    this.dirty = true;
  }
  tool(label) {
    const s = this.s, e = s.engine, clip = s.getClip();
    if (label === "SPLIT") s.splitClip(this.hoverInside() ? this.hoverBeat : e.beat);
    else if (label === "DUPLICATE") s.duplicateClip();
    else if (label === "QUANTIZE") s.quantizeClip();
    else if (label === "DELETE") s.removeSelection();
    else if (label === "LOOP") {
      if (e.loopEnd !== null) e.setLoopRegion(null, null);
      else if (clip) { e.loop = true; e.setLoopRegion(clip.start, clip.start + clip.length); }
      else s.toast("Select a clip to loop it, or drag along the ruler.");
    } else if (label === "+ TRACK") {
      s.openCommand();
      const search = document.querySelector("#commandSearch");
      search.value = "Add";
      search.dispatchEvent(new Event("input"));
    } else if (label === "PRECISE ↗") this.w.production("arrange");
    this.emit(label.toLowerCase(), true);
    this.dirty = true;
  }
  hoverInside() {
    const clip = this.s.getClip();
    return clip && this.hoverBeat !== null && this.hoverBeat > clip.start && this.hoverBeat < clip.start + clip.length;
  }
  onKey(e) {
    const map = { KeyS: "SPLIT", KeyD: "DUPLICATE", KeyQ: "QUANTIZE", Delete: "DELETE", Backspace: "DELETE" };
    if (map[e.code]) { this.tool(map[e.code]); return true; }
    if (e.code === "KeyL") { this.tool("LOOP"); return true; }
    if (e.code === "KeyM") { const t = this.s.getTrack(); if (t) this.s.toggleTrack(t.id, "mute"); return true; }
    if (e.code === "ArrowUp" || e.code === "ArrowDown") { this.rowOffset += e.code === "ArrowDown" ? 1 : -1; this.fit(); this.dirty = true; return true; }
    return false;
  }
  onWheel(e) {
    const total = Math.max(16, projectBeats(this.project()));
    if (e.ctrlKey || e.metaKey) {
      const anchor = this.beatAt() ?? this.viewStart + this.viewBeats / 2, next = clamp(this.viewBeats * (e.deltaY > 0 ? 1.18 : 0.85), 4, total);
      this.viewStart = anchor - ((anchor - this.viewStart) / this.viewBeats) * next;
      this.viewBeats = next;
      this.zoomed = next < total - 0.01;
    } else if (e.shiftKey) this.viewStart += Math.sign(e.deltaY) * this.viewBeats * 0.12;
    else this.rowOffset += Math.sign(e.deltaY);
    this.fit();
    this.dirty = true;
  }
  onDoubleClick() {
    const use = this.w.interaction.use, object = this.w.interaction.target, row = object?.userData.row;
    if (row === undefined || !use) return;
    const t = this.trackAt(row), beat = this.beatAt();
    if (!t || this.px < HEAD) return;
    const clip = this.clipAt(t, beat);
    if (clip) { this.s.select(t.id, clip.id); return this.w.production(t.instrument === "drums" ? "rhythm" : "instrument"); }
    if (t.instrument === "audio") return this.s.toast("Import or record audio to make an audio clip.");
    let made;
    this.s.commit("Create clip", () => { made = makeClip(t.instrument === "drums" ? "New groove" : "New phrase", Math.max(0, Math.floor(beat / 4) * 4), 4); t.clips.push(made); });
    this.s.select(t.id, made.id);
    this.w.sound.confirm();
  }
  onEnter() {
    this.tools.visible = true;
    this.w.hud.moment({ eyebrow: "THE TABLE IS THE TIMELINE", title: "Compose.", small: true, hold: 1300 });
  }
  onExit() {
    this.gesture = null;
  }
  // ——— Drawing ———
  redraw() {
    const ctx = this.ctx, p = this.project(), H = this.canvas.height, e = this.s.engine, selected = this.s.getClip()?.id, selectedTrack = this.s.getTrack()?.id, lane = W - HEAD;
    this.dirty = false;
    ctx.clearRect(0, 0, W, H);
    const text = (value, x, y, size, color, align = "left", weight = 500) => {
      ctx.font = `${weight} ${size}px ${fonts.mono}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      if ("letterSpacing" in ctx) ctx.letterSpacing = size * 0.12 + "px";
      ctx.fillText(value, x, y);
    };
    // Ruler.
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, RULER - 4);
    text(`${p.bpm} BPM`, 14, RULER / 2 - 2, 15, BONE);
    text(e.loopEnd !== null ? "LOOP" : "", 150, RULER / 2 - 2, 13, EMBER);
    const loop = this.pendingLoop || (e.loop && e.loopEnd !== null ? [e.loopStart, e.loopEnd] : null);
    if (loop) { ctx.fillStyle = "#ff5a2666"; ctx.fillRect(Math.max(HEAD, this.x(loop[0])), 0, Math.max(2, this.x(loop[1]) - Math.max(HEAD, this.x(loop[0]))), RULER - 4); }
    const every = this.viewBeats > 48 ? 16 : this.viewBeats > 24 ? 8 : 4;
    for (let beat = Math.ceil(this.viewStart); beat <= this.viewStart + this.viewBeats; beat++) {
      const x = Math.round(this.x(beat)) + 0.5;
      if (x < HEAD) continue;
      ctx.fillStyle = beat % 4 === 0 ? "#efe7d8aa" : "#efe7d830";
      ctx.fillRect(x, beat % 4 === 0 ? 14 : 26, 1, beat % 4 === 0 ? 26 : 14);
      if (beat % every === 0) text(String(beat / 4 + 1).padStart(2, "0"), x + 7, 16, 14, BONE);
    }
    // One strip per track.
    for (let row = 0; row < ROWS; row++) {
      const t = this.trackAt(row), y = RULER + row * ROW;
      if (!t) continue;
      const quiet = t.mute || (p.tracks.some((x) => x.solo) && !t.solo);
      ctx.fillStyle = t.id === selectedTrack ? "#141210f2" : INK;
      ctx.fillRect(0, y, W, ROW - 6);
      ctx.fillStyle = t.color;
      ctx.fillRect(0, y, 6, ROW - 6);
      text(t.name.toUpperCase().slice(0, 13), 20, y + 24, 15, quiet ? DIM : BONE);
      text(t.instrument.toUpperCase(), 20, y + 47, 11, DIM, "left", 400);
      for (const [label, x, on, color] of [["M", 176, t.mute, BONE], ["S", 212, t.solo, EMBER]]) {
        ctx.fillStyle = on ? color : "transparent"; ctx.strokeStyle = on ? color : "#efe7d855"; ctx.lineWidth = 1.5;
        ctx.fillRect(x, y + 18, 26, 30); ctx.strokeRect(x + 0.5, y + 18.5, 26, 30);
        text(label, x + 13, y + 34, 14, on ? "#0b0a09" : BONE, "center");
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(HEAD, y, lane, ROW - 6); ctx.clip();
      for (let beat = Math.ceil(this.viewStart / 4) * 4; beat <= this.viewStart + this.viewBeats; beat += 4) { ctx.fillStyle = LINE; ctx.fillRect(Math.round(this.x(beat)), y, 1, ROW - 6); }
      for (const c of t.clips) {
        const x0 = this.x(c.start), x1 = this.x(c.start + c.length), w = x1 - x0 - 3, h = ROW - 14;
        if (x1 < HEAD || x0 > W) continue;
        ctx.globalAlpha = quiet ? 0.34 : 1;
        ctx.fillStyle = t.color + (c.id === selected ? "66" : "3d");
        ctx.fillRect(x0, y + 4, w, h);
        ctx.fillStyle = t.color;
        ctx.fillRect(x0, y + 4, w, 4);
        if (c.asset && p.assets?.[c.asset]) {
          // Real peaks from the decoded sample.
          const peaks = p.assets[c.asset].peaks, mid = y + 6 + h / 2;
          for (let px = 0; px < w; px += 2) { const v = peaks[Math.floor((px / w) * peaks.length)] || 0; ctx.fillRect(x0 + px, mid - v * h * 0.42, 1.2, Math.max(1, v * h * 0.84)); }
        } else if (c.notes.length) {
          let lo = 127, hi = 0;
          for (const n of c.notes) { lo = Math.min(lo, n.pitch); hi = Math.max(hi, n.pitch); }
          const range = Math.max(5, hi - lo);
          for (const n of c.notes) { if (n.start >= c.length) continue; ctx.globalAlpha = (quiet ? 0.3 : 0.55) + n.velocity * 0.45; ctx.fillRect(x0 + (n.start / c.length) * w, y + 14 + (1 - (n.pitch - lo) / range) * (h - 16), Math.max(2.5, (Math.min(n.duration, c.length - n.start) / c.length) * w - 1.5), 3); }
        }
        ctx.globalAlpha = 1;
        if (w > 70) text(c.name.toUpperCase().slice(0, Math.floor(w / 11)), x0 + 8, y + h - 5, 11, quiet ? DIM : "#efe7d8cc", "left", 400);
        if (c.id === selected) {
          ctx.strokeStyle = BONE; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, y + 5, w - 2, h - 2);
          ctx.fillStyle = BONE; ctx.fillRect(x0 + 1, y + 5, 4, h - 2); ctx.fillRect(x0 + w - 5, y + 5, 4, h - 2);
        }
      }
      ctx.restore();
    }
    if (p.tracks.length > ROWS) text(`${this.rowOffset + 1}–${this.rowOffset + ROWS} / ${p.tracks.length}  ↕`, W - 14, RULER / 2 - 2, 12, DIM, "right");
    this.texture.needsUpdate = true;
  }
  update(dt, bands, t) {
    super.update(dt);
    const focused = this.focused, target = focused ? 1 : 0, e = this.s.engine;
    this.rise += (target - this.rise) * (1 - Math.exp(-dt * (focused ? 3.4 : 5)));
    const k = this.rise * this.rise * (3 - 2 * this.rise);
    // At rest the arrangement lies in the glass; composing lifts it into tilted, layered strips.
    this.stage.rotation.x = 0.015 + k * 0.33;
    this.stage.position.y = 0.012 + k * 0.03;
    const shown = this.rows();
    this.strips.forEach((strip, i) => { strip.position.y = (i + 1) * k * 0.012; strip.visible = i < shown; });
    this.ruler.position.y = 0;
    this.material.opacity = 0.34 + k * 0.64 + (focused ? 0 : bands.level * 0.1);
    this.toolMaterial.opacity = k;
    if (!focused && k < 0.02) this.tools.visible = false;
    this.standby.visible = k < 0.5;
    if (this.dirty) this.redraw();
    // Playhead.
    const foreign = this.w.playback?.foreign, beat = foreign ? -1 : e.beat, fx = (this.x(beat) / W - 0.5) * STRIP_W, visible = !foreign && fx > (HEAD / W - 0.5) * STRIP_W && fx < STRIP_W / 2 && (e.playing || beat > 0 || focused);
    this.head.visible = this.blade.visible = visible;
    if (visible) {
      const rows = Math.min(ROWS, this.project().tracks.length), depth = 0.062 + GAP + rows * (STRIP_D + GAP), lift = rows * k * 0.012;
      this.head.scale.z = depth;
      this.head.position.set(fx, lift / 2 + 0.004, -depth / 2);
      this.head.rotation.x = Math.atan2(lift, depth);
      this.blade.scale.set(depth, 0.02 + k * 0.07 + bands.bass * 0.03 * k, 1);
      this.blade.position.set(fx, lift / 2 + 0.01 + (0.02 + k * 0.07) / 2, -depth / 2);
      this.blade.material.opacity = 0.1 + k * 0.12 + (e.playing ? bands.level * 0.2 : 0);
    }
  }
}
