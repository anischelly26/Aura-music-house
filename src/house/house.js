import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { walkRoute } from "./navigation.js";
import { TouchNavigation } from "./touch-navigation.js";
import { Architecture } from "./architecture.js";
import { ModelAssets } from "./model-assets.js";
import { setAnisotropy } from "./materials.js";
import { rooms, roomById, roomAt, views } from "./layout.js";
import { makeTrack } from "../project.js";
import { foundationFromText } from "../foundation.js";
import { checkpoint, listMemories, download, portableProject } from "../storage.js";
import { PlayerController, EYE } from "../world/player.js";
import { CameraDirector } from "../world/camera.js";
import { InteractionManager } from "../world/interaction.js";
import { LightingManager } from "../world/lighting.js";
import { PerformanceManager, Finish } from "../world/quality.js";
import { ScreenPainter } from "../world/screens.js";
import { SoundDesign } from "../world/sound.js";
import { Arrival } from "../world/intro.js";
import { Hud } from "../world/hud.js";

const $ = (s) => document.querySelector(s);
const fmt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : "−∞");
const moveKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/**
 * The world manager. It assembles the house's systems — body, camera, interaction,
 * light, sound, displays — around the existing project and engine, and owns no
 * audio graph of its own.
 */
export class MusicHouse {
  constructor(studio, recording) {
    this.studio = studio;
    this.recording = recording;
    this.events = new EventTarget();
    this.mode = "house";
    this.currentRoom = "gallery";
    this.keys = new Set();
    this.pointer = new THREE.Vector2(0, 0);
    this.velocity = new THREE.Vector2();
    this.devices = [];
    this.memories = [];
    this.entered = false;
    this.listening = false;
    this.overlayOpen = false;
    this.fovOffset = 0;
    this.lastMetrics = 0;
    this.metrics = { peak: 0, rms: 0, tracks: new Map(), spectrum: new Uint8Array(0) };
    this.fontCallbacks = [];
    this.touch = matchMedia("(any-pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
    this.reduced = localStorage.getItem("aura-house-reduced") === "true" || matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.speed = Number(localStorage.getItem("aura-walk-speed")) || 3.1;
    this.sensitivity = Number(localStorage.getItem("aura-look-sensitivity")) || 0.0022;
    this.smoothing = Number(localStorage.getItem("aura-movement-smoothing")) || 10;
    this.fieldOfView = Number(localStorage.getItem("aura-fov")) || 62;
    this.canvas = $("#world");
    this.dialogs = [...document.querySelectorAll("dialog")];
    this.sound = new SoundDesign(studio.engine);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fieldOfView, innerWidth / innerHeight, 0.06, 450);
    this.camera.rotation.order = "YXZ";
    this.camera.position.set(0, 3.1, 70);
    this.lookAt(0, 2.9, 31);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.setClearColor("#0c0b0a", 1);
    } catch {
      this.renderer = null;
    }
    this.performance = new PerformanceManager(this.renderer, (soft) => this.applyQuality(soft));
    if (this.renderer) {
      const environment = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(this.renderer);
      this.environment = pmrem.fromScene(environment, 0.04).texture;
      environment.dispose();
      pmrem.dispose();
    }
    this.architecture = new Architecture(this.scene);
    this.architecture.world = this;
    this.player = new PlayerController(this);
    this.director = new CameraDirector(this);
    this.interaction = new InteractionManager(this);
    this.hud = new Hud(this);
    this.touchControls = new TouchNavigation(this);
    if (this.renderer) {
      this.lighting = new LightingManager(this);
      this.screens = new ScreenPainter(this);
      this.applyQuality();
      this.models = new ModelAssets(this);
      this.modelsReady = this.models.load();
      // Every room's shaders are built once, behind the gate, so a doorway is never the moment a program compiles.
      this.modelsReady.then(() => this.renderer?.compileAsync(this.scene, this.camera)).catch(() => {});
    }
    this.resize();
    this.bind();
    this.updateProject();
    this.studio.registerCommands(
      rooms.map((r) => ["Go to " + r.name, r.number.slice(1) + " · Shift: instant", () => this.goRoom(r.id)]).concat([
        ["Keep a version of this project", "", () => this.openMemory()],
        ["Return to the house", "Ctrl ↵", () => this.returnHouse()],
        ["Listening mode", "L", () => this.setListening(!this.listening)],
        ["Open the phone", "Tab", () => this.phone?.toggle(true)],
        ["Ask AURA", "T", () => this.mentor?.ask()],
      ]),
    );
    this.studio.store.addEventListener("change", () => this.updateProject());
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("blur", () => this.resetNavigationInput());
    document.addEventListener("visibilitychange", () => { this.resetNavigationInput(); this.touchControls.refresh(); });
    this.canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.fallback(); });
    this.last = performance.now();
    if (this.renderer) this.renderer.setAnimationLoop((t) => this.frame(t));
    else this.fallback();
    document.fonts?.ready.then(() => this.fontsLoaded());
  }
  // ——— Compatibility: the preset is still readable as `quality`. ———
  get quality() {
    return this.performance;
  }
  get fps() {
    return this.performance.fps;
  }
  get lookYawValue() {
    return this.lookYaw;
  }
  whenFontsReady(fn) {
    if (!this.fontsDone) this.fontCallbacks.push(fn);
  }
  /** Lettering drawn before the typefaces arrived is redrawn once, in the right hand. */
  fontsLoaded() {
    if (this.fontsDone) return;
    this.fontsDone = true;
    if (window.auraFontsEarly) return;
    for (const fn of [...this.architecture.redraws, ...this.fontCallbacks]) { try { fn(); } catch (e) { console.warn(e); } }
    this.screens?.invalidate();
  }
  lookAt(x, y, z) {
    this.camera.lookAt(x, y, z);
    this.yaw = this.lookYaw = this.camera.rotation.y;
    this.pitch = this.lookPitch = this.camera.rotation.x;
  }
  resize() {
    if (this.viewportWidth !== innerWidth || this.viewportHeight !== innerHeight) {
      this.viewportWidth = innerWidth;
      this.viewportHeight = innerHeight;
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer?.setSize(innerWidth, innerHeight, false);
      this.finish?.setSize(innerWidth, innerHeight, this.renderer.getPixelRatio());
      // A held view is composed for the frame it is seen in; turn the screen and it is composed again.
      if (this.interaction?.focused && this.director.holding) this.director.focus({ ...this.interaction.focused.view, duration: 0.5 });
    }
    this.touchControls?.refresh();
  }
  /** Applies the current preset. `soft` is the governor nudging resolution only. */
  applyQuality(soft = false) {
    const r = this.renderer;
    if (!r) return;
    const preset = this.performance.preset;
    r.setPixelRatio(this.performance.pixelRatio);
    r.setSize(innerWidth, innerHeight, false);
    if (!soft) {
      this.scene.environment = preset.env ? this.environment : null;
      r.shadowMap.enabled = preset.shadows;
      r.shadowMap.type = preset.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      r.shadowMap.autoUpdate = preset.shadowAuto;
      r.shadowMap.needsUpdate = true;
      const sun = this.lighting?.sun;
      if (sun && sun.shadow.mapSize.x !== preset.shadowSize) { sun.shadow.map?.dispose(); sun.shadow.map = null; sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize); }
      if (sun) sun.castShadow = preset.shadows;
      setAnisotropy(this.architecture.m, Math.min(preset.anisotropy, r.capabilities.getMaxAnisotropy()));
      this.camera.far = preset.far;
      this.camera.updateProjectionMatrix();
      if (preset.post && !this.finish) this.finish = new Finish(r);
      if (!preset.post && this.finish) { this.finish.dispose(); this.finish = null; }
      // Materials are recompiled when shadows or the environment appear or disappear.
      this.scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
      if (this.lighting) this.lighting.moving = 2;
    }
    this.finish?.setSize(innerWidth, innerHeight, r.getPixelRatio());
    document.body.classList.toggle("houseNoMotion", this.reduced);
    this.events.dispatchEvent(new Event("quality"));
  }
  setReduced(on) {
    this.reduced = on;
    localStorage.setItem("aura-house-reduced", on);
    document.body.classList.toggle("houseNoMotion", on);
  }
  setOption(key, value) {
    const names = { speed: "aura-walk-speed", sensitivity: "aura-look-sensitivity", smoothing: "aura-movement-smoothing", fieldOfView: "aura-fov" };
    this[key] = Number(value);
    localStorage.setItem(names[key], this[key]);
  }
  safe(fn) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        this.studio.toast(e.message || "That could not be done.");
        console.error(e);
      }
    };
  }
  // ——— Input ———
  bind() {
    const on = (id, fn) => { const el = $("#" + id); if (el) el.onclick = this.safe(fn); };
    on("enterHouse", () => this.enter(false));
    on("skipArrival", () => this.enter(true));
    on("returnHouse", () => this.returnHouse());
    for (const b of document.querySelectorAll("[data-house-close]")) b.onclick = () => $("#" + b.dataset.houseClose).close();
    on("ideaKeys", () => { $("#ideaPanel").close(); this.goRoom("instrument"); });
    on("ideaRecord", () => { $("#ideaPanel").close(); this.goRoom("record"); this.openTool("record"); });
    on("createFoundation", () => this.foundation());
    on("beginRecording", async () => {
      await this.recording.start();
      $("#recordMessage").textContent = "Recording the real input. Stop to decode and keep the take.";
      await this.devicesList();
    });
    on("stopRecording", () => this.stopRecording());
    on("quickRecordStop", () => this.stopRecording());
    $("#recordDevice").onchange = (e) => (this.recording.deviceId = e.target.value);
    $("#recordGain").oninput = (e) => this.recording.setGain(Number(e.target.value));
    $("#recordMonitor").onchange = (e) => this.recording.setMonitor(e.target.checked);
    this.recording.addEventListener("change", () => this.recordUI());
    this.recording.addEventListener("meter", () => this.recordUI());
    this.recording.addEventListener("error", (e) => this.studio.toast(e.detail?.message || "Recording failed."));
    on("listeningPlay", () => this.play());
    on("listeningMixer", () => { $("#masterPanel").close(); this.production("living"); });
    $("#listeningGain").onchange = (e) => this.studio.commit("Master volume", (p) => (p.master = Number(e.target.value)));
    on("terraceExport", async () => {
      $("#terraceExport").disabled = true;
      $("#terraceStatus").textContent = "Rendering the real arrangement…";
      try {
        await this.studio.exportAudio();
        $("#terraceStatus").textContent = "Stereo WAV rendered and downloaded. 44.1 kHz / 16 bit.";
        this.architecture.exported();
      } catch (e) {
        $("#terraceStatus").textContent = e.message;
        throw e;
      } finally {
        $("#terraceExport").disabled = false;
      }
    });
    on("terraceProject", () => download(portableProject(this.studio.getProject()), (this.studio.getProject().name.replace(/[^a-z0-9 _-]/gi, "") || "AURA") + ".aura"));
    on("keepMemory", async () => {
      await this.studio.persist();
      await checkpoint(this.studio.getProject(), $("#memoryName").value.trim().slice(0, 80));
      $("#memoryName").value = "";
      await this.loadMemories();
      this.studio.toast("A complete editable version has been kept.");
    });
    for (const d of this.dialogs) d.addEventListener("close", () => { if (this.entered && this.mode === "house") this.canvas.focus({ preventScroll: true }); });
    document.addEventListener("keydown", (e) => this.keyDown(e));
    document.addEventListener("keyup", (e) => this.keys.delete(e.code));
    document.addEventListener("pointerlockchange", () => {
      const locked = document.pointerLockElement === this.canvas;
      document.body.classList.toggle("locked", locked);
      // The browser reports one large jump as the cursor is captured; it is not the visitor's hand.
      this.lookSettles = performance.now() + 220;
      if (!locked) this.keys.clear();
    });
    this.events.addEventListener("light", (e) => this.sound.ambience({ rain: e.detail.sky === "rain" ? 1 : 0 }, 3));
    document.body.classList.toggle("canLock", !this.touch && "requestPointerLock" in this.canvas);
    const canvas = this.canvas;
    const pointAt = (e) => {
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, (-e.clientY / innerHeight) * 2 + 1);
      document.body.style.setProperty("--px", e.clientX + "px");
      document.body.style.setProperty("--py", e.clientY + "px");
    };
    // A touch screen has no cursor at rest: between touches the house looks at the middle of the frame, where USE acts.
    const rest = (e) => {
      if (e.pointerType === "mouse" || this.interaction.focused) return;
      this.pointer.set(0, 0);
      document.body.style.setProperty("--px", "50%");
      document.body.style.setProperty("--py", "50%");
    };
    canvas.onpointerdown = (e) => {
      if (!this.entered || this.mode !== "house" || this.arrival || this.overlayOpen) return;
      if (this.phone?.up && !this.phone.mobile) { this.phone.toggle(false); if (e.pointerType === "mouse") this.lock(); return; }
      if (this.mentor?.asking) this.mentor.close();
      const locked = this.interaction.locked();
      if (!locked) pointAt(e);
      if (this.director.active && !this.director.holding) return;
      this.camera.updateMatrixWorld();
      if (this.interaction.down(e)) { canvas.setPointerCapture?.(e.pointerId); return; }
      if (this.interaction.focused) { this.interaction.focused.onClick?.(e); return; }
      if (locked) { this.tap(); return; }
      if (this.drag) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, mouse: e.pointerType === "mouse" };
      canvas.setPointerCapture(e.pointerId);
      rest(e);
    };
    canvas.onpointermove = (e) => {
      const locked = this.interaction.locked();
      if (!locked && (e.pointerType === "mouse" || this.interaction.focused || this.interaction.active)) pointAt(e);
      if (this.interaction.move(e) && this.interaction.active.use.drag) return;
      if (locked) { if (!this.interaction.focused) this.rotate(e.movementX, e.movementY); return; }
      if (this.drag && this.drag.id === e.pointerId) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        if (!this.interaction.focused) this.rotate(dx * 1.3, dy * 1.3);
      }
    };
    canvas.onpointerup = (e) => {
      if (this.interaction.up(e)) { if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId); rest(e); return; }
      if (this.drag?.id !== e.pointerId) return;
      const drag = this.drag;
      this.drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (drag.moved >= 8 || this.touchControls.pointerId !== null) return;
      pointAt(e);
      this.camera.updateMatrixWorld();
      this.interaction.scan();
      if (this.interaction.target) this.tap();
      else if (drag.mouse && !this.player.seat) this.lock();
      else if (!drag.mouse) this.walkToPointer();
      rest(e);
    };
    const cancel = (e) => { if (this.drag?.id === e.pointerId) this.drag = null; this.interaction.cancel(); };
    canvas.onpointercancel = cancel;
    canvas.onlostpointercapture = (e) => { if (this.drag?.id === e.pointerId) this.drag = null; };
    canvas.addEventListener("wheel", (e) => { const device = this.interaction.focused; if (device?.onWheel) { e.preventDefault(); device.onWheel(e); } }, { passive: false });
    canvas.addEventListener("dblclick", (e) => this.interaction.focused?.onDoubleClick?.(e));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  lock() {
    if (this.touch || this.interaction.focused || !this.canvas.requestPointerLock) return;
    try {
      const request = this.canvas.requestPointerLock({ unadjustedMovement: true });
      request?.catch?.(() => this.canvas.requestPointerLock()?.catch?.(() => {}));
    } catch {}
  }
  keyDown(e) {
    const typing = e.target.closest?.("input,textarea,select");
    if (e.code === "Escape" && this.entered && !this.overlayOpen) {
      if (this.mentor?.asking) { e.preventDefault(); return this.mentor.close(); }
      if (typing) return;
      if (this.phone?.up) return this.phone.toggle(false);
      if (this.interaction.focused) return this.blur();
      if (this.mentor?.visible) return this.mentor.close();
      if (this.player.seat) return this.stand();
      if (this.listening) return this.setListening(false);
      return;
    }
    if (typing || this.overlayOpen) return;
    if (this.entered && e.code === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); return this.toggleMode(); }
    if (this.mode !== "house" || !this.entered || this.arrival || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Tab") { e.preventDefault(); return this.phone?.toggle(); }
    const focused = this.interaction.focused;
    if (focused?.onKey?.(e)) { e.preventDefault(); return; }
    if (e.code === "KeyT" || e.code === "Enter") { e.preventDefault(); return this.mentor?.ask(); }
    if (e.code === "KeyL") { e.preventDefault(); return this.setListening(!this.listening); }
    if (e.code === "KeyE") { e.preventDefault(); return focused ? this.blur() : this.interact(); }
    if (focused || this.phone?.up) return;
    if (/^Digit[1-9]$/.test(e.code)) { e.preventDefault(); return this.goRoom(rooms[Number(e.code.at(-1)) - 1].id, e.shiftKey); }
    if (e.code === "KeyM") { e.preventDefault(); return this.phone?.open("map"); }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.keys.add(e.code);
    if (moveKeys.has(e.code)) {
      e.preventDefault();
      this.beginManualMove();
      this.keys.add(e.code);
    }
  }
  beginManualMove() {
    this.journey = null;
    this.walkTarget = null;
  }
  resetNavigationInput() {
    this.keys.clear();
    this.touchControls?.reset();
    const pointerId = this.drag?.id;
    this.drag = null;
    if (pointerId !== undefined && this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    this.interaction?.cancel();
    this.journey = null;
    this.walkTarget = null;
    this.velocity.set(0, 0);
  }
  rotate(dx, dy) {
    if (performance.now() < (this.lookSettles || 0)) return;
    dx = Math.max(-160, Math.min(160, dx));
    dy = Math.max(-160, Math.min(160, dy));
    const scale = this.sensitivity * (this.listening ? 0.6 : 1) * (this.player.seat ? 0.85 : 1);
    this.lookYaw -= dx * scale;
    this.lookPitch = Math.max(-1.25, Math.min(1.25, this.lookPitch - dy * scale));
    if (this.player.seat?.yaw !== undefined) {
      // Seated, the head turns freely but not all the way round.
      const centre = this.player.seat.yaw, offset = Math.atan2(Math.sin(this.lookYaw - centre), Math.cos(this.lookYaw - centre));
      this.lookYaw = centre + Math.max(-2.3, Math.min(2.3, offset));
    }
  }
  // ——— Arrival ———
  enter(skip) {
    if (this.entered) return;
    this.entered = true;
    const sound = $("#arrivalSound").checked;
    this.sound.setEnabled(sound);
    const gate = $("#gate");
    gate.classList.add("leaving");
    setTimeout(() => (gate.hidden = true), 1200);
    // The gesture that begins the experience is also what lets the browser make sound.
    if (sound) this.studio.engine.init().then(() => { this.sound.ensureBeds(); this.sound.applyBeds(2); }).catch(() => {});
    const cinematic = !skip && !this.reduced && this.renderer && localStorage.getItem("aura-intro") !== "off";
    if (cinematic) this.arrival = new Arrival(this, { short: localStorage.getItem("aura-arrival-duration") === "short" });
    else { if (!this.touch && !skip) this.lock(); this.arrive(); }
    this.canvas.focus({ preventScroll: true });
    this.touchControls.refresh();
  }
  /** The moment control passes to the visitor. */
  arrive() {
    const view = views.gallery;
    this.player.place(view[0], view[1]);
    this.lookAt(view[2], view[3], view[4]);
    this.roomSet = false;
    this.setRoom("gallery");
    document.body.classList.add("entered");
    document.body.classList.remove("booting");
    this.performance.hold(6000);
    this.sound.ambience({ drone: 0, room: 0.7 });
    this.touchControls.refresh();
    this.hud.now();
    this.events.dispatchEvent(new Event("arrive"));
    if (!this.guide?.begin()) this.hud.hint(this.touch ? [["DRAG", "LOOK"], ["PAD", "WALK"], ["●", "PHONE"]] : [["WASD", "WALK"], ["E", "USE"], ["TAB", "PHONE"], ["T", "ASK AURA"]], 9000);
  }
  // ——— Transport ———
  async play() {
    if (this.playback) return this.playback.toggle();
    const e = this.studio.engine;
    if (e.playing) e.pause();
    else await e.play(this.studio.getProject());
  }
  // ——— Sheets and tools ———
  openDialog(id) {
    document.exitPointerLock?.();
    this.resetNavigationInput();
    const d = $("#" + id);
    for (const open of document.querySelectorAll("dialog[open]")) if (open !== d) open.close();
    if (!d.open) { d.showModal(); this.sound.open(); }
  }
  toolLabel(room) {
    return (roomById(room)?.tool || "TOOLS").toUpperCase();
  }
  async openTool(room) {
    if (room === "gallery") return this.studio.openHub();
    if (room === "idea") return this.openDialog("ideaPanel");
    if (room === "record") { this.openDialog("recordPanel"); return this.devicesList(); }
    if (room === "master") { $("#listeningGain").value = this.studio.getProject().master; return this.openDialog("masterPanel"); }
    if (room === "terrace") return this.openDialog("exportPanel");
    this.production(room);
  }
  toggleMode() {
    this.mode === "house" ? this.production(["instrument", "rhythm", "arrange", "living"].includes(this.currentRoom) ? this.currentRoom : "arrange") : this.returnHouse();
  }
  /** The precise editor: every parameter, in the same project. */
  production(room) {
    document.exitPointerLock?.();
    if (this.interaction.focused) this.blur(true);
    this.phone?.toggle(false);
    this.resetNavigationInput();
    this.mode = "production";
    document.body.classList.remove("houseMode");
    document.body.classList.add("productionMode");
    document.body.dataset.room = room;
    $("#productionRoomName").textContent = "THE PRECISE EDITOR · " + roomById(room).name.toUpperCase();
    this.studio.activate(room);
    this.sound.open();
    this.touchControls.refresh();
  }
  returnHouse() {
    if (!this.renderer) return this.studio.openCommand();
    if (this.mode === "house") return;
    this.mode = "house";
    document.body.classList.remove("productionMode");
    document.body.classList.add("houseMode");
    document.body.dataset.room = this.currentRoom;
    window.dispatchEvent(new Event("resize"));
    for (const device of this.devices) device.refresh();
    this.sound.close();
    this.touchControls.refresh();
    this.canvas.focus({ preventScroll: true });
  }
  // ——— Moving through the house ———
  finishJourney(j) {
    this.yaw = this.lookYaw = this.camera.rotation.y;
    this.pitch = this.lookPitch = this.camera.rotation.x;
    this.setRoom(j.id);
    this.journey = null;
    this.velocity.set(0, 0);
    j.done?.();
  }
  goRoom(id, instant = false) {
    const r = roomById(id);
    if (!r) return;
    if (!this.renderer) { this.setRoom(id); return this.openTool(id); }
    if (!this.entered) return;
    this.returnHouse();
    this.arrival?.finish();
    if (this.interaction.focused) this.blur(true);
    if (this.player.seat) this.stand();
    this.resetNavigationInput();
    const view = views[id];
    return this.walkTo(view[0], view[1], { look: [view[2], view[3], view[4]], instant, id });
  }
  /** Walks (or jumps) to a point, optionally ending with the eyes on something. */
  walkTo(x, z, { look = null, instant = false, id = null, done = null, speed = null } = {}) {
    const room = id || roomAt(x, z).id;
    if (this.reduced || instant) {
      this.player.place(x, z);
      if (look) this.lookAt(...look);
      this.journey = null;
      this.setRoom(room);
      done?.();
      return true;
    }
    const route = walkRoute(this.architecture, this.camera.position, { x, z });
    if (!route) {
      this.player.place(x, z);
      if (look) this.lookAt(...look);
      this.setRoom(room);
      done?.();
      return true;
    }
    let facing = null;
    if (look) {
      const probe = this.camera.clone();
      probe.position.set(x, this.architecture.groundHeight(x, z) + EYE, z);
      probe.lookAt(...look);
      facing = probe.quaternion.clone();
    }
    this.journey = { points: route.map((p) => new THREE.Vector3(p.x, 0, p.z)), index: 1, id: room, facing, done, speed };
    return true;
  }
  walkToPointer() {
    const ray = this.interaction.raycaster;
    ray.setFromCamera(this.pointer, this.camera);
    const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) && p.distanceTo(this.camera.position) < 18 && this.architecture.canWalk(p.x, p.z)) {
      const route = walkRoute(this.architecture, this.camera.position, p);
      if (route) this.journey = { points: route.map((q) => new THREE.Vector3(q.x, 0, q.z)), index: 1, id: roomAt(p.x, p.z).id, speed: this.speed };
    }
  }
  setRoom(id) {
    if (this.currentRoom === id && this.roomSet) return;
    const first = !this.roomSet;
    this.currentRoom = id;
    this.roomSet = true;
    document.body.dataset.room = id;
    this.architecture.showRooms(id);
    this.performance.hold(2500);
    if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
    const room = roomById(id);
    if (!first && this.entered && !this.arrival) this.hud.room(room);
    else this.hud.seen.add(id);
    this.events.dispatchEvent(new CustomEvent("room", { detail: id }));
  }
  // ——— Interaction ———
  findInteraction() {
    this.interaction.scan();
  }
  interact() {
    return this.interaction.interact();
  }
  /** A click on the world uses what is aimed at — except the casework of an instrument you are sitting at; E still opens that. */
  tap() {
    this.interaction.scan();
    if (this.player.seat?.own?.includes(this.interaction.target)) return false;
    return this.interact();
  }
  /** Moves in to an instrument: the camera settles, the room recedes, the cursor is free. */
  focus(device) {
    if (this.interaction.focused === device || !this.entered) return;
    if (this.interaction.focused) this.interaction.focused.onExit();
    document.exitPointerLock?.();
    this.resetNavigationInput();
    this.interaction.focused = device;
    this.interaction.set(null, null, null);
    document.body.classList.add("focused");
    this.lighting.dimTarget = device.dim ?? 0.55;
    this.sound.open();
    this.director.focus({ ...device.view, onArrive: () => device.onArrive?.() });
    device.onEnter();
    this.hud.hint(device.hints || [["ESC", "BACK"]], 0);
    if (this.touch && innerHeight > innerWidth && !this.turnTold) { this.turnTold = true; this.studio.toast("Turn the phone sideways for a closer view."); }
    this.events.dispatchEvent(new CustomEvent("focus", { detail: device.name }));
  }
  blur(instant = false) {
    const device = this.interaction.focused;
    if (!device) return;
    this.interaction.cancel();
    this.interaction.focused = null;
    this.interaction.set(null, null, null);
    document.body.classList.remove("focused");
    this.canvas.style.cursor = "";
    this.lighting.dimTarget = 0;
    this.hud.clearHint();
    device.onExit();
    this.sound.close();
    if (instant) this.director.cancel();
    else this.director.release(0.8);
    this.events.dispatchEvent(new CustomEvent("blur", { detail: device.name }));
  }
  sit(seat) {
    if (this.player.seat === seat) return;
    if (this.interaction.focused) this.blur(true);
    this.player.sitDown(seat);
    document.body.classList.add("seated");
    this.hud.hint(this.touch ? [["PAD", "STAND"]] : [["DRAG", "LOOK"], ["WASD", "STAND"], ["TAB", "PHONE"], ["T", "ASK AURA"], ["L", "JUST LISTEN"]], 7000);
    this.events.dispatchEvent(new CustomEvent("sit", { detail: seat.id }));
  }
  stand() {
    this.player.stand();
    document.body.classList.remove("seated");
  }
  /** Stop producing; just be in the house with the music. */
  setListening(on) {
    if (this.listening === on || !this.entered) return;
    this.listening = on;
    document.body.classList.toggle("listening", on);
    this.lighting.borrow(on ? "listen" : null);
    this.player.pace = on ? 0.62 : 1;
    this.player.lookEase = on ? 7 : 18;
    if (on) {
      if (this.interaction.focused) this.blur();
      this.phone?.toggle(false);
      this.hud.moment({ eyebrow: "LISTENING", title: "Just\nlisten.", sub: this.touch ? "Walk, sit, look outside. The phone brings you back." : "Walk, sit, look outside. Press L to return.", small: true, hold: 2600 });
      if (!this.studio.engine.playing) this.play().catch(() => {});
    } else this.hud.hint([["L", "LISTENING OFF"]], 2500);
    this.events.dispatchEvent(new CustomEvent("listening", { detail: on }));
  }
  /** The track that answers when a key is struck on the grand. */
  keysTrack() {
    const selected = this.studio.getTrack();
    if (selected && !["drums", "audio"].includes(selected.instrument)) return selected;
    return this.studio.getProject().tracks.find((t) => t.instrument === "keys") || (this.spareKeys ||= { ...makeTrack("keys"), id: "house-keys" });
  }
  drumTrack() {
    return this.studio.getProject().tracks.find((t) => t.instrument === "drums") || (this.spareDrums ||= { ...makeTrack("drums"), id: "house-drums" });
  }
  hitDrum(pitch, mesh = null) {
    this.studio.engine.audition(this.drumTrack(), pitch).catch((e) => this.studio.toast(e.message));
    const sway = mesh && this.architecture.swaying.find((s) => s.object === mesh);
    if (sway) sway.kick = 1;
    this.events.dispatchEvent(new CustomEvent("control", { detail: { device: "kit", control: "hit", value: pitch } }));
  }
  playConsole() {
    if (this.console) return this.console.enter();
    window.aura.game?.open();
  }
  async foundation() {
    await this.studio.persist();
    const text = $("#ideaText").value.trim(), p = foundationFromText(text);
    await this.studio.selectProject(p);
    $("#ideaPanel").close();
    this.goRoom("living");
    this.studio.toast(`An editable beginning: ${p.bpm} BPM, ${p.scale}, ${p.tracks.length} tracks.`);
  }
  async devicesList() {
    const ds = await this.recording.devices(), select = $("#recordDevice"), value = select.value;
    select.replaceChildren(new Option("Default microphone", ""));
    ds.forEach((d, i) => select.add(new Option(d.label || "Input " + (i + 1), d.deviceId)));
    select.value = value;
    select.disabled = this.recording.active;
  }
  async stopRecording() {
    $("#recordMessage").textContent = "Decoding and saving the take…";
    await this.recording.stop();
    $("#recordMessage").textContent = "Take kept as an audio track. It is on the timeline now.";
    this.recordUI();
  }
  recordUI() {
    const r = this.recording;
    $("#recordIndicator").hidden = !r.active;
    $("#recordSeconds").textContent = fmt(r.seconds);
    $("#takeTime").textContent = fmt(r.seconds);
    $("#beginRecording").disabled = r.active || r.saving;
    $("#stopRecording").disabled = !r.active;
    $("#recordDevice").disabled = r.active;
    if (!$("#recordPanel").open) return;
    const c = $("#recordWave"), ctx = c.getContext("2d");
    ctx.fillStyle = "#161412";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#efe7d8";
    ctx.beginPath();
    r.wave.forEach((v, i) => { const x = (i / r.wave.length) * c.width, y = 65 + v * 58; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
  async openMemory() {
    this.openDialog("memoryPanel");
    await this.loadMemories();
  }
  async loadMemories() {
    const projectId = this.studio.getProject().id, memories = await listMemories(projectId);
    if (projectId !== this.studio.getProject().id) return;
    this.memories = memories;
    const list = $("#memoryList");
    list.replaceChildren();
    if (!memories.length) list.append(Object.assign(document.createElement("p"), { textContent: "Kept versions will appear here, and on the ledge by the front door." }));
    for (const m of memories) {
      const b = document.createElement("button");
      b.className = "memoryVersion";
      b.append(Object.assign(document.createElement("strong"), { textContent: m.name }), Object.assign(document.createElement("small"), { textContent: new Date(m.savedAt).toLocaleString() + " · RESTORE" }));
      b.onclick = this.safe(async () => {
        await this.studio.persist();
        await this.studio.selectProject(structuredClone(m.project));
        $("#memoryPanel").close();
        this.studio.toast("Restored " + m.name);
      });
      list.append(b);
    }
    this.events.dispatchEvent(new Event("memories"));
  }
  updateProject() {
    const p = this.studio.getProject();
    this.events.dispatchEvent(new Event("project"));
    if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
    for (const device of this.devices) device.refresh();
    if (this.memoryProject !== p.id) {
      this.memoryProject = p.id;
      this.loadMemories().catch((e) => this.studio.toast("Versions could not be loaded: " + e.message));
    }
  }
  // ——— Frame ———
  /** Small motions that make the place feel inhabited. All of it is cheap and none of it is random noise. */
  animate(dt, t, bands) {
    const a = this.architecture, e = this.studio.engine, still = this.reduced, time = t / 1000;
    if (a.time) a.time.value = time;
    const react = still ? 0 : 1;
    for (const cone of a.cones) cone.mesh.position.z = cone.rest + cone.depth * bands[cone.band] * react * (cone.band === "bass" ? 1 : 0.6 + 0.4 * Math.sin(time * 90));
    if (e.playing && !still) for (const s of a.spinners) s.object.rotation[s.axis] += s.speed * dt;
    const wind = Math.min(1, this.velocity.length() / 4);
    for (const s of a.swaying) {
      if (s.cymbal) {
        if (!s.kick || s.kick < 0.01) continue;
        s.kick *= Math.exp(-dt * 2.6);
        s.object.rotation.x = s.base.x + Math.sin(time * 19 + s.phase) * 0.16 * s.kick;
        s.object.rotation.z = s.base.z + Math.cos(time * 16 + s.phase) * 0.12 * s.kick;
        continue;
      }
      if (still) continue;
      // Plants lean a little when someone walks past.
      const near = s.object.getWorldPosition(this.scratch).distanceToSquared(this.camera.position) < 9 ? wind : 0;
      s.gust = (s.gust || 0) + (near - (s.gust || 0)) * (1 - Math.exp(-dt * 2));
      s.object.rotation.z = Math.sin(time * 0.7 + s.phase) * s.amount * (1 + s.gust * 5 + bands.bass * 0.6);
      s.object.rotation.x = Math.cos(time * 0.53 + s.phase) * s.amount * (0.7 + s.gust * 3);
    }
    if (!still) for (const b of a.blink) b.color.copy(b.userData.base).multiplyScalar(Math.sin(time * b.userData.rate + b.userData.phase) > -0.3 ? 1 : 0.1);
    // Piano keys travel under the finger and spring back.
    if (a.pianoKeys) for (const key of a.pianoKeys) {
      const target = key.down ? 1 : 0;
      if (Math.abs(target - key.depth) < 0.001) continue;
      key.depth += (target - key.depth) * (1 - Math.exp(-dt * (target ? 60 : 24)));
      this.scratchM.makeRotationX(key.depth * 0.022).setPosition(0, -key.depth * 0.012, 0);
      key.mesh.setMatrixAt(key.index, this.scratchM.premultiply(key.matrix));
      key.mesh.instanceMatrix.needsUpdate = true;
    }
    if (t - (this.lastClock || 0) > 1000) {
      this.lastClock = t;
      const now = new Date(), s = now.getSeconds(), m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
      for (const c of a.clocks) { c.second.rotation.z = -(s / 60) * Math.PI * 2; c.minute.rotation.z = -(m / 60) * Math.PI * 2; c.hour.rotation.z = -(h / 12) * Math.PI * 2; }
    }
  }
  frame(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (document.hidden) return;
    const overlay = this.dialogs.some((d) => d.open);
    if (overlay !== this.overlayOpen) { this.overlayOpen = overlay; document.body.classList.toggle("dialogOpen", overlay); if (overlay) this.interaction.set(null, null, null); }
    const visible = this.mode === "house" && !overlay;
    const e = this.studio.engine, bands = e.analysis(t);
    if (this.arrival) this.arrival.update(dt);
    if (visible && this.entered && !this.arrival) {
      for (let elapsed = 0; elapsed < dt; elapsed += 0.02) {
        const step = Math.min(0.02, dt - elapsed);
        this.director.update(step);
        this.player.update(step);
      }
      this.interaction.update(dt);
    }
    if (t - this.lastMetrics > 75 && (visible || $("#masterPanel").open)) {
      this.lastMetrics = t;
      this.metrics = e.metrics();
      this.hud.position();
      if ($("#masterPanel").open) { $("#listeningPeak").textContent = db(this.metrics.peak); $("#listeningRms").textContent = db(this.metrics.rms); }
    }
    if (!visible || !this.renderer) { this.performance.reset(t); this.performance.hold(1500); return; }
    const a = this.architecture;
    a.updateDoors(this.camera.position, dt, this.arrival ? this.arrival.door : null);
    a.updatePads(e.playing && e.p ? e.p : this.studio.getProject(), e.beat, e.playing);
    this.animate(dt, t, bands);
    const position = this.camera.position;
    for (const device of this.devices) {
      const distance = device.focused ? 0 : device.group.getWorldPosition(this.scratch).distanceToSquared(position);
      if (device.detail) device.detail.visible = distance < (device.detailReach || 42);
      if (distance < (device.reach || 400)) device.update(dt, bands, t);
    }
    this.lighting.dimTarget = this.interaction.focused ? this.interaction.focused.dim ?? 0.55 : this.phone?.up || this.mentor?.visible ? 0.22 : 0;
    this.lighting.apply(dt, bands, t);
    this.screens.update(t);
    if (this.arrival) this.arrival.render(this.renderer);
    else if (this.finish) this.finish.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
    if (!this.arrival || this.arrival.veil < 0.5) this.performance.sample(t);
  }
  fallback() {
    this.renderer?.setAnimationLoop(null);
    this.renderer = null;
    this.entered = true;
    this.journey = null;
    this.resetNavigationInput();
    $("#gate").hidden = true;
    $("#houseFallback").hidden = false;
    document.body.classList.remove("booting");
    document.body.classList.add("graphicsFallback", "entered");
    this.mode = "production";
    document.body.classList.remove("houseMode");
    document.body.classList.add("productionMode");
    this.studio.activate("arrange");
    $("#returnHouse").textContent = "Commands";
    if (!this.fallbackFrame) {
      this.fallbackFrame = true;
      const tick = (t) => { this.frame(t); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
  }
}
MusicHouse.prototype.scratch = new THREE.Vector3();
MusicHouse.prototype.scratchM = new THREE.Matrix4();
