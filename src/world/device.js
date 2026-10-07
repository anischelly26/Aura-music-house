import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fonts, palette, liveTexture, liveMaterial } from "../house/materials.js";

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const shared = new Map();
const geometry = (key, make) => {
  if (!shared.has(key)) shared.set(key, make());
  return shared.get(key);
};
/** Bakes one flat colour into a geometry, so differently coloured parts can share a material and a draw call. */
const tint = (geo, color) => {
  const plain = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(color), count = plain.attributes.position.count, colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
  plain.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return plain;
};

/**
 * A physical instrument in the house. It owns a designed camera view, a set of
 * tactile controls bound to the real project, and nothing else: no audio graph,
 * no private state that the editors cannot see.
 */
export class Device {
  constructor(world, { name, label, verb = "USE", room, parent, position, rotation = 0, view, range = 4.2 }) {
    this.w = world;
    this.a = world.architecture;
    this.m = this.a.m;
    this.s = world.studio;
    this.name = name;
    this.label = label;
    this.room = room;
    this.range = range;
    this.group = new THREE.Group();
    this.group.name = name;
    this.group.position.set(...position);
    this.group.rotation.y = rotation;
    (parent || world.scene).add(this.group);
    this.viewLocal = view;
    this.controls = [];
    this.springs = [];
    this.refreshers = [];
    this.entry = { verb, label: () => (typeof this.label === "function" ? this.label() : this.label), run: () => this.enter(), device: this, range };
    world.devices.push(this);
  }
  get view() {
    this.group.updateWorldMatrix(true, false);
    const v = this.viewLocal;
    return { position: this.group.localToWorld(new THREE.Vector3(...v.position)), target: this.group.localToWorld(new THREE.Vector3(...v.target)), fov: v.fov || 44 };
  }
  get focused() {
    return this.w.interaction.focused === this;
  }
  /** One vertex-coloured material for every knob and fader cap in the house. */
  get paint() {
    return (this.a.controlPaint ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.25 }));
  }
  /** Marks something that moves or changes, so it is left out of the device's static merge. */
  live(object) {
    object.userData.live = true;
    return object;
  }
  /**
   * Merges everything on the instrument that never moves — casework, skirts, slots —
   * into one mesh per material. Controls, moving assemblies and the body stay separate.
   */
  bake(within = null) {
    // Given a moving assembly (a platter, a tonearm), its own fixed parts are merged inside it.
    const top = within || this.group;
    top.updateWorldMatrix(true, true);
    const batches = new Map(), inverse = new THREE.Matrix4(), relative = new THREE.Matrix4();
    top.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent || o.children.length || o.userData.use || o.userData.merged) return;
      let root = top;
      for (let parent = o.parent; parent && parent !== top; parent = parent.parent) { if (parent.userData.live) return; if (parent === this.detail) root = this.detail; }
      if (o.userData.live || this.springs.some((s) => s.mesh === o)) return;
      const key = root.uuid + "|" + o.material.uuid + "|" + o.castShadow;
      if (!batches.has(key)) batches.set(key, { root, items: [] });
      batches.get(key).items.push(o);
    });
    for (const { root, items } of batches.values()) {
      if (items.length < 2) continue;
      inverse.copy(root.matrixWorld).invert();
      const parts = items.map((o) => {
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
        g.applyMatrix4(relative.multiplyMatrices(inverse, o.matrixWorld));
        return g;
      });
      const merged = mergeGeometries(parts);
      parts.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, items[0].material);
      mesh.castShadow = items[0].castShadow;
      mesh.receiveShadow = true;
      mesh.userData.merged = true;
      root.add(mesh);
      for (const o of items) { o.parent.remove(o); o.geometry.dispose(); }
    }
  }
  enter() {
    this.w.focus(this);
  }
  leave() {
    if (this.focused) this.w.blur();
  }
  onEnter() {}
  onExit() {}
  /** Announces a physical action, so AURA's lessons can respond to what the hands do. */
  emit(control, value) {
    this.w.events.dispatchEvent(new CustomEvent("control", { detail: { device: this.name, control: typeof control === "function" ? control() : control, value } }));
  }
  add(mesh, x = 0, y = 0, z = 0, parent = this.group) {
    mesh.position.set(x, y, z);
    mesh.castShadow = !mesh.material.transparent;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  box(w, h, d, x, y, z, material, parent = this.group, radius = 0) {
    const geo = radius ? new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2.01, h / 2.01, d / 2.01)) : new THREE.BoxGeometry(w, h, d);
    return this.add(new THREE.Mesh(geo, material), x, y, z, parent);
  }
  cylinder(radius, height, x, y, z, material, parent = this.group, segments = 24, radiusBottom = radius) {
    return this.add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radiusBottom, height, segments), material), x, y, z, parent);
  }
  /** Registers a mesh with the interaction system. */
  usable(mesh, use) {
    use.device = this;
    mesh.userData.use = use;
    this.a.interactive.push(mesh);
    this.controls.push(mesh);
    return mesh;
  }
  /** The instrument's body: aiming at it offers the focus view. */
  body(mesh) {
    this.entry.outline = mesh;
    mesh.userData.use = this.entry;
    this.a.interactive.push(mesh);
    return mesh;
  }
  /** Silk-screened lettering for a whole faceplate in one texture. `draw(ctx, w, h)` paints it. */
  faceplate(width, depth, x, y, z, draw, { resolution = 1024, parent = this.group, emissive = false, rotationX = -Math.PI / 2 } = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = resolution;
    canvas.height = Math.max(64, Math.round((resolution * depth) / width));
    const texture = liveTexture(canvas);
    texture.anisotropy = 8;
    const material = liveMaterial(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: !emissive, polygonOffset: true, polygonOffsetFactor: -2 }));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.rotation.x = rotationX;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 2;
    parent.add(mesh);
    const plate = {
      canvas, texture, mesh,
      redraw: () => {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        draw(ctx, canvas.width, canvas.height, plate);
        texture.needsUpdate = true;
      },
      // Metres on the plate → pixels on the canvas.
      px: (metres) => (metres / width) * canvas.width,
    };
    plate.redraw();
    this.w.whenFontsReady(plate.redraw);
    return plate;
  }
  static ink(ctx, size = 16, color = "#d9cfbd", style = "mono", weight = 500) {
    ctx.font = `${weight} ${size}px ${fonts[style]}`;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = style === "mono" ? size * 0.12 + "px" : "0px";
  }
  /** Rotary control. `get`/`set` work in 0–1; `done` commits once the hand lets go. */
  knob({ x, y, z, radius = 0.017, height = 0.02, label, get, set, done, parent = this.group, material = this.m.black, detents = 0 }) {
    const body = material === this.m.metal ? "#a7a39a" : "#161413";
    const shape = geometry(`knob|${radius}|${height}|${body}`, () => {
      const cap = tint(new THREE.CylinderGeometry(radius, radius * 1.12, height, 20), body), pointer = tint(new THREE.BoxGeometry(0.0024, 0.002, radius * 0.8), "#f4ead8");
      pointer.translate(0, height / 2 + 0.0008, -radius * 0.5);
      return mergeGeometries([cap, pointer]);
    });
    const knob = this.add(new THREE.Mesh(shape, this.paint), x, y + height / 2, z, parent);
    const skirt = this.cylinder(radius * 1.32, 0.003, x, y + 0.0015, z, this.m.metal, parent, 20);
    skirt.castShadow = false;
    let start = 0, value = get();
    const show = () => { knob.rotation.y = -(value - 0.5) * Math.PI * 1.5; };
    show();
    this.refreshers.push(() => { if (this.w.interaction.active?.object !== knob) { value = get(); show(); } });
    this.usable(knob, {
      verb: "TURN", label, focusOnly: true, cursor: "ns-resize",
      press: () => { start = value = get(); },
      drag: ({ dy, event }) => {
        let next = clamp(start - dy * (event.shiftKey ? 0.0012 : 0.0045));
        if (detents) next = Math.round(next * detents) / detents;
        if (next === value) return;
        value = next;
        show();
        set(value);
        this.w.sound.knob();
      },
      end: () => { done?.(value); this.emit(label, value); },
    });
    return knob;
  }
  /** Linear fader travelling along local z; follows the cursor on the faceplate, not screen pixels. */
  fader({ x, y, z, travel = 0.09, label, get, set, done, parent = this.group, cap = this.m.ivory, width = 0.016 }) {
    this.box(0.004, 0.002, travel + 0.012, x, y + 0.001, z, this.m.dark, parent).castShadow = false;
    const colour = cap === this.m.bronze ? "#b08d57" : "#ebe3d2";
    const shape = geometry(`fader|${width}|${colour}`, () => {
      const block = tint(new THREE.BoxGeometry(width, 0.014, 0.026), colour), line = tint(new THREE.BoxGeometry(width * 1.02, 0.0014, 0.0024), "#ff5a26");
      line.translate(0, 0.0074, 0);
      return mergeGeometries([block, line]);
    });
    const handle = this.add(new THREE.Mesh(shape, this.paint), x, y + 0.008, z, parent);
    let value = get();
    const plane = new THREE.Plane(), normal = new THREE.Vector3(), point = new THREE.Vector3(), local = new THREE.Vector3();
    let grab = 0;
    const show = () => { handle.position.z = z + (0.5 - value) * travel; };
    show();
    this.refreshers.push(() => { if (this.w.interaction.active?.object !== handle) { value = get(); show(); } });
    const locate = (ray) => {
      parent.updateWorldMatrix(true, false);
      normal.set(0, 1, 0).transformDirection(parent.matrixWorld);
      plane.setFromNormalAndCoplanarPoint(normal, parent.localToWorld(local.set(x, y + 0.008, z)));
      return ray.intersectPlane(plane, point) ? parent.worldToLocal(point).z : null;
    };
    this.usable(handle, {
      verb: "MOVE", label, focusOnly: true, cursor: "ns-resize",
      press: (hit) => { const at = locate(this.w.interaction.raycaster.ray); grab = at === null ? 0 : at - handle.position.z; value = get(); },
      drag: ({ ray }) => {
        const at = locate(ray);
        if (at === null) return;
        const next = clamp(0.5 - (at - grab - z) / travel);
        if (Math.abs(next - value) < 0.002) return;
        value = next;
        show();
        set(value);
        this.w.sound.fader();
      },
      end: () => { done?.(value); this.emit(label, value); },
    });
    return handle;
  }
  /** Momentary or latching button with an optional lamp. */
  button({ x, y, z, w = 0.022, d = 0.014, h = 0.008, label, verb = "PRESS", press, lit = null, parent = this.group, material = this.m.dark, glow = this.m.ember, round = false }) {
    const cap = round ? this.cylinder(w / 2, h, x, y + h / 2, z, material, parent, 20) : this.box(w, h, d, x, y + h / 2, z, material, parent, 0.002);
    const spring = { mesh: cap, rest: y + h / 2, depth: h * 0.45, value: 0, target: 0 };
    this.springs.push(spring);
    if (lit) this.refreshers.push(() => { const on = !!lit(); if (cap.userData.lit !== on) { cap.userData.lit = on; cap.material = on ? glow : material; } });
    this.usable(cap, {
      verb, label, focusOnly: true, cursor: "pointer",
      press: () => { spring.target = 1; this.w.sound.press(); },
      release: () => { spring.target = 0; this.w.sound.release(); },
      run: () => { press(); this.emit(typeof label === "function" ? label() : label, true); this.refresh(); },
    });
    return cap;
  }
  /** Velocity-sensitive rubber pad: harder toward the centre, with a fading lamp. */
  pad({ x, y, z, size = 0.036, h = 0.007, label, hit, parent = this.group, color = "#ff8a4c", direct = true }) {
    const material = new THREE.MeshStandardMaterial({ color: "#3a3531", roughness: 0.82, emissive: new THREE.Color(color), emissiveIntensity: 0 });
    const pad = this.add(new THREE.Mesh(geometry("pad" + size + h, () => new RoundedBoxGeometry(size, h, size, 2, 0.0035)), material), x, y + h / 2, z, parent);
    const spring = { mesh: pad, rest: y + h / 2, depth: h * 0.4, value: 0, target: 0, glow: 0, material };
    this.springs.push(spring);
    const local = new THREE.Vector3();
    this.usable(pad, {
      verb: "HIT", key: "CLICK", label, direct, range: 2.6, cursor: "pointer",
      press: (found) => {
        let velocity = 0.8;
        if (found?.point) { pad.worldToLocal(local.copy(found.point)); velocity = clamp(1 - Math.hypot(local.x, local.z) / (size * 0.7), 0.35, 1); }
        spring.target = 1;
        spring.glow = velocity;
        hit(velocity);
        this.emit(typeof label === "function" ? label() : label, velocity);
      },
      release: () => { spring.target = 0; },
    });
    pad.userData.flash = (amount = 1) => { spring.glow = Math.max(spring.glow, amount); };
    pad.userData.spring = spring;
    return pad;
  }
  /** Pulls every control back in line with the project (after undo, a lesson, another editor). */
  refresh() {
    for (const fn of this.refreshers) fn();
  }
  update(dt) {
    for (const s of this.springs) {
      s.value += (s.target - s.value) * (1 - Math.exp(-dt * (s.target ? 55 : 22)));
      s.mesh.position.y = s.rest - s.value * s.depth;
      if (s.material) {
        s.glow *= Math.exp(-dt * 5.5);
        s.material.emissiveIntensity = s.glow * 1.6 + (s.hold || 0);
      }
    }
  }
}
export { clamp };
