import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { walkRoute } from "./navigation.js";
import { Arrival } from "./arrival.js";
import { Architecture } from "./architecture.js";
import { ModelAssets } from './model-assets.js';
import { rooms, roomById, roomAt, roomRoute } from "./layout.js";
import { newProject, noteName, presets } from "../project.js";
import { foundationFromText } from "../foundation.js";
import {
  checkpoint,
  listMemories,
  download,
  portableProject,
} from "../storage.js";

const $ = (s) => document.querySelector(s);
const views = {
  gallery: [0, 24, 0, 2, 10],
  idea: [-16, 25, -20, 1.3, 16],
  instrument: [-21.4, 1.3, -22.05, 1.3, -1.75],
  rhythm: [16, 4.5, 21, 0.6, -1],
  record: [16, 25, 24, 1.3, 20],
  arrange: [-14, -14, -28, 2.2, -20],
  living: [4, 6.7, 0, 2, -4.3],
  master: [0, -19.6, 0, 2.2, -26],
  terrace: [15, -15, 23, 2, -23],
};
const labels = {
  projects: "Open your project collection",
  new: "Begin an empty project",
  note: "Play a piano key",
  instrument: "Open this instrument",
  step: "Toggle this rhythm step",
  tool: "Open precise tools",
  lens: "Inspect the mix · local measurements",
  track: "Select this voice in the mixer",
  channel: "Open this mixer channel",
  memory: "Open musical memory",
  game: "Play Sundown Rally · your music keeps playing",
  coach: "Learn music with the coach",
};
const fmt = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : "−∞");

