import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seeded } from "./layout.js";
import { fonts, palette } from "./materials.js";

const spineColors = ["#1c1a18", "#e4dac6", "#8a2f1f", "#c79a52", "#39463b", "#2b3a4a", "#d8cbb0", "#5a3a2a"];
const cableColors = ["#ff5a26", "#e8d9bd", "#1b1917", "#c79a52"];

/**
 * The house's furniture and equipment vocabulary, composed from primitives in the
 * shared material palette. Static parts are merged per room after construction;
 * anything registered with `a.live` or `a.usable` stays responsive.
 */
export class Kit {
  constructor(a, g, seed) {
    this.a = a;
    this.g = g;
    this.m = a.m;
    this.random = seeded(seed);
    const paint = (color) => { const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 }); mat.userData.paint = true; return mat; };
    if (!a.spines) a.spines = spineColors.map(paint);
    if (!a.cables) a.cables = cableColors.map(paint);
  }
  box(w, h, d, x, y, z, mat, parent = this.g) {
    return this.a.box(w, h, d, x, y, z, mat, parent);
  }
  mesh(geo, mat, x, y, z, parent = this.g) {
    return this.a.mesh(geo, mat, x, y, z, parent);
  }
  cyl(r, h, x, y, z, mat, parent = this.g, segments = 16, rb = r) {
    return this.mesh(new THREE.CylinderGeometry(r, rb, h, segments), mat, x, y, z, parent);
  }
  /** A rotated sub-assembly; children are placed in its local space. */
  group(x, y, z, rotation = 0, parent = this.g) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    parent.add(group);
    return group;
  }
  solid(x, z, w, d, pad = 0.3) {
    this.a.solid(this.g, x, z, w, d, pad);
  }
  // ——— Light ———
  /** A practical lamp. `light` adds a real point light; otherwise it glows and pools on the floor. */
  floorLamp(x, z, { light = false, height = 1.75, color = "#ffb774" } = {}) {
    const { m } = this, g = this.group(x, 0, z);
    this.cyl(0.17, 0.03, 0, 0.015, 0, m.bronze, g, 20);
    this.cyl(0.012, height, 0, height / 2, 0, m.bronze, g, 8);
    const shade = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.94, side: THREE.DoubleSide });
    shade.userData.glow = 1.9;
    const cone = this.mesh(new THREE.CylinderGeometry(0.15, 0.24, 0.3, 24, 1, true), shade, 0, height + 0.06, 0, g);
    cone.castShadow = false;
    this.a.contact(x, z, 0.9, 0.9, this.g);
    return this.lamp(g, cone, shade, x, height, z, color, light, 3.4);
  }
  tableLamp(x, y, z, { light = false, color = "#ffb774" } = {}) {
    const { m } = this, g = this.group(x, y, z);
    this.cyl(0.07, 0.02, 0, 0.01, 0, m.bronze, g, 16);
    this.cyl(0.008, 0.26, 0, 0.14, 0, m.bronze, g, 6);
    const shade = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.94, side: THREE.DoubleSide });
    shade.userData.glow = 1.9;
    const dome = this.mesh(new THREE.SphereGeometry(0.13, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), shade, 0, 0.27, 0, g);
    dome.castShadow = false;
    return this.lamp(g, dome, shade, x, y + 0.2, z, color, light, 1.6, y + 0.006);
  }
  pendant(x, y, z, { drop = 1.6, color = "#ffc48a", radius = 0.2, light = false } = {}) {
    const { m } = this, g = this.group(x, y, z);
    this.cyl(0.004, drop, 0, drop / 2, 0, m.black, g, 5);
    const shade = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.96, side: THREE.DoubleSide });
    shade.userData.glow = 2.2;
    this.cyl(radius * 0.25, 0.12, 0, 0.06, 0, m.bronze, g, 16, radius);
    const disc = this.mesh(new THREE.CircleGeometry(radius * 0.96, 24), shade, 0, 0.002, 0, g);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = false;
    return this.lamp(g, disc, shade, x, y - 0.1, z, color, light, 2.6, 0.026, false);
  }
  lamp(group, shadeMesh, shade, x, y, z, color, light, poolSize, poolY = 0.026, switchable = true) {
    const a = this.a, entry = { shade, on: true, level: 1, color: new THREE.Color(color), pool: a.pool(x, poolY, z, poolSize, this.g, color, 0.42), light: null };
    if (light) {
      entry.light = new THREE.PointLight(color, 1, 9, 1.8);
      entry.light.position.set(x, y + 0.15, z);
      entry.light.userData.base = 9;
      this.g.add(entry.light);
      a.roomLights.push(entry.light);
    }
    a.lamps.push(entry);
    a.live(shadeMesh);
    if (switchable)
      a.usable(shadeMesh, {
        verb: () => (entry.on ? "SWITCH OFF" : "SWITCH ON"), label: "LAMP", range: 3.2,
        run: () => { entry.on = !entry.on; a.world?.sound.lamp(entry.on); },
      });
    return entry;
  }
  // ——— Living things and soft goods ———
  plant(x, z, h = 1.8, { pot = this.m.ivory, y = 0 } = {}) {
    const { m, random } = this, g = this.group(x, y, z);
    this.cyl(0.26, 0.42, 0, 0.21, 0, pot, g, 18, 0.2);
    this.cyl(0.24, 0.02, 0, 0.41, 0, m.dark, g, 18);
    // Stems and leaves are merged into one mesh that sways as a whole.
    const parts = [], piece = new THREE.Object3D();
    const place = (geo, px, py, pz, rx, ry, rz, sx = 1, sy = 1, sz = 1) => {
      piece.position.set(px, py, pz);
      piece.rotation.set(rx, ry, rz);
      piece.scale.set(sx, sy, sz);
      piece.updateMatrix();
      const part = geo.toNonIndexed();
      part.applyMatrix4(piece.matrix);
      parts.push(part);
    };
    const leaf = new THREE.SphereGeometry(1, 7, 5);
    for (let i = 0; i < 13; i++) {
      const angle = i * 2.4, lift = 0.25 + random() * (h - 0.5), reach = 0.14 + random() * 0.3;
      place(new THREE.CylinderGeometry(0.008, 0.008, lift, 5), Math.sin(angle) * reach * 0.4, lift / 2, Math.cos(angle) * reach * 0.4, 0, 0, Math.sin(angle) * 0.18);
      place(leaf, Math.sin(angle) * reach, lift, Math.cos(angle) * reach, Math.cos(angle) * 0.5, angle, Math.sin(angle) * 0.7, 0.11 + random() * 0.05, 0.3 + random() * 0.16, 0.03);
    }
    const crown = this.mesh(mergeGeometries(parts), m.leaf, 0, 0.42, 0, g);
    parts.forEach((part) => part.dispose());
    this.a.live(crown);
    this.a.swaying.push({ object: crown, phase: random() * 6, amount: 0.012 });
    if (!y) this.a.contact(x, z, 1.2, 1.2, this.g);
    return g;
  }
  /** Sheer fabric at the glass, moving with a slow draught. */
  curtain(x, z, width, { height = 5.6, rotation = 0, color = "#e9dfcc" } = {}) {
    const geo = new THREE.PlaneGeometry(width, height, Math.max(12, Math.round(width * 6)), 6);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.a.time || (this.a.time = { value: 0 });
      shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n float hang = 1. - uv.y; transformed.z += (sin(position.x * 9. + uTime * .7) * .05 + sin(position.x * 3.1 - uTime * .45) * .08) * (.35 + hang);");
    };
    const curtain = this.mesh(geo, material, x, height / 2 + 0.2, z);
    curtain.rotation.y = rotation;
    curtain.castShadow = false;
    curtain.userData.keep = true;
    this.box(width + 0.2, 0.03, 0.03, x, height + 0.25, z, this.m.bronze).rotation.y = rotation;
    return curtain;
  }
  // ——— Shelving, books and records ———
  /** Open shelving. `fill` is 'records', 'books' or 'mixed'. */
  shelf(x, z, w, h, { rotation = 0, depth = 0.36, rows = 4, fill = "mixed", solid = true, wood = this.m.walnut } = {}) {
    const { random } = this, g = this.group(x, 0, z, rotation), gap = (h - 0.06) / rows;
    this.box(w, 0.04, depth, 0, 0.04, 0, wood, g);
    for (const side of [-1, 1]) this.box(0.04, h, depth, side * (w / 2 - 0.02), h / 2, 0, wood, g);
    this.box(w, h, 0.02, 0, h / 2, -depth / 2 + 0.01, wood, g);
    for (let row = 0; row < rows; row++) {
      const y = 0.06 + row * gap;
      this.box(w - 0.06, 0.03, depth, 0, y + gap - 0.015, 0, wood, g);
      let cursor = -w / 2 + 0.06;
      const records = fill === "records" || (fill === "mixed" && row % 2 === 0);
      while (cursor < w / 2 - 0.1) {
        if (random() < 0.07) { cursor += 0.1 + random() * 0.25; continue; }
        const mat = this.a.spines[Math.floor(random() * this.a.spines.length)];
        if (records) {
          // Record spines: thin, tall, close together; the odd one leans.
          const run = 0.05 + random() * 0.3, count = Math.floor(run / 0.011);
          const block = this.box(run, Math.min(gap - 0.06, 0.315), 0.31, cursor + run / 2, y + Math.min(gap - 0.06, 0.315) / 2 + 0.002, 0.02, mat, g);
          if (random() < 0.12) block.rotation.z = 0.06;
          cursor += run + 0.004 * (count ? 1 : 0);
        } else {
          const bw = 0.02 + random() * 0.035, bh = Math.min(gap - 0.07, 0.17 + random() * 0.12);
          const book = this.box(bw, bh, 0.16 + random() * 0.07, cursor + bw / 2, y + bh / 2 + 0.002, 0.04, mat, g);
          if (random() < 0.06) book.rotation.z = 0.2;
          cursor += bw + 0.002;
        }
      }
    }
    if (solid) {
      const cos = Math.abs(Math.cos(rotation)), sin = Math.abs(Math.sin(rotation));
      this.solid(x, z, w * cos + depth * sin, w * sin + depth * cos);
    }
    return g;
  }
  books(x, y, z, count = 5, rotation = 0) {
    const { random } = this, g = this.group(x, y, z, rotation);
    let h = 0;
    for (let i = 0; i < count; i++) {
      const t = 0.018 + random() * 0.022, book = this.box(0.21 + random() * 0.06, t, 0.15 + random() * 0.04, (random() - 0.5) * 0.02, h + t / 2, (random() - 0.5) * 0.02, this.a.spines[Math.floor(random() * this.a.spines.length)], g);
      book.rotation.y = (random() - 0.5) * 0.3;
      h += t;
    }
    return h;
  }
  /** Loose records and sleeves leaning against something. */
  sleeves(x, y, z, count = 6, rotation = 0, lean = 0.16) {
    const g = this.group(x, y, z, rotation);
    for (let i = 0; i < count; i++) {
      const s = this.box(0.315, 0.315, 0.006, 0, 0.158, i * 0.012, this.a.spines[(i * 3 + Math.floor(this.random() * 3)) % this.a.spines.length], g);
      s.rotation.x = -lean - i * 0.004;
    }
    return g;
  }
  crate(x, z, rotation = 0, y = 0) {
    const { m } = this, g = this.group(x, y, z, rotation);
    this.box(0.36, 0.02, 0.5, 0, 0.01, 0, m.wood, g);
    for (const side of [-1, 1]) { this.box(0.02, 0.26, 0.5, side * 0.17, 0.14, 0, m.wood, g); this.box(0.36, 0.26, 0.02, 0, 0.14, side * 0.24, m.wood, g); }
    for (let i = 0; i < 22; i++) this.box(0.31, 0.31, 0.012, 0, 0.19, -0.2 + i * 0.019, this.a.spines[Math.floor(this.random() * this.a.spines.length)], g).rotation.x = -0.05;
    if (!y) this.a.contact(x, z, 0.8, 0.9, this.g);
    return g;
  }
  // ——— Furniture ———
  /** A slab table or desk on brass or timber legs. */
  table(x, z, w, d, { h = 0.74, top = this.m.walnut, legs = this.m.bronze, thickness = 0.05, rotation = 0, solid = true, apron = false } = {}) {
    const g = this.group(x, 0, z, rotation);
    this.box(w, thickness, d, 0, h - thickness / 2, 0, top, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(0.035, h - thickness, 0.035, sx * (w / 2 - 0.07), (h - thickness) / 2, sz * (d / 2 - 0.07), legs, g);
    if (apron) this.box(w - 0.2, 0.09, 0.02, 0, h - thickness - 0.05, -d / 2 + 0.09, top, g);
    if (solid) {
      const cos = Math.abs(Math.cos(rotation)), sin = Math.abs(Math.sin(rotation));
      this.solid(x, z, w * cos + d * sin, w * sin + d * cos, 0.28);
    }
    this.a.contact(x, z, w * (Math.abs(Math.cos(rotation)) || 0.4) + 0.6 + d * Math.abs(Math.sin(rotation)), d * (Math.abs(Math.cos(rotation)) || 0.4) + 0.6 + w * Math.abs(Math.sin(rotation)), this.g);
    return g;
  }
  /** Low sideboard with slatted doors: the hi-fi cabinet of the house. */
  credenza(x, z, w, { h = 0.6, d = 0.5, rotation = 0, solid = true } = {}) {
    const { m } = this, g = this.group(x, 0, z, rotation);
    this.box(w, h - 0.14, d, 0, 0.14 + (h - 0.14) / 2, 0, m.walnut, g);
    for (const sx of [-1, 1]) this.box(0.03, 0.14, d - 0.1, sx * (w / 2 - 0.16), 0.07, 0, m.bronze, g);
    const slats = Math.floor((w - 0.08) / 0.035);
    for (let i = 0; i < slats; i++) this.box(0.014, h - 0.2, 0.012, -w / 2 + 0.05 + i * 0.035, 0.14 + (h - 0.14) / 2, d / 2 + 0.006, m.wood, g);
    if (solid) {
      const cos = Math.abs(Math.cos(rotation)), sin = Math.abs(Math.sin(rotation));
      this.solid(x, z, w * cos + d * sin, w * sin + d * cos, 0.28);
    }
    return g;
  }
  stool(x, z, { h = 0.5, seat = this.m.leather } = {}) {
    const g = this.group(x, 0, z);
    this.cyl(0.19, 0.06, 0, h, 0, seat, g, 20);
    for (let i = 0; i < 3; i++) { const leg = this.cyl(0.012, h, Math.sin(i * 2.094) * 0.13, h / 2, Math.cos(i * 2.094) * 0.13, this.m.bronze, g, 6); leg.rotation.set(Math.cos(i * 2.094) * 0.12, 0, -Math.sin(i * 2.094) * 0.12); }
    this.a.contact(x, z, 0.7, 0.7, this.g);
    return g;
  }
  /** A studio chair that turns a little when nudged. */
  chair(x, z, rotation = 0, { fabric = this.m.leather } = {}) {
    const { m } = this, g = this.group(x, 0, z, rotation);
    g.userData.keep = true;
    this.cyl(0.26, 0.02, 0, 0.03, 0, m.black, g, 5);
    this.cyl(0.022, 0.4, 0, 0.24, 0, m.chrome, g, 10);
    const seat = this.a.cushion(0.5, 0.08, 0.5, 0, 0.47, 0, fabric, g);
    const back = this.a.cushion(0.48, 0.5, 0.07, 0, 0.78, -0.24, fabric, g);
    back.rotation.x = -0.12;
    this.a.contact(x, z, 0.9, 0.9, this.g);
    return { group: g, seat };
  }
  bench(x, z, w, { d = 0.42, h = 0.44, rotation = 0, top = this.m.leather, solid = true } = {}) {
    const g = this.group(x, 0, z, rotation);
    const seat = this.a.cushion(w, 0.09, d, 0, h - 0.045, 0, top, g);
    for (const sx of [-1, 1]) this.box(0.03, h - 0.09, d - 0.06, sx * (w / 2 - 0.12), (h - 0.09) / 2, 0, this.m.bronze, g);
    if (solid) {
      const cos = Math.abs(Math.cos(rotation)), sin = Math.abs(Math.sin(rotation));
      this.solid(x, z, w * cos + d * sin, w * sin + d * cos, 0.26);
    }
    this.a.contact(x, z, w + 0.4, d + 0.5, this.g);
    return { group: g, seat };
  }
  // ——— Audio equipment ———
  /** Three-way floor speaker. Cones are live: they move with the low end. */
  speaker(x, z, { h = 1.25, rotation = 0, cabinet = this.m.walnut } = {}) {
    const { m, a } = this, g = this.group(x, 0, z, rotation);
    this.box(0.36, h, 0.4, 0, h / 2 + 0.06, 0, cabinet, g);
    this.box(0.3, 0.06, 0.34, 0, 0.03, 0, m.black, g);
    this.box(0.33, h - 0.04, 0.012, 0, h / 2 + 0.06, 0.2, m.black, g);
    for (const [y, radius, depth] of [[0.3, 0.125, 1], [0.62, 0.105, 0.8], [0.92, 0.05, 0.3]]) {
      const ring = this.mesh(new THREE.TorusGeometry(radius, 0.012, 8, 28), m.rubber, 0, y * (h / 1.25) + 0.06, 0.208, g);
      ring.castShadow = false;
      const cone = this.mesh(new THREE.ConeGeometry(radius * 0.94, radius * 0.5, 24, 1, true), m.dark, 0, y * (h / 1.25) + 0.06, 0.2, g);
      cone.rotation.x = -Math.PI / 2;
      cone.castShadow = false;
      const cap = this.mesh(new THREE.SphereGeometry(radius * 0.34, 14, 8), m.black, 0, 0, radius * 0.16, cone);
      cap.scale.z = 0.5;
      a.live(cone);
      a.live(cap);
      a.cones.push({ mesh: cone, rest: 0.2, depth: depth * 0.012, band: depth > 0.9 ? "bass" : depth > 0.5 ? "mid" : "high" });
    }
    this.solid(x, z, 0.4, 0.42, 0.24);
    a.contact(x, z, 1, 1, this.g);
    return g;
  }
  /** Nearfield studio monitor with a standby lamp. */
  monitor(x, y, z, rotation = 0, scale = 1) {
    const { m, a } = this, g = this.group(x, y, z, rotation);
    g.scale.setScalar(scale);
    this.box(0.24, 0.36, 0.26, 0, 0.18, 0, m.black, g);
    const cone = this.mesh(new THREE.ConeGeometry(0.085, 0.045, 22, 1, true), m.dark, 0, 0.14, 0.132, g);
    cone.rotation.x = -Math.PI / 2;
    cone.castShadow = false;
    a.live(cone);
    a.cones.push({ mesh: cone, rest: 0.132, depth: 0.008, band: "bass" });
    const ring = this.mesh(new THREE.TorusGeometry(0.09, 0.008, 6, 24), m.rubber, 0, 0.14, 0.134, g);
    ring.castShadow = false;
    const tweeter = this.mesh(new THREE.SphereGeometry(0.026, 12, 8), m.metal, 0, 0.29, 0.128, g);
    tweeter.scale.z = 0.4;
    this.box(0.012, 0.004, 0.004, 0.09, 0.34, 0.131, m.ember, g);
    return g;
  }
  headphones(x, y, z, rotation = 0) {
    const { m } = this, g = this.group(x, y, z, rotation);
    const band = this.mesh(new THREE.TorusGeometry(0.085, 0.009, 6, 20, Math.PI), m.black, 0, 0.075, 0, g);
    for (const side of [-1, 1]) { const cup = this.cyl(0.042, 0.03, side * 0.086, 0.045, 0, m.black, g, 16); cup.rotation.z = Math.PI / 2; const pad = this.cyl(0.044, 0.012, side * 0.07, 0.045, 0, m.leather, g, 16); pad.rotation.z = Math.PI / 2; }
    return g;
  }
  /** A cable draped between points; it sags under its own weight. */
  cable(points, colorIndex = 2, radius = 0.007, parent = this.g) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const tube = this.mesh(new THREE.TubeGeometry(curve, Math.max(10, points.length * 7), radius, 5, false), this.a.cables[colorIndex], 0, 0, 0, parent);
    tube.castShadow = false;
    return tube;
  }
  /** Patch cable between two jacks on a vertical panel. */
  patch(from, to, colorIndex, parent) {
    const mid = [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - 0.06 - Math.abs(from[0] - to[0]) * 0.22, from[2] + 0.06 + this.random() * 0.05];
    return this.cable([from, [from[0], from[1] - 0.01, from[2] + 0.035], mid, [to[0], to[1] - 0.01, to[2] + 0.035], to], colorIndex, 0.0045, parent);
  }
  /** A wall of modules: knobs, jacks, lamps and a tangle of patch cables. */
  modular(x, y, z, w, h, rotation = 0) {
    const { m, random, a } = this, g = this.group(x, y, z, rotation), rows = Math.max(1, Math.round(h / 0.34)), rowH = h / rows;
    this.box(w + 0.08, h + 0.08, 0.2, 0, h / 2, -0.1, m.walnut, g);
    const jacks = [];
    for (let row = 0; row < rows; row++) {
      let cursor = -w / 2;
      const y0 = row * rowH;
      this.box(w, 0.012, 0.012, 0, y0 + rowH - 0.006, 0.006, m.metal, g);
      while (cursor < w / 2 - 0.05) {
        const mw = Math.min(w / 2 - cursor, 0.1 + Math.floor(random() * 4) * 0.05);
        this.box(mw - 0.004, rowH - 0.02, 0.006, cursor + mw / 2, y0 + rowH / 2, 0.003, random() < 0.25 ? m.ivory : m.black, g);
        const cols = Math.max(1, Math.round(mw / 0.05));
        for (let c = 0; c < cols; c++)
          for (let r = 0; r < 4; r++) {
            const px = cursor + (c + 0.5) * (mw / cols), py = y0 + 0.045 + r * ((rowH - 0.07) / 3.4), roll = random();
            if (roll < 0.5) { const knob = this.cyl(0.011, 0.018, px, py, 0.015, m.metal, g, 10); knob.rotation.x = Math.PI / 2; knob.castShadow = false; }
            else if (roll < 0.86) { const jack = this.cyl(0.006, 0.008, px, py, 0.009, m.chrome, g, 8); jack.rotation.x = Math.PI / 2; jack.castShadow = false; jacks.push([px, py, 0.012]); }
            else this.box(0.008, 0.008, 0.004, px, py, 0.008, a.blink[Math.floor(random() * 3)], g).castShadow = false;
          }
        cursor += mw;
      }
    }
    for (let i = 0; i < Math.min(22, jacks.length / 2); i++) {
      const from = jacks[Math.floor(random() * jacks.length)], to = jacks[Math.floor(random() * jacks.length)];
      if (from !== to && Math.abs(from[0] - to[0]) < 1.1) this.patch(from, to, Math.floor(random() * 4), g);
    }
    return g;
  }
  /** Reel-to-reel machine. The reels turn while the house is playing. */
  tape(x, y, z, rotation = 0) {
    const { m, a } = this, g = this.group(x, y, z, rotation);
    this.box(0.5, 0.46, 0.2, 0, 0.23, 0, m.metal, g);
    this.box(0.46, 0.14, 0.01, 0, 0.09, 0.105, m.black, g);
    for (const side of [-1, 1]) {
      const reel = this.group(side * 0.12, 0.32, 0.112, 0, g);
      reel.userData.keep = true;
      const disc = this.cyl(0.095, 0.006, 0, 0, 0, m.chrome, reel, 28);
      disc.rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) { const cut = this.cyl(0.028, 0.008, Math.sin(i * 2.094) * 0.052, Math.cos(i * 2.094) * 0.052, 0, m.dark, reel, 12); cut.rotation.x = Math.PI / 2; }
      const hub = this.cyl(0.02, 0.014, 0, 0, 0.004, m.black, reel, 12);
      hub.rotation.x = Math.PI / 2;
      a.spinners.push({ object: reel, axis: "z", speed: side * 2.2 });
    }
    for (let i = 0; i < 4; i++) { const k = this.cyl(0.014, 0.014, -0.15 + i * 0.1, 0.09, 0.112, m.ivory, g, 10); k.rotation.x = Math.PI / 2; }
    for (let i = 0; i < 2; i++) this.box(0.07, 0.04, 0.004, -0.06 + i * 0.12, 0.14, 0.112, m.led, g);
    return g;
  }
  cassetteDeck(x, y, z, rotation = 0) {
    const { m } = this, g = this.group(x, y, z, rotation);
    this.box(0.43, 0.12, 0.28, 0, 0.06, 0, m.black, g);
    this.box(0.15, 0.07, 0.006, -0.1, 0.065, 0.142, m.smoked, g);
    for (let i = 0; i < 5; i++) this.box(0.022, 0.012, 0.012, 0.04 + i * 0.03, 0.035, 0.143, m.metal, g);
    this.box(0.1, 0.022, 0.004, 0.1, 0.085, 0.142, m.led, g);
    return g;
  }
  /** Outboard gear in a timber rack: faceplates, knobs, a row of lamps. */
  rack(x, z, { units = 5, rotation = 0, w = 0.56 } = {}) {
    const { m, random, a } = this, h = units * 0.1 + 0.1, g = this.group(x, 0, z, rotation);
    this.box(w, h, 0.5, 0, h / 2, 0, m.walnut, g);
    for (let u = 0; u < units; u++) {
      const y = 0.1 + u * 0.1;
      this.box(w - 0.06, 0.088, 0.012, 0, y, 0.252, u % 3 === 1 ? m.metal : m.black, g);
      for (let j = 0; j < 6; j++) { const knob = this.cyl(0.012, 0.014, -w / 2 + 0.09 + j * 0.065, y, 0.262, m.metal, g, 8); knob.rotation.x = Math.PI / 2; knob.castShadow = false; }
      this.box(0.008, 0.008, 0.004, w / 2 - 0.06, y + 0.022, 0.259, a.blink[u % 3], g).castShadow = false;
    }
    this.solid(x, z, w, 0.5, 0.26);
    a.contact(x, z, 1.1, 1, this.g);
    return g;
  }
  /** Electric guitar on a stand. */
  guitar(x, z, rotation = 0, body = this.m.felt) {
    const { m } = this, g = this.group(x, 0, z, rotation), lean = this.group(0, 0.16, 0.05, 0, g);
    lean.rotation.x = -0.2;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.24, -0.02, 0.24, 0.24, 0.13, 0.27);
    shape.bezierCurveTo(0.2, 0.36, 0.14, 0.5, 0.045, 0.47);
    shape.lineTo(-0.045, 0.47);
    shape.bezierCurveTo(-0.14, 0.5, -0.2, 0.36, -0.13, 0.27);
    shape.bezierCurveTo(-0.24, 0.24, -0.24, -0.02, 0, 0);
    this.mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 10 }), body, 0, 0, 0, lean);
    this.box(0.05, 0.66, 0.022, 0, 0.78, 0.035, m.wood, lean);
    this.box(0.07, 0.17, 0.02, 0, 1.19, 0.03, m.wood, lean);
    this.box(0.09, 0.06, 0.012, 0, 0.2, 0.056, m.chrome, lean);
    for (const y of [0.3, 0.38]) this.box(0.08, 0.025, 0.012, 0, y, 0.056, m.black, lean);
    for (let i = 0; i < 6; i++) this.box(0.0012, 0.95, 0.0012, -0.02 + i * 0.008, 0.68, 0.052, m.chrome, lean).castShadow = false;
    this.cyl(0.012, 0.7, 0, 0.35, -0.1, m.black, g, 6).rotation.x = 0.2;
    for (const side of [-1, 1]) this.cyl(0.01, 0.42, side * 0.14, 0.1, 0.02, m.black, g, 6).rotation.z = side * 1.1;
    this.a.contact(x, z, 0.9, 0.9, this.g);
    return g;
  }
  /** Combo amplifier: tolex cabinet, cloth grille, chicken-head knobs. */
  amp(x, z, rotation = 0) {
    const { m } = this, g = this.group(x, 0, z, rotation);
    this.box(0.62, 0.52, 0.28, 0, 0.29, 0, m.rubber, g);
    this.box(0.54, 0.36, 0.01, 0, 0.25, 0.142, m.rug, g);
    this.box(0.56, 0.06, 0.012, 0, 0.5, 0.142, m.metal, g);
    for (let i = 0; i < 6; i++) { const k = this.cyl(0.012, 0.016, -0.2 + i * 0.08, 0.5, 0.155, m.ivory, g, 8); k.rotation.x = Math.PI / 2; }
    this.box(0.01, 0.01, 0.004, 0.25, 0.5, 0.15, m.ember, g);
    this.solid(x, z, 0.62, 0.3, 0.2);
    this.a.contact(x, z, 1.1, 0.8, this.g);
    return g;
  }
  /** Fabric absorbers in a staggered field. */
  panels(x, y, z, cols, rows, { rotation = 0, size = 0.58, gap = 0.05, mats = [this.m.fabric, this.m.rug, this.m.felt] } = {}) {
    const g = this.group(x, y, z, rotation);
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        const depth = 0.05 + ((c * 7 + r * 3) % 3) * 0.025;
        this.box(size, size, depth, (c - (cols - 1) / 2) * (size + gap), (r - (rows - 1) / 2) * (size + gap), depth / 2, mats[(c + r * 2) % mats.length], g);
      }
    return g;
  }
  /** Skyline diffuser: timber blocks of varying depth. */
  diffuser(x, y, z, w, h, rotation = 0) {
    const g = this.group(x, y, z, rotation), n = Math.round(w / 0.1), rows = Math.round(h / 0.1);
    this.box(w + 0.04, h + 0.04, 0.02, 0, 0, 0.01, this.m.walnut, g);
    for (let c = 0; c < n; c++)
      for (let r = 0; r < rows; r++) {
        const depth = 0.03 + this.random() * 0.14;
        this.box(0.092, 0.092, depth, (c - (n - 1) / 2) * 0.1, (r - (rows - 1) / 2) * 0.1, 0.02 + depth / 2, (c + r) % 3 ? this.m.wood : this.m.walnut, g).castShadow = false;
      }
    return g;
  }
  /** Vertical timber slats over a dark field. */
  slats(x, y, z, w, h, { rotation = 0, pitch = 0.09, mat = this.m.walnut } = {}) {
    const g = this.group(x, y, z, rotation);
    this.box(w, h, 0.02, 0, 0, 0.01, this.m.dark, g).castShadow = false;
    for (let i = 0; i < Math.floor(w / pitch); i++) this.box(0.045, h, 0.04, -w / 2 + pitch / 2 + i * pitch, 0, 0.04, mat, g).castShadow = false;
    return g;
  }
  /** A framed print, drawn in the house style. `kind` chooses the composition. */
  poster(x, y, z, w, h, rotation = 0, { kind = "rings", text = "", seed = 1, ground = palette.bone, ink = palette.ink } = {}) {
    const frame = this.a.artFrame(this.g, x, y, z, w, h, rotation, 512), ctx = frame.canvas.getContext("2d"), W = frame.canvas.width, H = frame.canvas.height;
    const draw = () => {
      const random = seeded(seed * 977 + 13);
      ctx.fillStyle = ground;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = ctx.fillStyle = ink;
      if (kind === "rings") {
        for (let i = 0; i < 26; i++) { ctx.globalAlpha = 0.12 + random() * 0.5; ctx.lineWidth = 0.6 + random() * 2.2; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.44 + (random() - 0.5) * H * 0.1, W * (0.1 + random() * 0.32), W * (0.1 + random() * 0.32), random() * 3, 0, Math.PI * 2); ctx.stroke(); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = palette.ember;
        ctx.beginPath(); ctx.arc(W / 2, H * 0.44, W * 0.035, 0, Math.PI * 2); ctx.fill();
      } else if (kind === "wave") {
        ctx.lineWidth = 2;
        for (let row = 0; row < 22; row++) { ctx.globalAlpha = 0.25 + (row / 22) * 0.75; ctx.beginPath(); for (let i = 0; i <= 80; i++) { const u = i / 80, env = Math.exp(-Math.pow((u - 0.5) * 3.2, 2)), yy = H * 0.2 + row * H * 0.027 - Math.abs(Math.sin(u * 30 + row * 0.7 + random() * 0.4)) * env * H * 0.07 * (0.4 + random()); i ? ctx.lineTo(W * 0.12 + u * W * 0.76, yy) : ctx.moveTo(W * 0.12, yy); } ctx.stroke(); }
        ctx.globalAlpha = 1;
      } else if (kind === "blocks") {
        const tones = [ink, palette.ember, palette.brass, "#8d857a", palette.oxblood];
        for (let i = 0; i < 7; i++) { ctx.fillStyle = tones[Math.floor(random() * tones.length)]; const bw = W * (0.14 + random() * 0.4), bh = H * (0.05 + random() * 0.2); ctx.fillRect(W * 0.1 + random() * (W * 0.8 - bw), H * 0.1 + random() * (H * 0.62 - bh), bw, bh); }
      } else {
        ctx.fillStyle = ink;
        ctx.font = `800 ${W * 0.2}px ${fonts.display}`;
        if ("fontStretch" in ctx) ctx.fontStretch = "condensed";
        ctx.textBaseline = "top";
        String(text).split("\n").forEach((line, i) => ctx.fillText(line, W * 0.08, H * 0.08 + i * W * 0.175, W * 0.84));
      }
      if (kind !== "type" && text) {
        ctx.fillStyle = ink;
        ctx.font = `500 ${W * 0.032}px ${fonts.mono}`;
        ctx.textBaseline = "alphabetic";
        if ("letterSpacing" in ctx) ctx.letterSpacing = W * 0.006 + "px";
        ctx.fillText(text, W * 0.08, H * 0.93, W * 0.84);
      }
      frame.texture.needsUpdate = true;
    };
    draw();
    this.a.redraws.push(draw);
    return frame;
  }
  /** A wall clock that keeps the visitor's real time. */
  clock(x, y, z, rotation = 0, radius = 0.2) {
    const { m, a } = this, g = this.group(x, y, z, rotation);
    const face = this.cyl(radius, 0.03, 0, 0, 0, m.ivory, g, 40);
    face.rotation.x = Math.PI / 2;
    const rim = this.mesh(new THREE.TorusGeometry(radius, 0.01, 8, 40), m.bronze, 0, 0, 0.012, g);
    for (let i = 0; i < 12; i++) { const tick = this.box(0.006, i % 3 ? 0.02 : 0.04, 0.002, Math.sin(i * 0.5236) * radius * 0.84, Math.cos(i * 0.5236) * radius * 0.84, 0.017, m.black, g); tick.rotation.z = -i * 0.5236; }
    const hand = (length, width, mat) => { const pivot = this.group(0, 0, 0.02, 0, g); pivot.userData.keep = true; this.box(width, length, 0.003, 0, length / 2 - 0.015, 0, mat, pivot); return pivot; };
    a.clocks.push({ hour: hand(radius * 0.5, 0.012, m.black), minute: hand(radius * 0.76, 0.008, m.black), second: hand(radius * 0.82, 0.003, m.ember) });
    return g;
  }
  mug(x, y, z) {
    const g = this.group(x, y, z);
    this.cyl(0.036, 0.085, 0, 0.0425, 0, this.m.ivory, g, 14, 0.03);
    this.cyl(0.03, 0.004, 0, 0.08, 0, this.m.dark, g, 14);
    return g;
  }
  notebook(x, y, z, rotation = 0) {
    const g = this.group(x, y, z, rotation);
    this.box(0.15, 0.012, 0.21, 0, 0.006, 0, this.m.dark, g);
    this.box(0.14, 0.004, 0.2, 0.003, 0.014, 0, this.m.paper, g);
    const pencil = this.cyl(0.004, 0.17, 0.11, 0.004, 0.02, this.m.bronze, g, 6);
    pencil.rotation.x = Math.PI / 2;
    pencil.rotation.z = 0.3;
    return g;
  }
  /** A small brass form on a plinth: something to look at, nothing to press. */
  sculpture(x, z, { h = 1.1, kind = 0 } = {}) {
    const { m } = this, g = this.group(x, 0, z);
    this.box(0.5, h, 0.5, 0, h / 2, 0, m.concrete, g);
    const form = kind === 0 ? new THREE.TorusKnotGeometry(0.2, 0.045, 80, 10, 2, 3) : kind === 1 ? new THREE.TorusGeometry(0.24, 0.03, 10, 48) : new THREE.IcosahedronGeometry(0.24, 0);
    const piece = this.mesh(form, m.bronze, 0, h + 0.34, 0, g);
    if (kind === 1) { piece.rotation.y = 0.6; const inner = this.mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 40), m.bronze, 0, h + 0.34, 0, g); inner.rotation.set(0.9, 0.2, 0); }
    this.solid(x, z, 0.5, 0.5, 0.24);
    this.a.contact(x, z, 1.1, 1.1, this.g);
    return piece;
  }
  /** Acoustic kit. Every drum and cymbal is playable. */
  drumKit(x, z, rotation = 0) {
    const { m, a } = this, g = this.group(x, 0, z, rotation);
    const shell = new THREE.MeshStandardMaterial({ color: palette.oxblood, roughness: 0.35, metalness: 0.2 }), head = m.ivory, brass = new THREE.MeshStandardMaterial({ color: "#c9a45a", roughness: 0.28, metalness: 0.95, side: THREE.DoubleSide });
    const hit = (mesh, pitch, name) => a.usable(mesh, { verb: "HIT", key: "CLICK", label: name, direct: true, range: 3, press: () => a.world?.hitDrum(pitch, mesh) });
    const drum = (radius, depth, px, py, pz, tilt, pitch, name) => {
      const d = this.group(px, py, pz, 0, g);
      d.rotation.x = tilt;
      this.cyl(radius, depth, 0, 0, 0, shell, d, 28);
      const skin = this.cyl(radius * 0.97, 0.008, 0, depth / 2 + 0.004, 0, head, d, 28);
      for (const end of [-1, 1]) this.mesh(new THREE.TorusGeometry(radius, 0.008, 6, 28), m.chrome, 0, (end * depth) / 2, 0, d).rotation.x = Math.PI / 2;
      hit(skin, pitch, name);
      return d;
    };
    const kick = this.group(0, 0.29, -0.1, 0, g);
    kick.rotation.x = Math.PI / 2;
    this.cyl(0.28, 0.42, 0, 0, 0, shell, kick, 32);
    hit(this.cyl(0.272, 0.008, 0, 0.214, 0, head, kick, 32), 36, "KICK");
    for (const end of [-1, 1]) this.mesh(new THREE.TorusGeometry(0.28, 0.012, 6, 32), m.chrome, 0, end * 0.21, 0, kick).rotation.x = Math.PI / 2;
    drum(0.18, 0.14, -0.42, 0.62, 0.42, 0.08, 38, "SNARE");
    drum(0.14, 0.16, -0.2, 0.86, -0.02, 0.38, 50, "HIGH TOM");
    drum(0.16, 0.18, 0.22, 0.84, -0.02, 0.38, 45, "LOW TOM");
    drum(0.21, 0.36, 0.56, 0.5, 0.36, 0.05, 45, "FLOOR TOM");
    const cymbal = (radius, px, py, pz, pitch, name, tilt = 0.14) => {
      this.cyl(0.008, py, px, py / 2, pz, m.chrome, g, 6);
      const c = this.mesh(new THREE.ConeGeometry(radius, radius * 0.1, 30, 1, true), brass, px, py + 0.02, pz, g);
      c.rotation.set(tilt, 0, tilt * 0.6);
      c.castShadow = true;
      hit(c, pitch, name);
      a.swaying.push({ object: c, phase: px, amount: 0.004, cymbal: true, base: c.rotation.clone() });
      return c;
    };
    cymbal(0.17, -0.74, 0.86, 0.3, 42, "HI-HAT", 0.02);
    cymbal(0.165, -0.74, 0.895, 0.3, 46, "OPEN HAT", -0.02).visible = false;
    cymbal(0.24, -0.5, 1.28, -0.34, 49, "CRASH");
    cymbal(0.27, 0.62, 1.22, -0.2, 51, "RIDE", -0.12);
    this.cyl(0.17, 0.05, 0, 0.47, 0.72, m.leather, g, 20);
    this.cyl(0.015, 0.45, 0, 0.23, 0.72, m.chrome, g, 8);
    this.solid(x, z, 1.9, 1.5, 0.2);
    a.contact(x, z, 2.8, 2.6, this.g);
    return g;
  }
  /** Studio microphone on a stand, with a pop filter. */
  microphone(x, z, { h = 1.55, rotation = 0, room = null } = {}) {
    const { m, a } = this, g = this.group(x, 0, z, rotation);
    this.cyl(0.18, 0.02, 0, 0.01, 0, m.black, g, 20);
    this.cyl(0.011, h, 0, h / 2, 0, m.chrome, g, 8);
    const body = this.cyl(0.03, 0.17, 0, h + 0.06, 0.02, m.metal, g, 16);
    this.cyl(0.031, 0.07, 0, h + 0.18, 0.02, m.dark, g, 16);
    const ring = this.mesh(new THREE.TorusGeometry(0.075, 0.006, 6, 28), m.black, 0, h + 0.13, 0.13, g);
    this.cyl(0.07, 0.003, 0, h + 0.13, 0.13, m.smoked, g, 24).rotation.x = Math.PI / 2;
    if (room) a.action(body, { type: "tool", room });
    a.contact(x, z, 0.8, 0.8, this.g);
    return g;
  }
}
