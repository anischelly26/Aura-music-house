import * as THREE from "three";
import { noteName, presets, newProject } from "../project.js";

const $ = (s) => document.querySelector(s);
const drumNames = { 36: "KICK", 38: "SNARE", 42: "HAT" };

/** The older architectural objects describe themselves with a small action record. */
function legacyUse(w, action) {
  const s = w.studio, project = () => s.getProject();
  switch (action.type) {
    case "projects": return { verb: "OPEN", label: "YOUR PROJECTS", run: () => s.openHub() };
    case "new": return { verb: "BEGIN", label: "AN EMPTY PROJECT", run: async () => { await s.persist(); await s.selectProject(newProject(true)); w.goRoom("living"); } };
    case "tool": return { verb: "OPEN", label: w.toolLabel(action.room), run: () => w.openTool(action.room) };
    case "note": return {
      verb: "PLAY", key: "CLICK", label: noteName(action.pitch), range: 3.2, direct: true,
      press: async (hit, event, item) => {
        item.down = true;
        w.events.dispatchEvent(new CustomEvent("control", { detail: { device: "piano", control: "key", value: action.pitch } }));
        const voice = await s.engine.noteOn(w.keysTrack(), action.pitch, 0.72).catch((e) => s.toast(e.message));
        if (!voice) return;
        if (item.down) item.voice = voice;
        else voice.release();
      },
      release: (item) => { item.down = false; item.voice?.release(); item.voice = null; },
    };
    case "instrument": return { verb: "OPEN", label: (presets.find((p) => p.id === action.instrument)?.name || "INSTRUMENT").toUpperCase(), run: () => { s.setInstrument(action.instrument); w.production("instrument"); } };
    case "step": return { verb: "TOGGLE", key: "CLICK", label: `${drumNames[action.pitch]} · STEP ${String(action.step + 1).padStart(2, "0")}`, range: 4.5, direct: true, run: () => { s.toggleStep(action.step, action.pitch); w.events.dispatchEvent(new CustomEvent("control", { detail: { device: "circle", control: "step", value: action } })); } };
    case "track": return { verb: "SELECT", label: (project().tracks.find((t) => t.id === action.id)?.name || "TRACK").toUpperCase(), run: () => { s.select(action.id); w.production("living"); } };
    case "memory": return { verb: "OPEN", label: "KEPT VERSIONS", run: () => w.openMemory() };
    case "game": return { verb: "PLAY", label: "SUNDOWN RALLY", run: () => w.playConsole() };
    default: return { verb: "USE", label: "", run: () => {} };
  }
}

/**
 * One interaction language for the whole house: a quiet reticle, a thin edge on the
 * object in reach, and a two-word prompt. Roaming aims with the view; a focused
 * instrument is worked directly with the cursor.
 */
