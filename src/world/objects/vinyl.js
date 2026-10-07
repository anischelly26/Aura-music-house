import * as THREE from "three";
import { Device, clamp } from "../device.js";
import { encodeWav, projectBeats } from "../../audio.js";
import { fonts, palette } from "../../house/materials.js";

const REST = 0.02, OUTER = -0.52, INNER = -0.84, SHELF = 6;

/**
 * The turntable. Records are the house's library: your open project, anything you
 * have pressed, and AURA's originals. Choose a sleeve, the record lands on the
 * platter, the arm comes across, the needle drops, and the one shared engine plays it.
 * A bar or two of any record can be cut and dropped into your project as audio.
 */
export class Turntable extends Device {
  constructor(world, options) {
    super(world, { name: "turntable", label: "TURNTABLE", verb: "USE", view: { position: [0.3, 0.72, 1.02], target: [0.3, 0.1, -0.02], fov: 46 }, range: 4, ...options });
    this.hints = [["CLICK", "CHOOSE A RECORD"], ["← →", "BROWSE"], ["SPACE", "PLAY"], ["ESC", "BACK"]];
    this.page = 0;
    this.spin = 0;
    this.arm = REST;
    this.lift = 1;
    this.drop = 0;
    this.loaded = null;
    this.playback = world.playback;
    const m = this.m, a = this.a;
    this.body(this.box(0.48, 0.07, 0.38, 0, 0.035, 0, m.walnut, this.group, 0.006));
    this.box(0.46, 0.006, 0.36, 0, 0.073, 0, m.black).castShadow = false;
    for (const [x, z] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) this.cylinder(0.022, 0.012, x, -0.006, z, m.rubber, this.group, 12);
    this.detail = new THREE.Group();
    this.group.add(this.detail);
    const g = this.detail;
    // Platter and record turn together.
    this.platter = this.live(new THREE.Group());
    this.platter.position.set(-0.045, 0.076, 0);
    g.add(this.platter);
    this.cylinder(0.152, 0.018, 0, 0.009, 0, m.metal, this.platter, 48);
    this.cylinder(0.146, 0.003, 0, 0.0195, 0, m.rubber, this.platter, 48).castShadow = false;
    for (let i = 0; i < 24; i++) this.box(0.004, 0.003, 0.003, Math.sin((i / 24) * Math.PI * 2) * 0.1525, 0.006, Math.cos((i / 24) * Math.PI * 2) * 0.1525, m.chrome, this.platter).castShadow = false;
    this.record = this.live(new THREE.Group());
    this.platter.add(this.record);
    const disc = this.cylinder(0.148, 0.003, 0, 0.0225, 0, m.vinyl, this.record, 64);
    for (const radius of [0.066, 0.095, 0.121, 0.141]) { const groove = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.0007, 4, 64), m.chrome); groove.rotation.x = Math.PI / 2; groove.position.y = 0.0242; groove.castShadow = false; this.record.add(groove); }
    this.labelCanvas = document.createElement("canvas");
    this.labelCanvas.width = this.labelCanvas.height = 256;
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.CircleGeometry(0.052, 40), new THREE.MeshBasicMaterial({ map: this.labelTexture }));
    label.rotation.x = -Math.PI / 2;
    label.position.y = 0.0246;
    this.record.add(label);
    this.cylinder(0.004, 0.018, 0, 0.03, 0, m.chrome, this.platter, 10);
    this.record.visible = false;
    this.usable(disc, { verb: () => (this.playback.playing ? "LIFT THE NEEDLE" : "DROP THE NEEDLE"), label: () => this.playback.current.title.toUpperCase(), focusOnly: true, cursor: "pointer", run: () => this.toggle() });
    // Tonearm on its pivot.
    this.pivot = this.live(new THREE.Group());
    this.pivot.position.set(0.175, 0.105, -0.125);
    g.add(this.pivot);
    this.cylinder(0.02, 0.03, 0.175, 0.09, -0.125, m.metal, g, 20);
    this.tilt = new THREE.Group();
    this.pivot.add(this.tilt);
    const rod = this.cylinder(0.0035, 0.25, 0, 0, 0.085, m.chrome, this.tilt, 8);
    rod.rotation.x = Math.PI / 2;
    this.box(0.018, 0.008, 0.03, 0, -0.004, 0.215, m.black, this.tilt);
    const weight = this.cylinder(0.014, 0.03, 0, 0, -0.05, m.metal, this.tilt, 14);
    weight.rotation.x = Math.PI / 2;
    this.box(0.012, 0.03, 0.012, 0.215, 0.09, 0.03, m.metal, g);
    this.box(0.02, 0.004, 0.016, 0.207, 0.106, 0.03, m.black, g);
    this.button({ x: 0.19, y: 0.076, z: 0.135, w: 0.03, label: "START · STOP", verb: "PRESS", round: true, parent: g, material: m.metal, glow: m.ember, lit: () => this.playback.playing, press: () => this.toggle() });
    this.speedLamp = this.live(this.box(0.006, 0.003, 0.006, 0.145, 0.0775, 0.155, m.off, g));
    this.plate = this.faceplate(0.2, 0.05, 0.14, 0.0768, 0.103, (ctx, W, H) => {
      ctx.font = `500 ${H * 0.3}px ${fonts.mono}`; ctx.fillStyle = "#a79c89"; ctx.textBaseline = "middle";
      if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
      ctx.fillText("33⅓", W * 0.02, H * 0.3);
      ctx.textAlign = "right"; ctx.fillText("CUT  1 · 2 · 4 BARS", W * 0.98, H * 0.3);
    }, { parent: g, resolution: 512 });
    [1, 2, 4].forEach((bars, i) => this.button({ x: 0.06 + i * 0.036, y: 0.076, z: 0.135, w: 0.026, d: 0.016, label: `${bars} ${bars > 1 ? "BARS" : "BAR"} INTO YOUR PROJECT`, verb: "CUT", parent: g, press: () => this.cut(bars) }));
    // The sleeve of what is on the platter leans beside the deck.
    this.nowCanvas = document.createElement("canvas");
    this.nowCanvas.width = this.nowCanvas.height = 512;
    this.nowTexture = new THREE.CanvasTexture(this.nowCanvas);
    this.nowTexture.colorSpace = THREE.SRGBColorSpace;
    this.nowTexture.anisotropy = 8;
    this.now = new THREE.Mesh(new THREE.BoxGeometry(0.315, 0.315, 0.006), [m.paper, m.paper, m.paper, m.paper, new THREE.MeshStandardMaterial({ map: this.nowTexture, roughness: 0.8 }), m.paper]);
    this.now.position.set(-0.46, 0.165, -0.1);
    this.now.rotation.set(-0.2, 0.25, 0);
    this.now.castShadow = true;
    this.group.add(this.now);
    // A rack of sleeves to choose from.
    this.rack = new THREE.Group();
    this.rack.position.set(0.58, 0, -0.06);
    // Turned toward whoever is standing at the deck, so the sleeves can be read.
    this.rack.rotation.y = 0.72;
    this.group.add(this.rack);
    this.box(0.44, 0.02, 0.26, 0.17, 0.01, 0, m.walnut, this.rack);
    for (let i = 0; i <= SHELF; i++) this.box(0.008, 0.07, 0.24, -0.04 + i * 0.07, 0.045, 0, m.bronze, this.rack);
    this.sleeves = Array.from({ length: SHELF }, (_, i) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.315, 0.315), [m.paper, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }), m.paper, m.paper, m.paper, m.paper]);
      mesh.position.set(-0.005 + i * 0.07, 0.18 + i * 0.03, 0);
      mesh.rotation.z = -0.12;
      mesh.castShadow = true;
      this.rack.add(mesh);
      const sleeve = { mesh, canvas, texture, piece: null, lift: 0, hover: false, index: i };
      this.usable(mesh, { verb: "PLAY", label: () => (sleeve.piece ? `${sleeve.piece.title.toUpperCase()} — ${sleeve.piece.artist.toUpperCase()}` : ""), range: 3.2, direct: true, cursor: "pointer", run: () => sleeve.piece && this.put(sleeve.piece) });
      return sleeve;
    });
    this.button({ x: -0.03, y: 0.02, z: 0.15, w: 0.03, d: 0.02, label: "EARLIER RECORDS", verb: "BROWSE", parent: this.rack, press: () => this.turn(-1) });
    this.button({ x: 0.37, y: 0.02, z: 0.15, w: 0.03, d: 0.02, label: "MORE RECORDS", verb: "BROWSE", parent: this.rack, press: () => this.turn(1) });
    // The sample you cut appears for a moment as a small lit card.
    this.card = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.004, 0.056), new THREE.MeshBasicMaterial({ color: palette.ember, toneMapped: false }));
    this.card.visible = false;
    this.live(this.card);
    this.group.add(this.card);
    this.bake();
    this.bake(this.platter);
    this.bake(this.record);
    this.playback.addEventListener("change", () => this.sync());
    world.whenFontsReady(() => { this.signature = ""; this.sync(); });
    this.sync();
  }
  turn(by) {
    const count = this.playback.library().length;
    this.page = clamp(this.page + by, 0, Math.max(0, Math.ceil(count / SHELF) - 1));
    this.signature = "";
    this.sync();
    this.w.sound.tick();
  }
  onKey(e) {
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") { this.turn(e.code === "ArrowRight" ? 1 : -1); return true; }
    return false;
  }
  /** Brings the deck in line with what the house is playing, wherever it was chosen. */
  sync() {
    const pb = this.playback, piece = pb.current, list = pb.library(), signature = list.map((x) => x.id + x.title).join("|") + this.page;
    if (signature !== this.signature) {
      this.signature = signature;
      this.sleeves.forEach((sleeve, i) => {
        sleeve.piece = list[this.page * SHELF + i] || null;
        sleeve.mesh.visible = !!sleeve.piece;
        if (!sleeve.piece) return;
        sleeve.canvas.getContext("2d").drawImage(pb.cover(sleeve.piece, 256), 0, 0, 256, 256);
        sleeve.texture.needsUpdate = true;
      });
    }
    if (this.loaded !== piece.id + piece.title) {
      this.loaded = piece.id + piece.title;
      const cover = pb.cover(piece, 512);
      this.nowCanvas.getContext("2d").drawImage(cover, 0, 0);
      this.nowTexture.needsUpdate = true;
      const ctx = this.labelCanvas.getContext("2d");
      ctx.save();
      ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(cover, 96, 60, 320, 320, 0, 0, 256, 256);
      ctx.restore();
      ctx.fillStyle = "#0b0a09"; ctx.beginPath(); ctx.arc(128, 128, 9, 0, Math.PI * 2); ctx.fill();
      this.labelTexture.needsUpdate = true;
      this.record.visible = true;
      this.drop = 1;
    }
    this.refresh();
  }
  async put(piece) {
    const pb = this.playback;
    if (pb.current.id !== piece.id) { pb.select(piece.id); this.w.sound.press(); }
    this.emit("record", piece.id);
    // Let the record land and the arm travel before the music starts.
    this.cue = performance.now() + (this.w.reduced ? 0 : 1100);
    this.wanted = piece.id;
  }
  async toggle() {
    const pb = this.playback;
    if (pb.playing) { pb.pause(); this.w.sound.release(); }
    else { this.cue = performance.now() + (this.w.reduced ? 0 : 650); this.wanted = pb.current.id; }
  }
  /** Renders the chosen bars of the record and adds them to the open project as an audio track. */
  async cut(bars) {
    if (this.cutting) return;
    const pb = this.playback, piece = pb.current, s = this.s;
    this.cutting = true;
    try {
      s.toast(`Cutting ${bars} ${bars > 1 ? "bars" : "bar"} from ${piece.title}…`);
      const { project, assets } = await pb.projectFor(piece), snapshot = structuredClone(project);
      const total = projectBeats(snapshot), startBeat = Math.min(Math.floor(pb.progress.beat / 4) * 4, Math.max(0, total - bars * 4));
      const rendered = await s.engine.render(snapshot, assets ? { assets } : {});
      const rate = rendered.sampleRate, from = Math.floor(((startBeat * 60) / snapshot.bpm) * rate), length = Math.min(rendered.length - from, Math.floor(((bars * 4 * 60) / snapshot.bpm) * rate));
      if (length < rate * 0.1) throw Error("There is nothing to cut at this point in the record.");
      const slice = new AudioBuffer({ length, numberOfChannels: rendered.numberOfChannels, sampleRate: rate }), fade = Math.min(256, length >> 3);
      for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        const out = slice.getChannelData(ch);
        out.set(rendered.getChannelData(ch).subarray(from, from + length));
        for (let i = 0; i < fade; i++) { out[i] *= i / fade; out[length - 1 - i] *= i / fade; }
      }
      const name = `${piece.title} · bar ${startBeat / 4 + 1}`;
      await s.importAudio(new File([encodeWav(slice)], name + ".wav", { type: "audio/wav" }));
      this.cardLife = 1;
      this.w.sound.confirm();
      this.emit("cut", bars);
      s.toast(`${name} is on your timeline as a new audio track.`);
    } catch (e) {
      s.toast(e.message || "The sample could not be cut.");
    } finally {
      this.cutting = false;
    }
  }
  update(dt, bands, t) {
    super.update(dt);
    const pb = this.playback, playing = pb.playing, still = this.w.reduced;
    if (this.cue && performance.now() >= this.cue) {
      this.cue = null;
      if (pb.current.id === this.wanted && !pb.playing) { this.w.sound.needle(); pb.play().catch((e) => this.s.toast(e.message)); }
    }
    const cueing = !!this.cue;
    // The platter has weight: it runs up to speed and coasts down.
    this.spin += ((playing || cueing ? 3.49 : 0) - this.spin) * (1 - Math.exp(-dt * (playing || cueing ? 2.2 : 1.1)));
    if (!still) this.platter.rotation.y -= this.spin * dt;
    const want = playing || cueing ? OUTER + (INNER - OUTER) * (playing ? pb.progress.fraction : 0) : REST;
    this.arm += (want - this.arm) * (1 - Math.exp(-dt * 3.2));
    const over = this.arm < OUTER + 0.08, lift = playing && over ? 0 : 1;
    this.lift += (lift - this.lift) * (1 - Math.exp(-dt * 6));
    this.pivot.rotation.y = this.arm;
    this.tilt.rotation.x = -0.02 - this.lift * 0.07 + (playing && !still ? Math.sin(t * 0.02) * 0.0015 : 0);
    if (this.drop > 0.001) { this.drop *= Math.exp(-dt * 5); this.record.position.y = this.drop * 0.16; }
    this.speedLamp.material = playing ? this.m.ember : this.m.off;
    for (const sleeve of this.sleeves) {
      if (!sleeve.piece) continue;
      const hover = this.w.interaction.target === sleeve.mesh, current = sleeve.piece.id === pb.current.id;
      sleeve.lift += ((hover ? 1 : current ? 0.45 : 0) - sleeve.lift) * (1 - Math.exp(-dt * 12));
      sleeve.mesh.position.y = 0.18 + sleeve.index * 0.03 + sleeve.lift * 0.08;
      sleeve.mesh.rotation.z = -0.12 + sleeve.lift * 0.1;
    }
    if (this.cardLife > 0) {
      this.cardLife -= dt / 1.8;
      const life = Math.max(0, this.cardLife), up = 1 - life;
      this.card.visible = life > 0;
      this.card.position.set(-0.045 + up * 0.1, 0.12 + Math.sin(up * Math.PI) * 0.16, up * 0.2);
      this.card.rotation.y = up * 3;
      this.card.scale.setScalar(0.4 + Math.sin(Math.min(1, up * 2.5) * Math.PI * 0.5) * 0.6 * Math.min(1, life * 4));
    }
  }
}
