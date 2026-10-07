import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { materials, textTexture, worldUV, palette, fonts, liveTexture, liveMaterial } from "./materials.js";
import { dress } from "./rooms.js";
import { rooms, roomAt, roomById, pit, seeded } from "./layout.js";

/**
 * The house itself: one continuous structure, its doors, its displays and the
 * walkable ground. Everything decorative is merged by room and material; only
 * things that move or respond stay as separate objects.
 */
export class Architecture {
  constructor(scene) {
    this.scene = scene;
    this.world = null;
    this.m = materials();
    this.walls = [];
    this.furniture = [];
    this.roomLights = [];
    this.interactive = [];
    this.doors = [];
    this.roomGroups = new Map();
    this.screens = [];
    this.pads = [];
    this.cones = [];
    this.spinners = [];
    this.lamps = [];
    this.rugs = [];
    this.seats = [];
    this.clocks = [];
    this.swaying = [];
    this.pools = [];
    this.redraws = [];
    this.dynamic = new Set();
    this.roomExtras = new Map(rooms.map((r) => [r.id, []]));
    // Indicator lamps share three materials that wink on their own clocks; hundreds of LEDs cost three draw calls.
    this.blink = [0, 1, 2].map((i) => { const mat = new THREE.MeshBasicMaterial({ color: i === 1 ? "#ffb37a" : palette.ember, toneMapped: false }); mat.userData.base = mat.color.clone(); mat.userData.rate = 0.7 + i * 0.9; mat.userData.phase = i * 2.1; return mat; });
    this.buildShell();
    for (const r of rooms) {
      const g = new THREE.Group();
      g.name = r.id;
      g.position.set(r.x, 0, r.z);
      scene.add(g);
      this.roomGroups.set(r.id, g);
      this.roomLight(g, r);
      dress(this, g, r);
    }
    this.buildLandscape();
    this.batchStatic();
  }
  // ——— Construction helpers ———
  box(w, h, d, x, y, z, mat, parent = this.scene, solid = false) {
    const geo = mat.map ? worldUV(new THREE.BoxGeometry(w, h, d), w, h, d) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = !mat.transparent && !mat.isMeshBasicMaterial;
    mesh.receiveShadow = !mat.isMeshBasicMaterial;
    parent.add(mesh);
    if (solid) this.block(mesh, w, d, 0.34, h);
    return mesh;
  }
  /** Upholstery: the only place edges are softened. */
  cushion(w, h, d, x, y, z, mat, parent = this.scene) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.07, w / 5, h / 3, d / 5)), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  /** Many identical, individually usable parts (piano keys, step pads) in one draw call. */
  instanced(geometry, material, items, parent = this.scene) {
    if (!material.userData.instancedOnly) { material = material.clone(); material.userData.instancedOnly = true; }
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    items.forEach((item, i) => { item.index = i; item.mesh = mesh; mesh.setMatrixAt(i, item.matrix); });
    mesh.userData.instances = items;
    mesh.castShadow = !material.isMeshBasicMaterial;
    mesh.receiveShadow = !material.isMeshBasicMaterial;
    parent.add(mesh);
    if (items.some((item) => item.use || item.action)) this.interactive.push(mesh);
    this.dynamic.add(mesh);
    return mesh;
  }
  mesh(geo, mat, x, y, z, parent = this.scene) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = !mat.transparent && !mat.isMeshBasicMaterial;
    mesh.receiveShadow = !mat.isMeshBasicMaterial;
    parent.add(mesh);
    return mesh;
  }
  /** Marks a footprint the body cannot enter. `pad` is the body's clearance. */
  block(object, w, d, pad = 0.3, height = 1) {
    const p = new THREE.Vector3();
    object.getWorldPosition(p);
    const entry = { minX: p.x - w / 2 - pad, maxX: p.x + w / 2 + pad, minZ: p.z - d / 2 - pad, maxZ: p.z + d / 2 + pad, height };
    (height > 3 ? this.walls : this.furniture).push(entry);
    return entry;
  }
  /** World-space footprint for furniture placed in a room group. */
  solid(parent, x, z, w, d, pad = 0.3) {
    const p = parent.localToWorld(new THREE.Vector3(x, 0, z));
    this.furniture.push({ minX: p.x - w / 2 - pad, maxX: p.x + w / 2 + pad, minZ: p.z - d / 2 - pad, maxZ: p.z + d / 2 + pad });
  }
  /** Keeps an object out of the static merge so it can move, light up or be used. */
  live(object) {
    this.dynamic.add(object);
    return object;
  }
  action(object, data) {
    object.userData.action = data;
    this.interactive.push(object);
    this.dynamic.add(object);
    return object;
  }
  /** A direct interaction with its own verb, label and behaviour. */
  usable(object, use) {
    object.userData.use = use;
    this.interactive.push(object);
    this.dynamic.add(object);
    return object;
  }
  rug(x, z, w, d, parent, mat = this.m.rug) {
    this.box(w, 0.018, d, x, 0.012, z, mat, parent).castShadow = false;
    const p = parent.localToWorld(new THREE.Vector3(x, 0, z));
    this.rugs.push({ minX: p.x - w / 2, maxX: p.x + w / 2, minZ: p.z - d / 2, maxZ: p.z + d / 2 });
  }
  /** A soft shadow under furniture: cheap grounding that works on every preset. */
  contact(x, z, w, d, parent, y = 0.024, strength = 1) {
    if (!this.contactMaterial) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d"), grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
      grad.addColorStop(0, "#0a0806c8");
      grad.addColorStop(0.6, "#0a080648");
      grad.addColorStop(1, "#0a080600");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      this.contactMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 });
      this.contactMaterial.userData.mergeable = true;
    }
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.contactMaterial);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, y, z);
    p.renderOrder = 1;
    p.userData.contact = strength;
    parent.add(p);
    return p;
  }
  /** One shared additive gradient: light falling down a wall from the cove above it. */
  washMaterial() {
    if (this.wash) return this.wash;
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 128;
    const ctx = c.getContext("2d"), grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.18, "#b0b0b0");
    grad.addColorStop(0.55, "#383838");
    grad.addColorStop(1, "#000000");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 8, 128);
    this.wash = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: "#ffb877", transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.wash.userData.mergeable = true;
    this.wash.userData.base = 0.34;
    return this.wash;
  }
  /** A pool of warm light on a surface beneath a lamp. Additive, so it reads as light rather than paint. */
  pool(x, y, z, size, parent, color = "#ffb26b", strength = 0.5) {
    if (!this.poolTexture) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d"), grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
      grad.addColorStop(0, "#ffffffff");
      grad.addColorStop(0.35, "#ffffff70");
      grad.addColorStop(1, "#ffffff00");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      this.poolTexture = new THREE.CanvasTexture(c);
    }
    const material = new THREE.MeshBasicMaterial({ map: this.poolTexture, color, transparent: true, opacity: strength, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, y, z);
    p.renderOrder = 2;
    parent.add(p);
    const entry = { mesh: p, material, base: strength };
    this.pools.push(entry);
    return entry;
  }
  /** Lettering in the world. `glow` makes it read as projected light on the surface behind it. */
  type(text, { x = 0, y = 0, z = 0, width = 4, height = null, rotation = 0, tilt = 0, parent = this.scene, style = "display", size = 150, color = palette.bone, glow = false, opacity = 1, sub = "", align = "center", canvasWidth = 1024, canvasHeight = 256, weight = null } = {}) {
    const options = { width: canvasWidth, height: canvasHeight, color, sub, size, style, align, weight };
    const material = new THREE.MeshBasicMaterial({ map: textTexture(text, options), transparent: true, depthWrite: false, opacity, toneMapped: !glow, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -3 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height ?? (width * canvasHeight) / canvasWidth), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    mesh.rotation.x = tilt;
    mesh.renderOrder = 3;
    parent.add(mesh);
    this.redraws.push(() => { material.map.dispose(); material.map = textTexture(text, options); });
    return mesh;
  }
  sign(text, x, y, z, width = 5, sub = "", parent = this.scene, rotation = 0) {
    return this.type(text, { x, y, z, width, sub, parent, rotation, style: "mono", size: 44, canvasHeight: 256 });
  }
  /** A canvas-backed display. `draw` is supplied by the screen painter in the world layer. */
  screen(g, x, y, z, w, h, type, rotation = 0, { frame = true, resolution = 1024 } = {}) {
    const c = document.createElement("canvas");
    c.width = resolution;
    c.height = Math.round((resolution * h) / w / 2) * 2;
    c.getContext("2d", { willReadFrequently: true });
    const texture = liveTexture(c);
    texture.anisotropy = 8;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    g.add(group);
    if (frame) this.box(w + 0.07, h + 0.07, 0.05, 0, 0, -0.012, this.m.black, group);
    const material = liveMaterial(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.z = 0.016;
    group.add(mesh);
    const screen = { canvas: c, texture, mesh, material, type, room: g.name, group, w, h, dirty: true };
    this.screens.push(screen);
    return screen;
  }
  artFrame(g, x, y, z, w, h, rotation = 0, resolution = 512) {
    const frame = new THREE.Group();
    frame.position.set(x, y, z);
    frame.rotation.y = rotation;
    g.add(frame);
    this.box(w + 0.06, h + 0.06, 0.05, 0, 0, 0, this.m.walnut, frame);
    const canvas = document.createElement("canvas");
    canvas.width = resolution;
    canvas.height = Math.round((resolution * h) / w);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }));
    art.position.z = 0.028;
    art.receiveShadow = true;
    frame.add(art);
    this.live(art);
    return { canvas, texture, art, frame };
  }
  // ——— Shell ———
  buildShell() {
    const m = this.m, band = pit.tread * pit.treads;
    const hole = { minX: pit.minX, maxX: pit.maxX + band, minZ: pit.minZ - band, maxZ: pit.maxZ };
    this.box(65, 0.4, 65, 0, -0.8, 0, m.dark);
    this.box(70, 0.1, 70, 0, -0.85, 0, m.water); // reflective perimeter pool
    // The floor is cast around the sunken lounge.
    const slab = (x0, x1, z0, z1) => this.box(x1 - x0, 0.6, z1 - z0, (x0 + x1) / 2, -0.3, (z0 + z1) / 2, m.floor);
    slab(-31, hole.minX, -31, 31);
    slab(hole.maxX, 31, -31, 31);
    slab(hole.minX, hole.maxX, -31, hole.minZ);
    slab(hole.minX, hole.maxX, hole.maxZ, 31);
    const pitFloor = this.box(pit.maxX - pit.minX, 0.15, pit.maxZ - pit.minZ, (pit.minX + pit.maxX) / 2, -pit.depth - 0.075, (pit.minZ + pit.maxZ) / 2, m.walnut);
    pitFloor.castShadow = false;
    const rise = pit.depth / (pit.treads + 1);
    for (let k = 1; k <= pit.treads; k++) {
      const top = -pit.depth + k * rise, outer = k * pit.tread, inner = (k - 1) * pit.tread, h = top + 0.6;
      // North run, then the east run that meets it at the corner.
      this.box(pit.maxX + outer - pit.minX, h, pit.tread, (pit.minX + pit.maxX + outer) / 2, top - h / 2, pit.minZ - inner - pit.tread / 2, m.walnut);
      this.box(pit.tread, h, pit.maxZ - pit.minZ + inner, pit.maxX + inner + pit.tread / 2, top - h / 2, (pit.minZ - inner + pit.maxZ) / 2, m.walnut);
      // A line of light tucked under each nosing.
      this.box(pit.maxX + inner - pit.minX, 0.012, 0.012, (pit.minX + pit.maxX + inner) / 2, top - rise + 0.02, pit.minZ - inner - 0.006, m.light);
      this.box(0.012, 0.012, pit.maxZ - pit.minZ + inner, pit.maxX + inner + 0.006, top - rise + 0.02, (pit.minZ - inner + pit.maxZ) / 2, m.light);
    }
    // Walnut lining and a ledge behind the built-in seating.
    this.box(0.05, pit.depth, pit.maxZ - pit.minZ, pit.minX + 0.025, -pit.depth / 2, (pit.minZ + pit.maxZ) / 2, m.walnut);
    this.box(pit.maxX - pit.minX, pit.depth, 0.05, (pit.minX + pit.maxX) / 2, -pit.depth / 2, pit.maxZ - 0.025, m.walnut);
    this.box(0.42, 0.34, pit.maxZ - hole.minZ + 0.42, pit.minX - 0.21, 0.17, (hole.minZ + pit.maxZ + 0.42) / 2, m.walnut);
    this.box(hole.maxX - pit.minX, 0.34, 0.42, (pit.minX + hole.maxX) / 2, 0.17, pit.maxZ + 0.21, m.walnut);
    this.furniture.push(
      { minX: pit.minX - 0.72, maxX: pit.minX + 0.08, minZ: hole.minZ - 0.3, maxZ: pit.maxZ + 0.72 },
      { minX: pit.minX - 0.72, maxX: hole.maxX + 0.3, minZ: pit.maxZ - 0.08, maxZ: pit.maxZ + 0.72 },
    );
    this.rugs.push({ minX: pit.minX, maxX: pit.maxX, minZ: pit.minZ, maxZ: pit.maxZ });
    this.box(6, 0.18, 9, 0, -0.08, 34, m.floor);
    // Interior partitions with a generous opening at the centre of each.
    const partition = (w, d, x, z) => { const wall = this.box(w, 6.4, d, x, 3.2, z, m.wall, this.scene, true); return wall; };
    for (const x of [-9, 9])
      for (const z of [-20, 0, 20]) {
        const half = z === 0 ? 9 : 11;
        for (const side of [-1, 1]) partition(0.35, half - 2, x, z + (side * (half + 2)) / 2);
        this.box(0.45, 1.5, 4.4, x, 5.65, z, m.wall);
        this.portal(x, z, "x");
      }
    for (const z of [-9, 9])
      for (const x of [-20, 0, 20]) {
        const half = x === 0 ? 9 : 11;
        for (const side of [-1, 1]) partition(half - 2, 0.35, x + (side * (half + 2)) / 2, z);
        this.box(4.4, 1.5, 0.45, x, 5.65, z, m.wall);
        this.portal(x, z, "z");
      }
    // Deep structural fins frame the outside glass, with one generous entrance.
    for (const x of [-31, 31]) {
      this.box(0.3, 6.4, 62, x, 3.2, 0, m.glass);
      for (let z = -31; z <= 31; z += 7.75) this.box(0.35, 6.4, 0.5, x, 3.2, z, m.concrete);
      this.walls.push({ minX: x - 0.4, maxX: x + 0.4, minZ: -31, maxZ: 31, height: 6.4, glass: true });
    }
    this.box(62, 6.4, 0.25, 0, 3.2, -31, m.glass);
    this.walls.push({ minX: -31, maxX: 31, minZ: -31.4, maxZ: -30.6, height: 6.4, glass: true });
    for (const x of [-31, -24, -17, -9, 9, 17, 24, 31]) this.box(0.5, 6.4, 0.4, x, 3.2, -31, m.concrete);
    this.entrance = [];
    for (const side of [-1, 1]) {
      this.box(28, 6.4, 0.3, side * 17, 3.2, 31, m.concrete, this.scene, true);
      const leaf = this.box(2.65, 4.7, 0.09, side * 1.35, 2.35, 31, m.walnut);
      leaf.userData.entranceSide = side;
      this.box(0.03, 1.5, 0.06, -side * 1.12, 0, 0.07, m.bronze, leaf);
      this.live(leaf);
      this.entrance.push(leaf);
    }
    this.box(6, 1.7, 0.5, 0, 5.55, 31, m.concrete);
    this.type("AURA", { x: 0, y: 5.5, z: 31.27, width: 3.2, style: "display", size: 190, color: "#fff1dc", glow: true, opacity: 0.9 });
    this.box(6, 0.05, 0.05, 0, 0.03, 31, m.light);
    // Individual roofs, skylights and a line of light where wall meets ceiling.
    for (const r of rooms) {
      if (r.id === "terrace") continue;
      const w = r.col === 1 ? 18 : 22, d = r.row === 1 ? 18 : 22, y = r.id === "living" ? 7.5 : 6.4;
      const sw = r.id === "living" ? 11 : 7, sd = r.id === "living" ? 11 : 6;
      for (const side of [-1, 1]) {
        this.box((w - sw) / 2, 0.22, d, r.x + (side * (w + sw)) / 4, y, r.z, m.ceiling);
        this.box(sw, 0.22, (d - sd) / 2, r.x, y, r.z + (side * (d + sd)) / 4, m.ceiling);
        this.box(0.075, 0.12, sd + 0.1, r.x + (side * sw) / 2, y - 0.1, r.z, m.bronze);
        this.box(sw, 0.12, 0.075, r.x, y - 0.1, r.z + (side * sd) / 2, m.bronze);
      }
      this.box(sw, 0.02, sd, r.x, y - 0.08, r.z, m.glass).castShadow = false;
      for (const sx of [-1, 1]) {
        this.box(w - 0.8, 0.04, 0.08, r.x, y - 0.3, r.z + sx * (d / 2 - 0.6), m.light);
        const wash = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.8, 3.4), this.washMaterial());
        wash.position.set(r.x, y - 2.02, r.z + sx * (d / 2 - (Math.abs(r.z + sx * (d / 2)) > 30 ? 0.36 : 0.19)));
        wash.rotation.y = sx > 0 ? Math.PI : 0;
        wash.renderOrder = 2;
        this.scene.add(wash);
      }
    }
    // The living room's raised roof sits on four exposed columns.
    for (const x of [-7.6, 7.6])
      for (const z of [-7.6, 7.6]) {
        this.box(0.52, 7.5, 0.52, x, 3.75, z, m.concrete);
        this.box(0.8, 0.1, 0.8, x, 0.03, z, m.bronze);
        this.furniture.push({ minX: x - 0.55, maxX: x + 0.55, minZ: z - 0.55, maxZ: z + 0.55 });
      }
  }
  portal(x, z, axis) {
    const m = this.m, g = new THREE.Group();
    g.position.set(x, 0, z);
    if (axis === "x") g.rotation.y = Math.PI / 2;
    this.scene.add(g);
    this.box(0.055, 4.7, 0.14, -2.15, 2.35, 0, m.bronze, g);
    this.box(0.055, 4.7, 0.14, 2.15, 2.35, 0, m.bronze, g);
    this.box(4.35, 0.07, 0.13, 0, 4.7, 0, m.bronze, g);
    if (!this.doorGlass) { this.doorGlass = m.glass.clone(); this.doorGlass.opacity = 0.24; }
    const panels = [-1, 1].map((side) => {
      const panel = this.box(2.08, 4.64, 0.045, side * 1.04, 2.32, 0, this.doorGlass, g);
      panel.userData.side = side;
      this.box(0.02, 0.9, 0.06, -side * 0.86, -0.2, 0.05, m.bronze, panel);
      this.live(panel);
      return panel;
    });
    this.doors.push({ group: g, panels, x, z, open: 0, velocity: 0, state: 0 });
    this.box(4.2, 0.02, 0.045, 0, 0.012, 0, m.bronze, g);
    // Wayfinding: a small plate beside each opening names the room beyond it.
    const beyond = axis === "x" ? [roomAt(x - 2, z), roomAt(x + 2, z)] : [roomAt(x, z - 2), roomAt(x, z + 2)];
    beyond.forEach((room, i) => {
      const facing = i === 0 ? 1 : -1; // plate i faces the visitor standing on the other side
      const plate = this.type(`${room.number}  ${room.name.toUpperCase()}`, { x: 2.75, y: 1.52, z: facing * 0.2, width: 0.86, style: "mono", size: 74, color: "#d8ccb8", canvasWidth: 1024, canvasHeight: 150, parent: g, rotation: facing > 0 ? 0 : Math.PI });
      plate.material.opacity = 0.82;
      if (facing < 0) plate.position.x = -2.75;
    });
  }
  roomLight(g, r) {
    const light = new THREE.PointLight(r.accent, 1, 21, 1.7);
    light.position.set(0, r.id === "living" ? 5.6 : 4.9, 0);
    light.userData.base = r.id === "living" ? 34 : 26;
    g.add(light);
    this.roomLights.push(light);
  }
  buildLandscape() {
    const ground = this.box(900, 1, 900, 0, -2.1, 0, new THREE.MeshStandardMaterial({ color: "#7d6c55", roughness: 1 }));
    ground.receiveShadow = false;
    ground.castShadow = false;
    const random = seeded(103), near = new THREE.MeshStandardMaterial({ color: "#86735a", roughness: 1 }), far = new THREE.MeshStandardMaterial({ color: "#6f6351", roughness: 1 });
    for (let i = 0; i < 25; i++) {
      const dune = this.mesh(new THREE.SphereGeometry(1, 22, 10), i % 2 ? near : far, Math.cos(i) * 140, -7, Math.sin(i) * 150);
      dune.scale.set(40 + random() * 60, 7 + random() * 19, 35 + random() * 45);
      dune.castShadow = false;
      dune.receiveShadow = false;
    }
    // A distant range gives the horizon a silhouette at dusk.
    const ridge = new THREE.MeshBasicMaterial({ color: "#6f6a66", fog: true });
    this.ridgeMaterial = ridge;
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + random() * 0.2, radius = 300 + random() * 40;
      const peak = this.mesh(new THREE.ConeGeometry(50 + random() * 60, 26 + random() * 46, 5, 1), ridge, Math.cos(angle) * radius, 8 + random() * 6, Math.sin(angle) * radius);
      peak.rotation.y = random() * 3;
      peak.scale.z = 0.6;
      peak.castShadow = peak.receiveShadow = false;
    }
  }
  /** Merges everything that never moves, per room and material, into a handful of draw calls. */
  batchStatic() {
    this.scene.updateMatrixWorld(true);
    const batches = new Map();
    // Flat, matte surfaces of any colour collapse into one vertex-coloured material per room.
    this.paint ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || this.dynamic.has(o) || o.userData.use || o.userData.action || (o.material.transparent && !o.material.userData.mergeable) || o.material.isShaderMaterial || o.userData.keep) return;
      let parent = o.parent, room = "shell";
      while (parent) {
        if (this.dynamic.has(parent) || parent.userData.keep) return;
        if (this.roomGroups.has(parent.name)) room = parent.name;
        parent = parent.parent;
      }
      const painted = !!o.material.userData.paint;
      const key = room + "|" + (painted ? "paint" : o.material.uuid) + "|" + o.castShadow + "|" + o.receiveShadow;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(o);
    });
    for (const objects of batches.values()) {
      const painted = !!objects[0].material.userData.paint;
      if (objects.length < 2 && !painted) continue;
      const geometries = objects.map((o) => {
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
        if (painted) {
          const count = g.attributes.position.count, colors = new Float32Array(count * 3), c = o.material.color;
          for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
          g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
          if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        }
        g.applyMatrix4(o.matrixWorld);
        return g;
      });
      const merged = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, painted ? this.paint : objects[0].material);
      mesh.castShadow = objects[0].castShadow;
      mesh.receiveShadow = objects[0].receiveShadow;
      mesh.userData.merged = true;
      this.scene.add(mesh);
      for (const o of objects) {
        // Children of a merged mesh keep their place in the world.
        for (const child of [...o.children]) o.parent.attach(child);
        o.parent.remove(o);
        o.geometry.dispose();
      }
    }
  }
  /**
   * Fine detail — lamps, lettering, playable parts, furniture models — is only kept
   * for the room you are in and the rooms that open directly off it. The merged
   * structure of every room is always drawn, so nothing visibly pops through a doorway.
   */
  showRooms(current) {
    const here = roomById(current);
    for (const r of rooms) {
      const near = Math.abs(r.col - here.col) + Math.abs(r.row - here.row) <= 1;
      this.roomGroups.get(r.id).visible = near;
      for (const extra of this.roomExtras.get(r.id)) extra.visible = near;
    }
  }
  // ——— Ground ———
  groundHeight(x, z) {
    const band = pit.tread * pit.treads;
    if (x <= pit.minX || x >= pit.maxX + band || z >= pit.maxZ || z <= pit.minZ - band) return 0;
    const d = Math.max(pit.minZ - z, x - pit.maxX, 0);
    if (d <= 0) return -pit.depth;
    const k = Math.ceil(d / pit.tread);
    return k > pit.treads ? 0 : -pit.depth + k * (pit.depth / (pit.treads + 1));
  }
  softGround(x, z) {
    return this.rugs.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ);
  }
  canWalk(x, z) {
    if (x < -30.5 || x > 30.5 || z < -30.5 || z > 35.7) return false;
    if (z > 31.1 && Math.abs(x) > 2.55) return false;
    for (const b of this.walls) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return false;
    for (const b of this.furniture) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return false;
    return true;
  }
  // ——— Living behaviour ———
  updateDoors(position, dt, entranceOpen = null) {
    const sound = this.world?.sound;
    for (const d of this.doors) {
      const near = Math.hypot(position.x - d.x, position.z - d.z) < 4.2 ? 1 : 0;
      if (near !== d.state) {
        d.state = near;
        if (Math.hypot(position.x - d.x, position.z - d.z) < 9) sound?.door(!!near);
      }
      // A heavy glass leaf: it gathers speed, then settles against a soft stop.
      d.velocity += ((near - d.open) * 26 - d.velocity * 9.5) * dt;
      d.open = Math.max(0, Math.min(1.02, d.open + d.velocity * dt));
      for (const p of d.panels) p.position.x = p.userData.side * (1.04 + d.open * 1.98);
    }
    const open = entranceOpen ?? (position.z < 33.6 && position.z > 27.5 ? 1 : 0);
    if (this.entranceState !== open) {
      if (this.entranceState !== undefined) sound?.door(!!open);
      this.entranceState = open;
    }
    this.entranceVelocity = (this.entranceVelocity || 0) + ((open - (this.entranceOpen || 0)) * 14 - (this.entranceVelocity || 0) * 7) * dt;
    this.entranceOpen = Math.max(0, Math.min(1, (this.entranceOpen || 0) + this.entranceVelocity * dt));
    for (const p of this.entrance) p.position.x = p.userData.entranceSide * (1.35 + this.entranceOpen * 2.62);
  }
  /** Step lamps on the drum room's circular sequencer follow the real pattern. */
  updatePads(project, beat, playing) {
    if (!this.padLamps || !this.roomGroups.get("rhythm").visible) return;
    const t = project?.tracks.find((t) => t.instrument === "drums");
    const clip = t?.clips.find((c) => beat >= c.start && beat < c.start + c.length) || t?.clips[0];
    const now = playing ? Math.floor((((beat - (clip?.start || 0)) % 4) + 4) % 4 * 4) : -1;
    let changed = false;
    for (const pad of this.pads) {
      const on = !!clip?.notes.some((n) => n.pitch === pad.pitch && Math.abs(n.start - pad.step / 4) < 0.05), pulse = on && now === pad.step;
      const state = pulse ? 2 : on ? 1 : now === pad.step ? 3 : 0;
      if (pad.state === state) continue;
      pad.state = state;
      this.padLamps.setColorAt(pad.index, this.padColors[state]);
      changed = true;
    }
    if (changed) this.padLamps.instanceColor.needsUpdate = true;
  }
  exported() {
    if (this.exportSculpture) { this.exportSculpture.material.emissive = new THREE.Color(palette.ember); this.exportSculpture.material.emissiveIntensity = 0.45; }
  }
}
export { fonts };