export class InteractionManager {
  constructor(world) {
    this.w = world;
    this.raycaster = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.target = null;
    this.instance = -1;
    this.item = null;
    this.hit = null;
    this.use = null;
    this.active = null;
    this.focused = null;
    this.frame = 0;
    this.box = new THREE.Box3();
    this.point = new THREE.Vector3();
    this.matrix = new THREE.Matrix4();
    this.edges = new WeakMap();
    this.outline = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#fff3df", transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.outline.matrixAutoUpdate = false;
    this.outline.frustumCulled = false;
    this.outline.renderOrder = 5;
    this.outline.visible = false;
    world.scene.add(this.outline);
    this.prompt = $("#prompt");
  }
  /** The record that describes a hit: the mesh's own data, or one instance's. */
  itemOf(object, instance) {
    return object.isInstancedMesh ? object.userData.instances[instance] : object.userData;
  }
  describe(item) {
    if (!item) return null;
    if (item.use) return item.use;
    if (!item.action) return null;
    // Rebuilt if the action record is replaced.
    if (item.described !== item.action) { item.described = item.action; item.legacy = legacyUse(this.w, item.action); }
    return item.legacy;
  }
  locked() {
    return document.pointerLockElement === this.w.canvas;
  }
  ray() {
    const w = this.w;
    this.raycaster.setFromCamera(this.locked() && !this.focused ? this.center : w.pointer, w.camera);
    return this.raycaster;
  }
  /** Finds what the visitor is aiming at, honouring reach, walls and the focused instrument. */
  scan() {
    const w = this.w;
    if (this.active) return;
    if (w.mode !== "house" || !w.entered || w.arrival || w.overlayOpen || w.phone?.up || (w.director.active && !w.director.holding)) return this.set(null);
    const ray = this.ray(), focused = this.focused;
    const hits = ray.intersectObjects(w.architecture.interactive, false);
    let found = null, use = null, item = null;
    for (const hit of hits) {
      if (!this.shown(hit.object) || hit.object.userData.disabled) continue;
      const candidate = this.itemOf(hit.object, hit.instanceId), u = this.describe(candidate);
      if (!u) continue;
      if (focused) { if (u.device !== focused || u === focused.entry) continue; }
      else if (u.focusOnly && !u.device) continue;
      const range = focused ? 14 : u.focusOnly ? u.device.range : u.range || 5.5;
      if (hit.distance > range) break;
      found = hit;
      item = candidate;
      // Out of focus, an instrument's small controls stand in for the instrument itself.
      use = !focused && u.focusOnly ? u.device.entry : u;
      break;
    }
    if (found && !focused) {
      for (const wall of w.architecture.walls) {
        if (wall.glass) continue;
        this.box.min.set(wall.minX + 0.3, 0, wall.minZ + 0.3);
        this.box.max.set(wall.maxX - 0.3, wall.height ?? 6.4, wall.maxZ - 0.3);
        if (this.box.min.x >= this.box.max.x || this.box.min.z >= this.box.max.z) continue;
        if (ray.ray.intersectBox(this.box, this.point) && this.point.distanceTo(w.camera.position) < found.distance - 0.25) { found = null; use = null; break; }
      }
    }
    this.set(found, use, item);
  }
  shown(object) {
    for (let o = object; o; o = o.parent) if (!o.visible) return false;
    return true;
  }
  set(hit, use = null, item = null) {
    const object = hit?.object || null, instance = hit?.instanceId ?? -1;
    this.hit = hit;
    if (object === this.target && use === this.use && instance === this.instance) return this.label();
    this.target = object;
    this.instance = instance;
    this.item = item;
    this.use = use;
    this.w.target = object;
    document.body.classList.toggle("aiming", !!object);
    if (!object) {
      this.outline.visible = false;
      this.prompt.classList.remove("visible");
      this.signature = "";
      if (this.focused) this.w.canvas.style.cursor = "";
      return;
    }
    this.shownObject = use.outline || object;
    let geometry = this.edges.get(this.shownObject.geometry);
    if (!geometry) { geometry = new THREE.EdgesGeometry(this.shownObject.geometry, 28); this.edges.set(this.shownObject.geometry, geometry); }
    this.outline.geometry = geometry;
    this.place();
    this.outline.visible = true;
    this.appear = 0;
    this.cursor();
    this.label();
    this.prompt.classList.add("visible");
    if (!this.focused) this.w.sound.tick();
  }
  /** Keeps the edge highlight on the object, including a single instance of an instanced part. */
  place() {
    const o = this.shownObject;
    o.updateWorldMatrix(true, false);
    if (o.isInstancedMesh && this.instance >= 0) { o.getMatrixAt(this.instance, this.matrix); this.outline.matrix.multiplyMatrices(o.matrixWorld, this.matrix); }
    else this.outline.matrix.copy(o.matrixWorld);
  }
  /** The cursor says what a press will do; a control whose meaning depends on where it is held says so as the hand moves. */
  cursor() {
    const use = this.use;
    if (use && this.focused) this.w.canvas.style.cursor = (typeof use.cursor === "function" ? use.cursor() : use.cursor) || "pointer";
  }
  label() {
    const use = this.use;
    if (!use) return;
    if (typeof use.cursor === "function") this.cursor();
    const named = use.key || (this.focused ? (use.drag ? "DRAG" : "CLICK") : "E"), key = this.w.touch && (named === "E" || named === "CLICK") ? "TAP" : named, text = typeof use.label === "function" ? use.label() : use.label, verb = typeof use.verb === "function" ? use.verb() : use.verb, signature = key + verb + text;
    if (signature === this.signature) return;
    this.signature = signature;
    $("#promptKey").textContent = key;
    $("#promptVerb").textContent = verb;
    $("#promptLabel").textContent = text || "";
  }
  update(dt) {
    if (++this.frame % 2 === 0) this.scan();
    if (!this.outline.visible) return;
    this.appear = Math.min(1, (this.appear || 0) + dt * 7);
    this.place();
    this.outline.material.opacity = this.appear * (this.focused ? 0.5 : 0.85);
  }
  fail(e) {
    this.w.studio.toast(e.message || "That could not be done.");
    console.error(e);
  }
  /** E, or a click while roaming. */
  async interact() {
    this.scan();
    const use = this.use, object = this.target, item = this.item, hit = this.hit;
    if (!use) return false;
    try {
      if (use.run) await use.run({ hit, object, item });
      else if (use.press) { await use.press(hit, null, item); setTimeout(() => use.release?.(item), 240); }
    } catch (e) {
      this.fail(e);
    }
    return true;
  }
  /** Pointer down on the world. Returns true when an object took it. */
  down(event) {
    this.scan();
    const use = this.use, object = this.target;
    if (!use) return false;
    if (!this.focused && !use.direct && !use.device) return false;
    this.active = { use, object, item: this.item, x: event.clientX, y: event.clientY, hit: this.hit, moved: 0 };
    try {
      const result = use.press?.(this.hit, event, this.item);
      result?.catch?.((e) => this.fail(e));
    } catch (e) {
      this.fail(e);
    }
    return true;
  }
  move(event) {
    const a = this.active;
    if (!a) return false;
    const dx = event.clientX - a.x, dy = event.clientY - a.y;
    a.moved = Math.max(a.moved, Math.abs(dx) + Math.abs(dy));
    if (a.use.drag) a.use.drag({ dx, dy, event, ray: this.ray().ray, object: a.object, item: a.item, start: a.hit });
    return true;
  }
  up(event) {
    const a = this.active;
    if (!a) return false;
    this.active = null;
    try {
      a.use.release?.(a.item, event);
      if (a.use.drag) a.use.end?.(a.item);
      if (a.moved < 6 && a.use.run) Promise.resolve(a.use.run({ hit: a.hit, object: a.object, item: a.item, event })).catch((e) => this.fail(e));
    } catch (e) {
      this.fail(e);
    }
    return true;
  }
  cancel() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    a.use.release?.(a.item);
    a.use.end?.(a.item);
  }
}