/** This layer navigates and presents the existing music project. It owns no audio graph. */
export class MusicHouse {
  constructor(studio, recording) {
    this.studio = studio;
    this.recording = recording;
    this.mode = "house";
    this.currentRoom = "gallery";
    this.keys = new Set();
    this.pointer = new THREE.Vector2(0, 0);
    this.raycaster = new THREE.Raycaster();
    this.velocity = new THREE.Vector2();
    this.memories = [];
    this.entered = false;
    this.lastScreen = 0;
    this.lastAudio = 0;
    this.metrics = { peak: 0, rms: 0, tracks: new Map() };
    this.frames = 0;
    this.profileFrames=0;this.profileStart=performance.now();
    this.reduced =
      localStorage.getItem("aura-house-reduced") === "true" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.quality = localStorage.getItem("aura-house-quality") || "balanced";
    this.speed = Number(localStorage.getItem("aura-walk-speed")) || 3.3;
    this.sensitivity = Number(localStorage.getItem("aura-look-sensitivity")) || .0025;
    this.smoothing = Number(localStorage.getItem("aura-movement-smoothing")) || 10;
    this.fieldOfView = Number(localStorage.getItem("aura-fov")) || 62;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog("#cbbfa9", 85, 240);
    this.camera = new THREE.PerspectiveCamera(
      this.fieldOfView,
      innerWidth / innerHeight,
      0.08,
      450,
    );
    this.camera.rotation.order = "YXZ";
    this.camera.position.set(11, 3.1, 42);
    this.lookAt(-3, 2.9, 28);
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: $("#world"),
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.25;
    } catch {
      this.renderer = null;
    }
    if (this.renderer) {
      const environment = new RoomEnvironment();
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.environment = pmrem.fromScene(environment, 0.04).texture;
      environment.dispose();
      pmrem.dispose();
      this.scene.environmentIntensity = 0.35;
    }
    this.scene.add(new THREE.HemisphereLight("#e8e8d6", "#746e58", 1.2));
    const sun = new THREE.DirectionalLight("#fff0d2", 3.2);
    sun.position.set(-35, 70, 28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -48,
      right: 48,
      top: 48,
      bottom: -48,
      near: 0.5,
      far: 160,
    });
    sun.shadow.bias = -0.0003;
    this.scene.add(sun);
    this.sun = sun;
    this.architecture = new Architecture(this.scene);
    this.updateLighting();
    this.applyQuality();
    this.resize();
    this.bind();
    this.updateProject();
    if(this.renderer){this.models=new ModelAssets(this);this.modelsReady=this.models.load();}
    this.studio.registerCommands(
      rooms
        .map((r) => ["Go to " + r.name + " · " + r.tool, r.number + " / Shift: instant", () => this.goRoom(r.id)])
        .concat([
          ["Keep a musical memory", "", () => this.openMemory()],
          ["Return to the house", "Ctrl ↵", () => this.returnHouse()],
        ]),
    );
    this.studio.store.addEventListener("change", () => this.updateProject());
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("blur", () => this.keys.clear());
    document.addEventListener("visibilitychange", () => this.keys.clear());
    $("#world").addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.fallback();
    });
    this.last = performance.now();
    if (this.renderer) this.renderer.setAnimationLoop((t) => this.frame(t));
    else this.fallback();
    if (this.renderer && localStorage.getItem("aura-intro") === "off")
      this.enter(true);
  }
  lookAt(x, y, z) {
    this.camera.lookAt(x, y, z);
    this.yaw = this.camera.rotation.y;
    this.pitch = this.camera.rotation.x;
    this.lookYaw = this.yaw;
    this.lookPitch = this.pitch;
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(innerWidth, innerHeight, false);
  }
  applyQuality() {
    this.scene.environment =
      this.quality === "performance" ? null : this.environment || null;
    this.renderer?.setPixelRatio(
      this.quality === "full"
        ? Math.min(devicePixelRatio, 1.5)
        : this.quality === "performance"
          ? 0.7
          : Math.min(devicePixelRatio, 1),
    );
    if (this.renderer) {
      this.renderer.shadowMap.enabled = this.quality !== "performance";
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = this.quality === "full";
      this.renderer.shadowMap.needsUpdate = true;
      const size=this.quality === "full"?2048:1024;
      if(this.sun.shadow.mapSize.x!==size){this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.sun.shadow.mapSize.set(size,size);}
    }
    this.architecture.reduced = this.reduced;
    if(this.renderer)this.renderer.info.autoReset=true;
    document.body.classList.toggle("houseNoMotion", this.reduced);
    $("#graphicsQuality").value = this.quality;
    $("#houseReduced").checked = this.reduced;
    $("#houseArrivalSetting").checked =
      localStorage.getItem("aura-intro") !== "off";
    this.resize();
  }
  safe(fn) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        this.studio.toast(e.message || "This action could not be completed.");
        console.error(e);
      }
    };
  }
  bind() {
    const on = (id, fn) => ($("#" + id).onclick = this.safe(fn));
    on("enterHouse", () => this.enter(false));
    on("skipArrival", () => this.enter(true));
    on("houseBrand", () => this.goRoom("gallery"));
    on("houseMapButton", () => this.openDialog("roomMap"));
    on("houseSettingsButton", () => this.openDialog("houseSettings"));
    on("houseModeButton", () => this.toggleMode());
    on("returnHouse", () => this.returnHouse());
    on("roomWorkButton", () => this.openTool(this.currentRoom));
    on("houseCommand", () => this.studio.openCommand());
    on("mapMemory", () => {
      $("#roomMap").close();
      this.openMemory();
    });
    on("housePlay", () => this.play());
    on("houseStop", () => this.studio.engine.stop());
    on("houseLock", () => $("#world").requestPointerLock());
    on("interactButton", () => this.interact());
    for (const b of document.querySelectorAll("[data-house-close]"))
      b.onclick = () => $("#" + b.dataset.houseClose).close();
    for (const r of [...rooms].sort((a, b) => a.row - b.row || a.col - b.col)) {
      const b = document.createElement("button");
      b.dataset.room = r.id;
      b.innerHTML =
        "<span>" +
        r.number +
        "</span><strong>" +
        r.name +
        "</strong><small>" +
        r.tool +
        "</small>";
      b.onclick = (e) => {
        $("#roomMap").close();
        this.goRoom(r.id, e.shiftKey);
      };
      $("#roomGrid").append(b);
    }
    $("#graphicsQuality").onchange = (e) => {
      this.quality = e.target.value;
      localStorage.setItem("aura-house-quality", this.quality);
      this.applyQuality();
    };
    $("#houseReduced").onchange = (e) => {
      this.reduced = e.target.checked;
      localStorage.setItem("aura-house-reduced", this.reduced);
      this.applyQuality();
    };
    $("#houseArrivalSetting").onchange = (e) =>
      localStorage.setItem("aura-intro", e.target.checked ? "on" : "off");
    $("#walkSpeed").value = this.speed;
    $("#walkSpeed").oninput = (e) => {this.speed = Number(e.target.value); localStorage.setItem("aura-walk-speed", this.speed);};
    for (const [id, key, setting] of [["lookSensitivity", "sensitivity", "aura-look-sensitivity"], ["movementSmoothing", "smoothing", "aura-movement-smoothing"], ["fieldOfView", "fieldOfView", "aura-fov"]]) {
      $("#" + id).value = this[key];
      $("#" + id).oninput = e => {this[key] = Number(e.target.value); localStorage.setItem(setting, this[key]); this.camera.fov = this.fieldOfView; this.camera.updateProjectionMatrix();};
    }
    $("#arrivalDuration").value = localStorage.getItem("aura-arrival-duration") || "short";
    $("#arrivalDuration").onchange = e => localStorage.setItem("aura-arrival-duration", e.target.value);
    on("ideaKeys", () => {
      $("#ideaPanel").close();
      this.goRoom("instrument");
      this.production("instrument");
    });
    on("ideaRecord", () => {
      $("#ideaPanel").close();
      this.goRoom("record");
      this.openTool("record");
    });
    on("createFoundation", () => this.foundation());
    on("beginRecording", async () => {
      await this.recording.start();
      $("#recordMessage").textContent =
        "Recording the real input. Stop to decode and keep the take.";
      await this.devices();
    });
    on("stopRecording", () => this.stopRecording());
    on("quickRecordStop", () => this.stopRecording());
    $("#recordDevice").onchange = (e) =>
      (this.recording.deviceId = e.target.value);
    $("#recordGain").oninput = (e) =>
      this.recording.setGain(Number(e.target.value));
    $("#recordMonitor").onchange = (e) =>
      this.recording.setMonitor(e.target.checked);
    this.recording.addEventListener("change", () => this.recordUI());
    this.recording.addEventListener("meter", () => this.recordUI());
    this.recording.addEventListener("error", (e) =>
      this.studio.toast(e.detail?.message || "Recording failed."),
    );
    on("listeningPlay", () => this.play());
    on("listeningMixer", () => {
      $("#masterPanel").close();
      this.production("living");
    });
    $("#listeningGain").onchange = (e) =>
      this.studio.commit(
        "Master volume",
        (p) => (p.master = Number(e.target.value)),
      );
    on("terraceExport", async () => {
      $("#terraceExport").disabled = true;
      $("#terraceStatus").textContent = "Rendering the real arrangement…";
      try {
        await this.studio.exportAudio();
        $("#terraceStatus").textContent =
          "Stereo WAV rendered and downloaded. 44.1 kHz / 16 bit.";
        this.architecture.exportSculpture.material.emissive = new THREE.Color(
          "#725537",
        );
        this.architecture.exportSculpture.material.emissiveIntensity = 0.2;
      } catch (e) {
        $("#terraceStatus").textContent = e.message;
        throw e;
      } finally {
        $("#terraceExport").disabled = false;
      }
    });
    on("terraceProject", () =>
      download(
        portableProject(this.studio.getProject()),
        (this.studio.getProject().name.replace(/[^a-z0-9 _-]/gi, "") ||
          "AURA") + ".aura",
      ),
    );
    on("keepMemory", async () => {
      await this.studio.persist();
      await checkpoint(
        this.studio.getProject(),
        $("#memoryName").value.trim().slice(0, 80),
      );
      $("#memoryName").value = "";
      await this.loadMemories();
      this.studio.toast("A complete editable version has been kept.");
    });
    document.addEventListener("keydown", (e) => this.keyDown(e));
    document.addEventListener("keyup", (e) => this.keys.delete(e.code));
    document.addEventListener("pointerlockchange", () =>
      document.body.classList.toggle(
        "locked",
        document.pointerLockElement === $("#world"),
      ),
    );
    const canvas = $("#world");
    canvas.onpointerdown = (e) => {
      if (!this.entered || this.mode !== "house") return;
      this.drag = { x: e.clientX, y: e.clientY, moved: 0 };
      canvas.setPointerCapture(e.pointerId);
    };
    canvas.onpointermove = (e) => {
      this.pointer.set(
        (e.clientX / innerWidth) * 2 - 1,
        (-e.clientY / innerHeight) * 2 + 1,
      );
      if (document.pointerLockElement === canvas) {
        this.rotate(e.movementX, e.movementY);
      } else if (this.drag) {
        const dx = e.clientX - this.drag.x,
          dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        this.rotate(dx, dy);
      }
    };
    canvas.onpointerup = () => {
      if (this.drag?.moved < 8) {
        this.findInteraction();
        if (this.target) this.interact();
        else this.walkToPointer();
      }
      this.drag = null;
    };
    canvas.onpointercancel = () => (this.drag = null);
  }
  enter(skip) {
    if (this.entered) return;
    this.entered = true;
    $("#arrival").hidden = true;
    if ($("#arrivalSound").checked) {
      const t = this.studio
        .getProject()
        .tracks.find((t) => t.instrument === "keys");
      if (t)
        this.studio.engine
          .audition({ ...t, gain: 0.2 }, 62)
          .catch((e) => this.studio.toast(e.message));
    }
    if (skip || this.reduced) this.goRoom("gallery", true);
    else this.arrival = new Arrival(this, localStorage.getItem("aura-arrival-duration") !== "full");
    $("#world").focus();
  }
  async play() {
    const e = this.studio.engine;
    if (e.playing) e.pause();
    else await e.play(this.studio.getProject());
  }
  openDialog(id) {
    document.exitPointerLock?.();
    this.keys.clear();
    this.journey=null;this.velocity.set(0,0);
    this.walkTarget = null;
    const d = $("#" + id);
    for(const open of document.querySelectorAll('dialog[open]'))if(open!==d)open.close();
    if (!d.open) d.showModal();
  }
  keyDown(e) {
    if (
      e.target.closest("input,textarea,select") ||
      [...document.querySelectorAll("dialog")].some((d) => d.open)
    )
      return;
    if (this.entered && ((e.code === "Enter" && (e.ctrlKey || e.metaKey)) || (e.code === "Tab" && e.target === $("#world")))) {
      e.preventDefault();
      this.toggleMode();
      return;
    }
    if (
      this.mode !== "house" ||
      !this.entered ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    )
      return;
    if (/^Digit[1-9]$/.test(e.code)) {
      e.preventDefault();
      this.goRoom(rooms[Number(e.code.at(-1)) - 1].id, e.shiftKey);
      return;
    }
    if (e.code === "KeyM") {
      e.preventDefault();
      this.openDialog("roomMap");
    }
    if (e.code === "KeyE") {
      e.preventDefault();
      this.interact();
    }
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.code)
    ) {
      e.preventDefault();
      if (this.journey?.speed && this.camera.position.z > 31)
        this.goRoom("gallery", true);
      this.arrival?.finish();
      this.keys.add(e.code);
      this.journey = null;
      this.walkTarget = null;
      document.body.classList.remove("houseMoving");
    }
  }
  rotate(dx, dy) {
    this.lookYaw -= dx * this.sensitivity;
    this.lookPitch = Math.max(-1.1, Math.min(1.1, this.lookPitch - dy * this.sensitivity));
  }
  smoothLook(dt) {
    const factor = this.reduced ? 1 : 1 - Math.exp(-dt * 16);
    this.yaw += Math.atan2(Math.sin(this.lookYaw-this.yaw), Math.cos(this.lookYaw-this.yaw)) * factor;
    this.pitch += (this.lookPitch-this.pitch) * factor;
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }
  finishJourney(j) {
    this.yaw = this.lookYaw = this.camera.rotation.y;
    this.pitch = this.lookPitch = this.camera.rotation.x;
    this.setRoom(j.id);
    this.journey = null;
    this.velocity.set(0,0);
    document.body.classList.remove("houseMoving");
  }
  goRoom(id, instant = false) {
    const r = roomById(id);
    if (!r) return;
    if (!this.renderer) {
      this.setRoom(id);
      return this.openTool(id);
    }
    if (this.camera.position.z > 31) {
      this.camera.position.set(0, 1.72, 24);
      this.lookAt(0, 2, 10);
    }
    this.returnHouse();
    this.arrival?.finish();
    this.keys.clear();
    this.velocity.set(0,0);
    this.walkTarget = null;
    const view = views[id];
    if (this.reduced || instant) {
      this.camera.position.set(view[0], 1.72, view[1]);
      this.lookAt(view[2], view[3], view[4]);
      this.journey = null;
      this.setRoom(id);
      document.body.classList.remove("houseMoving");
      return;
    }
    const route=walkRoute(this.architecture,this.camera.position,{x:view[0],z:view[1]});
    if(!route){this.studio.toast("No walkable route. Use production view or choose another room.");return;}
    const points=route.map(p=>new THREE.Vector3(p.x,1.72,p.z));
    const finalCamera=this.camera.clone();finalCamera.position.set(view[0],1.72,view[1]);finalCamera.lookAt(view[2],view[3],view[4]);
    this.journey = { points, index: 1, id, facing:finalCamera.quaternion.clone() };
    document.body.classList.add("houseMoving");
  }
  setRoom(id) {
    if (this.currentRoom === id && this.roomSet) return;
    this.currentRoom = id;
    this.roomSet = true;
    this.updateLighting();
    const r = roomById(id);
    document.body.dataset.room = id;
    $("#roomTitle").textContent = r.name + ".";
    $("#roomEyebrow").textContent = r.eyebrow;
    $("#roomDescription").textContent = r.description;
    $("#roomWorkButton").innerHTML = r.tool;
    for (const b of document.querySelectorAll("#roomGrid [data-room]"))
      b.classList.toggle("active", b.dataset.room === id);
  }
  updateLighting() {
    const lights=this.architecture.roomLights;
    const nearest=[...lights].sort((a,b)=>a.getWorldPosition(new THREE.Vector3()).distanceToSquared(this.camera.position)-b.getWorldPosition(new THREE.Vector3()).distanceToSquared(this.camera.position)).slice(0,3);
    for(const light of lights)light.visible=nearest.includes(light);
  }
  toggleMode() {
    this.mode === "house"
      ? this.production(
          ["instrument", "rhythm", "arrange", "living"].includes(
            this.currentRoom,
          )
            ? this.currentRoom
            : "arrange",
        )
      : this.returnHouse();
  }
  production(room) {
    document.exitPointerLock?.();
    this.keys.clear();
    this.journey=null;this.velocity.set(0,0);
    this.mode = "production";
    document.body.classList.remove("houseMode");
    document.body.classList.add("productionMode");
    document.body.dataset.room = room;
    $("#productionRoomName").textContent = roomById(room).name.toUpperCase();
    $("#houseModeButton").innerHTML = "House view <kbd>Ctrl ↵</kbd>";
    this.studio.activate(room);
  }
  returnHouse() {
    if (!this.renderer) return this.openDialog("roomMap");
    this.mode = "house";
    document.body.classList.remove("productionMode");
    document.body.classList.add("houseMode");
    document.body.dataset.room = this.currentRoom;
    $("#houseModeButton").innerHTML = "Production view <kbd>Ctrl ↵</kbd>";
    window.dispatchEvent(new Event("resize"));
  }
  async openTool(room) {
    if (room === "gallery") return this.studio.openHub();
    if (room === "idea") return this.openDialog("ideaPanel");
    if (room === "record") {
      this.openDialog("recordPanel");
      return this.devices();
    }
    if (room === "master") {
      $("#listeningGain").value = this.studio.getProject().master;
      return this.openDialog("masterPanel");
    }
    if (room === "terrace") return this.openDialog("exportPanel");
    this.production(room);
  }
  findInteraction() {
    if (this.mode !== "house" || !this.entered) return;
    this.raycaster.setFromCamera(
      document.pointerLockElement ? new THREE.Vector2(0, 0) : this.pointer,
      this.camera,
    );
    const hits = this.raycaster.intersectObjects(
      this.architecture.interactive,
      false,
    );
    const hit = hits.find((h) => h.distance < 14 && h.object.visible);
    let blocked = false;
    if (hit) {
      const point = new THREE.Vector3();
      for (const w of this.architecture.walls) {
        const box = new THREE.Box3(
          new THREE.Vector3(w.minX, 0, w.minZ),
          new THREE.Vector3(w.maxX, 6.4, w.maxZ),
        );
        if (
          this.raycaster.ray.intersectBox(box, point) &&
          point.distanceTo(this.camera.position) < hit.distance - 0.2
        ) {
          blocked = true;
          break;
        }
      }
    }
    this.target = hit && !blocked ? hit.object : null;
    $("#interactionHint").hidden = !this.target;
    const action = this.target?.userData.action;
    let label = action ? labels[action.type] || "Open instrument" : "";
    if (action?.type === "track") {
      const t = this.studio.getProject().tracks.find((t) => t.id === action.id),
        m = this.metrics.tracks.get(action.id);
      if (t)
        label =
          t.name +
          " · " +
          (t.pan === 0
            ? "center"
            : Math.round(Math.abs(t.pan) * 100) + (t.pan < 0 ? "L" : "R")) +
          " · " +
          db(m?.rms || 0) +
          " dBFS RMS";
    } else if (action?.type === "channel") {
      const track=this.studio.getProject().tracks[action.index];
      label=track?"Open "+track.name+" in the mixer":"Open the mixing console";
    } else if (action?.type === "note")
      label = "Play " + noteName(action.pitch) + " · synthesized keys";
    else if (action?.type === "step")
      label =
        { 36: "Kick", 38: "Snare", 42: "Hi-hat" }[action.pitch] +
        " · step " +
        (action.step + 1);
    else if (action?.type === "instrument")
      label =
        "Open " +
        (presets.find((p) => p.id === action.instrument)?.name || "instrument");
    $("#interactionName").textContent = label;
  }
  async interact() {
    if (!this.target) return this.openTool(this.currentRoom);
    const a = this.target.userData.action;
    try {
      if (a.type === "projects") await this.studio.openHub();
      else if (a.type === "new") {
        await this.studio.persist();
        await this.studio.selectProject(newProject(true));
        this.goRoom("instrument");
      } else if (a.type === "tool") await this.openTool(a.room);
      else if (a.type === "note") {
        this.studio.setInstrument("keys");
        await this.studio.engine.audition(this.studio.getTrack(), a.pitch);
      } else if (a.type === "instrument") {
        this.studio.setInstrument(a.instrument);
        this.production("instrument");
        this.studio.setInstrument(a.instrument);
      } else if (a.type === "step") this.studio.toggleStep(a.step, a.pitch);
      else if (a.type === "track") {
        this.production("living");
        this.studio.select(a.id);
      } else if (a.type === "channel") {
        const track=this.studio.getProject().tracks[a.index];
        this.production("living");if(track)this.studio.select(track.id);
      } else if (a.type === "lens") this.production("living");
      else if (a.type === "memory") await this.openMemory();
      else if (a.type === 'game') window.aura.game?.open();
      else if (a.type === 'coach') window.aura.coach?.open();
    } catch (e) {
      this.studio.toast(e.message);
    }
  }
  walkToPointer() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const p = new THREE.Vector3();
    if (
      this.raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        p,
      ) &&
      p.distanceTo(this.camera.position) < 18 &&
      this.architecture.canWalk(p.x, p.z)
    ) {
      const route=walkRoute(this.architecture,this.camera.position,p);
      if(route)this.journey={points:route.map(p=>new THREE.Vector3(p.x,1.72,p.z)),index:1,id:roomAt(p.x,p.z).id,speed:this.speed};
      this.walkTarget=null;
    }
  }
  async foundation() {
    await this.studio.persist();
    const text = $("#ideaText").value.trim(),
      p = foundationFromText(text);
    await this.studio.selectProject(p);
    $("#ideaPanel").close();
    this.goRoom("instrument");
    this.studio.toast(
      "Editable local recipe: " +
        p.bpm +
        " BPM, " +
        p.scale +
        ", " +
        p.tracks.length +
        " tracks. No model was used.",
    );
  }
  async devices() {
    const ds = await this.recording.devices(),
      select = $("#recordDevice"),
      value = select.value;
    select.replaceChildren(new Option("Default microphone", ""));
    for (const [d, i] of ds.map((d, i) => [d, i]))
      select.add(new Option(d.label || "Input " + (i + 1), d.deviceId));
    select.value = value;
    select.disabled = this.recording.active;
  }
  async stopRecording() {
    $("#recordMessage").textContent = "Decoding and saving the take…";
    await this.recording.stop();
    $("#recordMessage").textContent =
      "Take kept as an audio track. Open the arrangement to edit it.";
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
    if ($("#recordPanel").open) {
      const c = $("#recordWave"),
        ctx = c.getContext("2d");
      ctx.fillStyle = "#1d2521";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = "#c4b497";
      ctx.beginPath();
      r.wave.forEach((v, i) => {
        const x = (i / r.wave.length) * c.width,
          y = 65 + v * 58;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
  }
  async openMemory() {
    this.openDialog("memoryPanel");
    await this.loadMemories();
  }
  async loadMemories() {
    const projectId = this.studio.getProject().id;
    const memories = await listMemories(projectId);
    if (projectId !== this.studio.getProject().id) return;
    this.memories = memories;
    const list = $("#memoryList");
    list.replaceChildren();
    if (!memories.length) {
      const p = document.createElement("p");
      p.textContent = "Your kept versions will appear here and in the gallery.";
      list.append(p);
    }
    for (const m of memories) {
      const b = document.createElement("button");
      b.className = "memoryVersion";
      const strong = document.createElement("strong"),
        small = document.createElement("small");
      strong.textContent = m.name;
      small.textContent =
        new Date(m.savedAt).toLocaleString() + " · Restore ↗";
      b.append(strong, small);
      b.onclick = this.safe(async () => {
        await this.studio.persist();
        await this.studio.selectProject(structuredClone(m.project));
        $("#memoryPanel").close();
        this.studio.toast("Restored " + m.name);
      });
      list.append(b);
    }
    this.architecture.updateProject(this.studio.getProject(), this.memories);
  }
  updateProject() {
    const p = this.studio.getProject();
    $("#houseProject").textContent = p.name;
    $("#houseBpm").textContent = p.bpm + " BPM";
    this.architecture.updateProject(p, this.memories);
    if(this.renderer)this.renderer.shadowMap.needsUpdate=true;
    if (this.memoryProject !== p.id) {
      this.memoryProject = p.id;
      this.loadMemories().catch((e) =>
        this.studio.toast("Versions could not be loaded: " + e.message),
      );
    }
  }
  move(dt) {
    const pos = this.camera.position;
    if (this.arrival) return;
    if (this.journey) {
      const j = this.journey;
      if(j.arrived){
        if(j.facing)this.camera.quaternion.slerp(j.facing,1-Math.exp(-dt*6));
        if(!j.facing || this.camera.quaternion.angleTo(j.facing)<.005)this.finishJourney(j);
        return;
      }
      const
        target = j.points[j.index],
        delta = target.clone().sub(pos),
        distance = delta.length(),
        speed = (j.speed || Math.min(5.5,this.speed*1.65)) * Math.min(1, .2 + distance / 3);
      if (distance < dt * speed + 0.08) {
        pos.copy(target);
        j.index++;
        if (j.index >= j.points.length) {
          j.arrived=true;
          if(!j.facing)this.finishJourney(j);
        }
      } else {
        pos.addScaledVector(delta, (dt * speed) / distance);
        const old = this.camera.quaternion.clone();
        this.camera.lookAt(target.x, 1.72, target.z);
        if(j.facing && j.index===j.points.length-1)this.camera.quaternion.slerp(j.facing,Math.max(0,1-distance/4));
        this.camera.quaternion.slerp(old, Math.exp(-dt * 5));
        this.yaw = this.camera.rotation.y;
        this.pitch = this.camera.rotation.x;
        this.lookYaw=this.yaw;this.lookPitch=this.pitch;
      }
      this.setRoom(roomAt(pos.x,pos.z).id);
      return;
    }
    let f =
        (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
        (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0),
      s =
        (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
        (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    for (const g of navigator.getGamepads?.() || []) {
      if (!g) continue;
      const axis = (v) => (Math.abs(v || 0) > 0.15 ? v : 0);
      s += axis(g.axes[0]);
      f -= axis(g.axes[1]);
      this.rotate(axis(g.axes[2]) * dt * 650, axis(g.axes[3]) * dt * 650);
      if (g.buttons[0]?.pressed && !this.gamePressed) this.interact();
      this.gamePressed = g.buttons[0]?.pressed;
      break;
    }
    this.smoothLook(dt);
    const inputLength=Math.hypot(f,s);
    if(inputLength>1){f/=inputLength;s/=inputLength;}
    let vx = (-Math.sin(this.yaw) * f + Math.cos(this.yaw) * s) * this.speed,
      vz = (-Math.cos(this.yaw) * f - Math.sin(this.yaw) * s) * this.speed;
    if (this.walkTarget) {
      const d = this.walkTarget.clone().sub(pos);
      d.y = 0;
      if (d.length() < 0.18) this.walkTarget = null;
      else {
        d.normalize();
        vx = d.x * this.speed;
        vz = d.z * this.speed;
      }
    }
    const factor = 1 - Math.exp(-dt * this.smoothing);
    this.velocity.x += (vx - this.velocity.x) * factor;
    this.velocity.y += (vz - this.velocity.y) * factor;
    const nx = pos.x + this.velocity.x * dt,
      nz = pos.z + this.velocity.y * dt;
    if (this.architecture.canWalk(nx, pos.z)) pos.x = nx;
    else this.walkTarget = null;
    if (this.architecture.canWalk(pos.x, nz)) pos.z = nz;
    else this.walkTarget = null;
    this.setRoom(roomAt(pos.x, pos.z).id);
  }
  frame(t) {
    const dt = Math.min(0.2, (t - this.last) / 1000);
    this.last = t;
    this.arrival?.update(t);
    if (document.hidden) return;
    const visibleWorld=this.mode==="house"&&!document.querySelector("dialog[open]");
    if (
      this.entered &&
      this.mode === "house" &&
      ![...document.querySelectorAll("dialog")].some((d) => d.open)
    )
      for (let elapsed = 0; elapsed < dt; elapsed += 0.025)
        this.move(Math.min(0.025, dt - elapsed));
    if(visibleWorld)this.architecture.updateDoors(this.camera.position, dt);
    if(this.renderer && this.mode==="house" && !document.querySelector("dialog[open]")){
      this.profileFrames++;
      if(t-this.profileStart>1500){
        this.fps=this.profileFrames*1000/(t-this.profileStart);this.profileFrames=0;this.profileStart=t;
        const stats=this.renderer.info.render;$("#housePerformance").textContent=this.fps.toFixed(0)+" FPS · "+stats.calls+" draws · "+Math.round(stats.triangles/1000)+"k triangles · "+this.renderer.getPixelRatio().toFixed(2)+"× resolution";
      }
    }else {this.profileStart=t;this.profileFrames=0;}
    if (t - this.lastAudio > 75 && (visibleWorld || $("#masterPanel").open)) {
      this.lastAudio = t;
      this.metrics = this.studio.engine.metrics();
      if(visibleWorld)this.architecture.updateAudio(
        this.metrics,
        this.studio.engine.beat,
        this.studio.engine.playing,
      );
      $("#housePlay").innerHTML = this.studio.engine.playing
        ? "Ⅱ <span>Pause</span>"
        : "▶ <span>Listen</span>";
      const b = this.studio.engine.beat;
      $("#housePosition").textContent =
        String(Math.floor(b / 4) + 1).padStart(2, "0") +
        " / " +
        String(Math.floor(b % 4) + 1).padStart(2, "0");
      if ($("#masterPanel").open) {
        $("#listeningPeak").textContent = db(this.metrics.peak);
        $("#listeningRms").textContent = db(this.metrics.rms);
      }
      if (!this.drag) this.findInteraction();
    }
    if (visibleWorld && t - this.lastScreen > 600) {
      this.lastScreen = t;
      this.architecture.updateScreens(
        this.studio.getProject(),
        this.metrics,
        this.recording,
      );
    }
    if (this.mode === "house" && !document.querySelector("dialog[open]"))
      this.renderer?.render(this.scene, this.camera);
  }
  fallback() {
    this.renderer?.setAnimationLoop(null);
    this.renderer = null;
    this.entered = true;
    this.journey = null;
    $("#arrival").hidden = true;
    $("#houseFallback").hidden = false;
    this.production("arrange");
    $("#houseModeButton").textContent = "Choose tools";
    $("#returnHouse").textContent = "Choose another room";
    document.body.classList.add("graphicsFallback");
    if (!this.fallbackFrame) {
      this.fallbackFrame = true;
      const tick = (t) => {
        this.frame(t);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }
}
