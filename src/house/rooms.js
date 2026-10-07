import * as THREE from "three";
import { Kit } from "./props.js";
import { palette } from "./materials.js";

const W = Math.PI / 2; // quarter turn

/**
 * Each room is dressed for one part of making music. Coordinates are local to the
 * room's centre; everything placed here has a reason to be in that room.
 */
export function dress(a, g, r) {
  const m = a.m, kit = new Kit(a, g, Number(r.number) * 451);
  /** Somewhere to sit. `eye` and `exit` are local; they are resolved to world space once. */
  const seat = (mesh, { label, eye, yaw = 0, exit, pitch }) => {
    const entry = { id: r.id + ":" + label, label, room: r.id, yaw, pitch, eye: g.localToWorld(new THREE.Vector3(...eye)), exit: (() => { const p = g.localToWorld(new THREE.Vector3(exit[0], 0, exit[1])); return { x: p.x, z: p.z }; })() };
    a.seats.push(entry);
    a.usable(mesh, { verb: "SIT", label, range: 3.4, run: () => a.world?.sit(entry) });
    return entry;
  };
  const caption = (text, x, y, z, rotation, width = 1.5) => a.type(text, { x, y, z, rotation, width, parent: g, style: "mono", size: 60, color: "#3a332c", canvasHeight: 128 });
  g.updateMatrixWorld(true);

  if (r.id === "gallery") {
    a.rug(0, 0.5, 3.2, 15, g, m.rugWarm);
    // The open project hangs ahead on the left, with an empty frame beside it.
    a.galleryArt = a.artFrame(g, -8.8, 2.35, -4.6, 2.7, 2.7, W, 768);
    a.action(a.galleryArt.art, { type: "projects" });
    caption("NOW OPEN", -8.8, 0.82, -4.6, W, 1.1);
    const blank = a.artFrame(g, -8.8, 2.1, -8.2, 1.5, 1.5, W, 256), c = blank.canvas.getContext("2d");
    c.fillStyle = "#e9dfcc"; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = palette.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(128, 100); c.lineTo(128, 156); c.moveTo(100, 128); c.lineTo(156, 128); c.stroke();
    blank.texture.needsUpdate = true;
    a.action(blank.art, { type: "new" });
    caption("AN EMPTY FRAME", -8.8, 1.18, -8.2, W, 1.1);
    // A statement painted on the wall opposite, read as you step inside.
    a.type("MAKE\nSOMETHING\nTHAT DIDN'T\nEXIST\nYESTERDAY.", { x: 8.8, y: 3.05, z: -6.6, rotation: -W, width: 5.6, height: 5.2, parent: g, style: "display", size: 168, color: "#231d18", align: "left", canvasWidth: 1024, canvasHeight: 950, opacity: 0.92 });
    // Kept versions live on a picture ledge.
    kit.box(0.14, 0.03, 6.4, -8.74, 1.12, 6.4, m.walnut);
    a.memoryRail = kit.group(-8.72, 1.14, 6.4, W);
    a.memoryRail.userData.keep = true;
    caption("KEPT VERSIONS", -8.8, 0.9, 6.4, W, 1.3);
    kit.table(8.35, 6.6, 0.42, 2.2, { h: 0.82 });
    kit.tableLamp(8.35, 0.82, 7.3);
    kit.books(8.35, 0.82, 6.4, 4, 0.3);
    kit.clock(8.8, 2.5, 6.6, -W, 0.24);
    const bench = kit.bench(8.2, 3.5, 1.8, { rotation: W });
    seat(bench.seat, { label: "BENCH", eye: [8.05, 1.2, 3.5], yaw: W, exit: [7.2, 3.5] });
    kit.plant(7.6, 9.7, 2.6);
    kit.plant(-7.7, 9.8, 2.1);
    kit.plant(-7.6, -1.6, 1.9);
    kit.floorLamp(-7.6, 2.6);
    kit.sculpture(7.4, -1.4, { kind: 1 });
  } else if (r.id === "living") {
    // The media wall: a dark slab that holds the arrangement, the hi-fi and the console.
    kit.box(8.8, 3.7, 0.5, 0, 1.85, -5.6, m.dark);
    kit.solid(0, -5.6, 8.8, 0.5);
    a.wallScreen = a.screen(g, 0, 2.3, -5.342, 6.4, 2.6, "wall", 0, { frame: false, resolution: 1536 });
    a.type("SOUND\nHAS\nA HOME.", { x: 0, y: 1.95, z: -5.86, rotation: Math.PI, width: 6, height: 3.2, parent: g, style: "display", size: 250, color: "#ffd9ae", glow: true, opacity: 0.42, align: "left", canvasWidth: 1024, canvasHeight: 546 });
    kit.credenza(0, -4.98, 6.6, { h: 0.56, d: 0.52 });
    kit.box(1.5, 0.1, 0.16, 0, 0.61, -5.06, m.black);
    kit.tableLamp(-2.95, 0.56, -5);
    kit.sleeves(-1.75, 0.56, -5.14, 5, 0.1);
    kit.books(2.85, 0.56, -5, 5, -0.2);
    kit.speaker(-5.5, -5.25, { rotation: 0.14 });
    kit.speaker(5.5, -5.25, { rotation: -0.14 });
    // The sunken lounge.
    kit.box(4.8, 0.016, 3.6, -0.2, -0.442, 2.9, m.rug).castShadow = false;
    kit.tableLamp(-3.93, 0.34, 5.35, { light: true });
    kit.books(-3.93, 0.34, 4.6, 3, 1.4);
    kit.plant(-3.93, -0.9, 0.9, { y: 0.34 });
    kit.sleeves(1.9, 0.34, 6.3, 4, 0);
    kit.headphones(-1.6, 0.34, 6.22, 0.4);
    kit.mug(0.7, 0.34, 6.18);
    kit.notebook(3.2, 0.34, 6.2, 0.5);
    // Production desk along the east wall: synth, pads and console sit here.
    kit.table(8.05, -4.72, 1.05, 4.5, { h: 0.86 });
    kit.box(0.9, 0.6, 0.55, 8.05, 0.3, -6.55, m.walnut);
    kit.monitor(8.32, 0.86, -6.82, -W + 0.3);
    kit.monitor(8.32, 0.86, -2.66, -W - 0.3);
    kit.tableLamp(8.36, 0.86, -5.82);
    kit.mug(7.72, 0.86, -3.12);
    kit.panels(8.8, 2.75, -4.72, 5, 2, { rotation: -W });
    kit.cable([[8.45, 0.86, -6.5], [8.52, 0.5, -6.7], [8.62, 0.03, -7.1], [8.62, 0.03, -8.4]], 2);
    const chair = kit.chair(6.7, -2.9, W + 0.5);
    a.live(chair.group);
    seat(chair.seat, { label: "STUDIO CHAIR", eye: [6.7, 1.22, -2.9], yaw: W + 0.5 - Math.PI, pitch: -0.2, exit: [6, -2.9] });
    // Vinyl corner.
    a.rug(-6.1, -5.5, 3.6, 4.4, g, m.rugWarm);
    kit.shelf(-8.63, -5.5, 5.6, 2.3, { rotation: W, fill: "records", rows: 6 });
    kit.credenza(-5.5, -8.47, 2.8, { h: 0.72, d: 0.5 });
    kit.box(0.46, 0.13, 0.34, -4.75, 0.785, -8.47, m.metal);
    for (let i = 0; i < 5; i++) kit.cyl(0.014, 0.016, -4.92 + i * 0.085, 0.76, -8.29, m.black, g, 10).rotation.x = W;
    kit.box(0.14, 0.05, 0.004, -4.75, 0.815, -8.298, m.led);
    kit.crate(-7.5, -7.6, 0.25);
    kit.crate(-3.55, -8.35, -0.1);
    kit.floorLamp(-7.9, -2.75, { light: true });
    kit.plant(-2.9, -8.3, 2.3);
    a.type("AURA", { x: -8.8, y: 3.6, z: -5.5, rotation: W, width: 2.2, parent: g, style: "display", size: 200, color: "#2a221c", opacity: 0.16 });
    // Reading nook.
    a.rug(6.3, 5.9, 3.8, 3.6, g, m.rug);
    kit.shelf(5.6, 8.63, 5.4, 2.3, { rotation: Math.PI, fill: "books", rows: 5 });
    kit.credenza(8.3, 5.1, 1.6, { rotation: -W, h: 0.5, d: 0.46 });
    kit.floorLamp(7.6, 7.5);
    kit.table(5.2, 7.1, 0.5, 0.5, { h: 0.46, solid: false });
    kit.books(5.2, 0.46, 7.1, 3, 0.4);
    kit.mug(5.34, 0.46, 6.95);
    kit.clock(5.2, 3.1, -8.8, 0, 0.26);
    // Things that suggest a life: a guitar left out, an amp, something growing.
    kit.guitar(-7.5, 7.1, 0.7);
    kit.amp(-8.25, 5.5, W);
    kit.plant(-6.3, 8.1, 2.7);
    kit.plant(-8.1, 8, 1.5);
    kit.poster(-8.8, 2.5, 4.3, 1.4, 1.9, W, { kind: "rings", text: "AURA — FIRST PRESSING", seed: 3 });
    kit.poster(-8.8, 2.25, 6.3, 0.9, 1.25, W, { kind: "type", text: "PLAY\nIT\nAGAIN", seed: 5, ground: palette.ember, ink: palette.ink });
  } else if (r.id === "instrument") {
    a.rug(-2, -3, 6.6, 6.2, g, m.rugWarm);
    piano(a, g, kit, -2, -2, seat);
    // A wall of modules, patched and breathing.
    kit.box(4.5, 0.86, 0.5, -6.6, 0.43, -8.5, m.walnut);
    kit.solid(-6.6, -8.5, 4.5, 0.5);
    kit.modular(-6.6, 0.88, -8.42, 4.2, 1.42);
    a.scopeScreen = a.screen(g, -3.55, 1.5, -8.5, 0.62, 0.44, "scope", 0, { resolution: 256 });
    kit.box(0.7, 0.9, 0.42, -3.55, 0.45, -8.55, m.walnut);
    kit.box(0.7, 0.62, 0.36, -3.55, 1.52, -8.72, m.black);
    kit.stool(-6.2, -7.3);
    kit.cable([[-4.5, 0.9, -8.3], [-4.2, 0.4, -8.1], [-3.9, 0.03, -7.9], [-3.2, 0.03, -7.2]], 0);
    // Second synth station, by the south wall.
    kit.table(-6.5, 8.2, 2.7, 0.85, { h: 0.84 });
    kit.monitor(-7.65, 0.84, 8.3, Math.PI - 0.3, 0.9);
    kit.monitor(-5.35, 0.84, 8.3, Math.PI + 0.3, 0.9);
    kit.poster(-6.5, 2.6, 8.8, 1.5, 1.1, Math.PI, { kind: "wave", text: "ONE OSCILLATOR IS ENOUGH TO BEGIN", seed: 8 });
    a.pianoWall = a.screen(g, 10.79, 2.7, -5.5, 5.4, 2.2, "piano", -W);
    a.action(a.pianoWall.mesh, { type: "tool", room: "instrument" });
    kit.guitar(10.15, 3.6, -W, m.felt);
    kit.guitar(10.15, 4.7, -W, m.ivory);
    kit.amp(10.35, 6.3, -W);
    kit.rack(10.45, 7.8, { rotation: -W, units: 6 });
    kit.curtain(-10.55, -4.6, 8.4, { rotation: W });
    kit.plant(-9.4, 7.7, 2.5);
    kit.plant(-9.5, 1.2, 1.6);
    kit.floorLamp(-8.6, 5.6);
    kit.floorLamp(8.4, -1.9);
    kit.sculpture(8.2, 7.9, { kind: 2 });
  } else if (r.id === "rhythm") {
    // The step circle: three rings of sixteen, one ring per voice.
    kit.box(7, 0.36, 7, 1, 0.18, -1, m.walnut);
    kit.solid(1, -1, 7, 7, 0.34);
    kit.cyl(3.6, 0.1, 1, 0.41, -1, m.black, g, 72);
    a.pulse = new THREE.MeshBasicMaterial({ color: palette.ember, toneMapped: false });
    a.pulse.userData.glow = 2.6;
    for (const [w, d, x, z] of [[7.04, 0.02, 1, 2.52], [7.04, 0.02, 1, -4.52], [0.02, 7.04, 4.52, -1], [0.02, 7.04, -2.52, -1]]) a.live(kit.box(w, 0.02, d, x, 0.04, z, a.pulse));
    const padItems = [], lampItems = [];
    for (let ring = 0; ring < 3; ring++)
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2, radius = 1.5 + ring * 0.75, x = 1 + Math.sin(angle) * radius, z = -1 + Math.cos(angle) * radius;
        a.pads.push({ step: i, pitch: [36, 38, 42][ring], index: padItems.length, state: -1 });
        padItems.push({ matrix: new THREE.Matrix4().makeTranslation(x, 0.49, z), action: { type: "step", step: i, pitch: [36, 38, 42][ring] } });
        lampItems.push({ matrix: new THREE.Matrix4().makeTranslation(x, 0.523, z) });
      }
    a.instanced(new THREE.CylinderGeometry(0.15, 0.18, 0.06, 18), new THREE.MeshStandardMaterial({ color: "#26221f", roughness: 0.6 }), padItems, g);
    a.padLamps = a.instanced(new THREE.CylinderGeometry(0.118, 0.118, 0.008, 18), new THREE.MeshBasicMaterial({ toneMapped: false }), lampItems, g);
    a.padColors = [new THREE.Color("#191614"), new THREE.Color("#d8b27c"), new THREE.Color("#ff7a3c").multiplyScalar(1.5), new THREE.Color("#4d4238")];
    for (let i = 0; i < lampItems.length; i++) a.padLamps.setColorAt(i, a.padColors[0]);
    a.type("KICK  ·  SNARE  ·  HAT", { x: 1, y: 0.48, z: 3.3, tilt: -W, width: 2.6, parent: g, style: "mono", size: 52, color: "#c9b99f", canvasHeight: 110 });
    a.rug(-6, 5.2, 3.8, 3.4, g, m.rugWarm);
    kit.drumKit(-6, 5.2, 2.5);
    kit.table(-5.8, -6.2, 1.2, 0.62, { h: 0.9 });
    kit.stool(-5.8, -5.3, { h: 0.6 });
    a.rhythmWall = a.screen(g, 6.6, 2.6, 8.79, 7.2, 2.2, "drums", Math.PI);
    a.action(a.rhythmWall.mesh, { type: "tool", room: "rhythm" });
    kit.slats(6.6, 2.5, -8.8, 8.4, 4.4);
    kit.panels(-6.6, 2.7, -8.8, 6, 3);
    kit.panels(-10.8, 2.7, 5.6, 5, 3, { rotation: W });
    kit.panels(-10.8, 2.7, -5.6, 5, 3, { rotation: W });
    kit.rack(-9.9, -7.8, { rotation: W, units: 7 });
    kit.curtain(10.55, 4.8, 7.6, { rotation: -W });
    kit.plant(9.4, -7.8, 2.4);
    kit.floorLamp(-9.2, 8);
    kit.floorLamp(8.8, 7.6);
    kit.poster(-6.6, 2.6, 8.8, 1.3, 1.8, Math.PI, { kind: "blocks", text: "COUNT TO FOUR", seed: 21 });
  } else if (r.id === "record") {
    // The booth: glass on two sides, treated wall behind, the view to the east.
    kit.box(0.06, 3.3, 7.9, 2.9, 1.65, 6.85, m.glass).castShadow = false;
    kit.box(2.2, 3.3, 0.06, 4, 1.65, 2.9, m.glass).castShadow = false;
    kit.box(4.3, 3.3, 0.06, 8.65, 1.65, 2.9, m.glass).castShadow = false;
    kit.box(7.9, 0.06, 0.1, 6.85, 3.33, 2.9, m.bronze);
    kit.box(0.1, 0.06, 7.9, 2.9, 3.33, 6.85, m.bronze);
    for (const x of [5.1, 6.5]) kit.box(0.05, 3.3, 0.1, x, 1.65, 2.9, m.bronze);
    a.solid(g, 2.9, 6.85, 0.06, 7.9, 0.26);
    a.solid(g, 4, 2.9, 2.2, 0.06, 0.26);
    a.solid(g, 8.65, 2.9, 4.3, 0.06, 0.26);
    a.rug(6.8, 6.8, 5.4, 5.6, g, m.rugWarm);
    kit.microphone(6.9, 6.9, { rotation: -2.4, room: "record" });
    kit.stool(7.9, 8, { h: 0.62 });
    kit.box(0.5, 0.02, 0.36, 5.7, 1.25, 7.9, m.black).rotation.x = -0.5;
    kit.cyl(0.012, 1.25, 5.7, 0.625, 8, m.chrome, g, 6);
    kit.panels(6.8, 2, 10.8, 10, 4, { rotation: Math.PI, size: 0.6 });
    kit.headphones(7.9, 0.66, 8, 0.6);
    // Control position, facing the glass.
    kit.table(-0.6, 5.6, 1.15, 3.3, { h: 0.82 });
    a.recordingScreen = a.screen(g, -0.3, 1.2, 5.6, 1.5, 0.6, "recording", -W, { resolution: 768 });
    a.action(a.recordingScreen.mesh, { type: "tool", room: "record" });
    kit.box(0.04, 0.12, 0.3, -0.3, 0.86, 5.6, m.black);
    kit.monitor(-0.4, 0.82, 4.25, -W + 0.3);
    kit.monitor(-0.4, 0.82, 6.95, -W - 0.3);
    kit.headphones(-0.9, 0.82, 6.3, 1.1);
    kit.notebook(-0.85, 0.82, 4.9, 0.2);
    kit.mug(-1, 0.82, 5.45);
    kit.tableLamp(-0.75, 0.82, 4.45);
    const chair = kit.chair(-1.95, 5.6, W);
    a.live(chair.group);
    seat(chair.seat, { label: "CONTROL CHAIR", eye: [-1.95, 1.22, 5.6], yaw: -W, exit: [-2.8, 5.6] });
    kit.cable([[-0.2, 0.82, 5.2], [0.6, 0.03, 5.1], [2.2, 0.03, 4.2], [5.6, 0.03, 4.6], [6.8, 0.03, 6.6]], 2);
    kit.rack(-10.3, 7.6, { rotation: W, units: 6 });
    kit.slats(-6.6, 2.5, 10.8, 8.4, 4.4, { rotation: Math.PI });
    kit.diffuser(-6.6, 2.7, -10.8, 3.4, 2);
    kit.diffuser(6.6, 2.7, -10.8, 3.4, 2);
    kit.curtain(10.55, -4.2, 13, { rotation: -W });
    kit.plant(-9.6, 9.6, 2.4);
    kit.floorLamp(-9.4, -9.4);
    kit.poster(-10.8, 2.6, 5.4, 1.2, 1.7, W, { kind: "type", text: "ONE\nMORE\nTAKE", seed: 31 });
  } else if (r.id === "arrange") {
    // The archive: stacks of records you can walk between.
    for (const [x, rotation] of [[-7.2, W], [-6.78, -W], [-3.2, W], [-2.78, -W]]) kit.shelf(x, -4.6, 6.4, 2.25, { rotation, fill: "records", rows: 6, depth: 0.38 });
    a.type("A — M", { x: -6.99, y: 2.42, z: -1.2, width: 0.6, parent: g, style: "mono", size: 90, color: "#3a332c", canvasWidth: 512, canvasHeight: 128 });
    a.type("N — Z", { x: -2.99, y: 2.42, z: -1.2, width: 0.6, parent: g, style: "mono", size: 90, color: "#3a332c", canvasWidth: 512, canvasHeight: 128 });
    // Tape station.
    kit.table(5.2, -7.6, 3, 0.85, { h: 0.82 });
    kit.tape(4.3, 0.82, -7.6);
    kit.cassetteDeck(5.35, 0.82, -7.62);
    kit.cassetteDeck(5.35, 0.94, -7.62);
    kit.headphones(6.2, 0.82, -7.5, -0.5);
    kit.sleeves(6.4, 0.82, -7.85, 4, 0);
    kit.stool(5.1, -6.6, { h: 0.55 });
    kit.crate(3.4, -6.1, 0.3);
    kit.crate(6.9, -6.3, -0.2);
    kit.crate(7.4, -6.9, 0.5);
    a.rug(5.2, -6.6, 5.4, 3.4, g, m.rug);
    a.arrangementWall = a.screen(g, -6.6, 2.7, 10.79, 8, 2.4, "timeline", Math.PI, { resolution: 1536 });
    a.action(a.arrangementWall.mesh, { type: "tool", room: "arrange" });
    const bench = kit.bench(-6.6, 7.2, 3.2);
    seat(bench.seat, { label: "BENCH", eye: [-6.6, 1.2, 7.2], yaw: Math.PI, exit: [-6.6, 6.2] });
    kit.poster(10.8, 2.7, -8.6, 1.3, 1.8, -W, { kind: "rings", text: "SIDE A", seed: 41 });
    kit.poster(10.8, 2.7, -6.6, 1.3, 1.8, -W, { kind: "wave", text: "SIDE B", seed: 42, ground: palette.ink, ink: palette.bone });
    kit.poster(10.8, 2.7, -4.6, 1.3, 1.8, -W, { kind: "blocks", text: "45 RPM", seed: 43 });
    kit.curtain(-10.55, 5.6, 7, { rotation: W });
    kit.plant(9.6, -9.6, 2.6);
    kit.plant(-9.5, 9.4, 1.9);
    kit.floorLamp(8.6, -9.2);
    kit.floorLamp(-9.6, 5.2);
    kit.guitar(9.9, 8.2, -2.2, m.ivory);
  } else if (r.id === "master") {
    a.rug(0, -2.8, 6.8, 6.6, g, m.rug);
    // The desk faces the glass and the long view.
    kit.table(0, -3.4, 3.8, 1.35, { h: 0.8 });
    for (const side of [-1, 1]) {
      kit.cyl(0.035, 1.12, side * 2.45, 0.56, -5.5, m.black, g, 10);
      kit.cyl(0.2, 0.03, side * 2.45, 0.015, -5.5, m.black, g, 20);
      kit.box(0.34, 0.03, 0.34, side * 2.45, 1.13, -5.5, m.black);
      kit.monitor(side * 2.45, 1.145, -5.5, -side * 0.42, 1.5);
      a.solid(g, side * 2.45, -5.5, 0.4, 0.4, 0.2);
    }
    a.masterScreen = a.screen(g, 0, 1.36, -4.02, 2.5, 0.6, "master", 0, { resolution: 1024 });
    a.action(a.masterScreen.mesh, { type: "tool", room: "master" });
    for (const side of [-1, 1]) kit.box(0.04, 0.26, 0.04, side * 1.1, 0.93, -4.04, m.black);
    const chair = kit.chair(0, -2.15, Math.PI);
    a.live(chair.group);
    seat(chair.seat, { label: "MIX POSITION", eye: [0, 1.24, -2.15], yaw: 0, exit: [0, -1.2] });
    const couch = kit.bench(0, 6.6, 3.4, { d: 0.9, h: 0.46, top: m.fabric });
    a.cushion(3.4, 0.5, 0.22, 0, 0.68, 7.05, m.fabric, g);
    seat(couch.seat, { label: "LISTENING COUCH", eye: [0, 1.18, 6.7], yaw: 0, exit: [0, 5.6] });
    kit.rack(-6.2, -3.4, { rotation: W, units: 8 });
    kit.rack(6.2, -3.4, { rotation: -W, units: 8 });
    kit.panels(-8.8, 2.8, -6.6, 6, 3, { rotation: W });
    kit.panels(8.8, 2.8, -6.6, 6, 3, { rotation: -W });
    kit.panels(-8.8, 2.8, 6.6, 6, 3, { rotation: W, mats: [m.fabric, m.rug] });
    kit.panels(8.8, 2.8, 6.6, 6, 3, { rotation: -W, mats: [m.fabric, m.rug] });
    kit.diffuser(-5.6, 2.7, 10.8, 3.6, 2.2, Math.PI);
    kit.diffuser(5.6, 2.7, 10.8, 3.6, 2.2, Math.PI);
    kit.floorLamp(-7.4, 8.6);
    kit.floorLamp(7.4, 8.6);
    kit.plant(7.6, -9.4, 2.4);
    kit.curtain(-6.2, -10.55, 5, {});
    kit.tableLamp(1.6, 0.8, -3.75);
    kit.notebook(-1.55, 0.8, -3.0, -0.3);
    kit.mug(1.62, 0.8, -3.05);
  } else if (r.id === "idea") {
    // Almost nothing here but a ring of stone, a place to sit and a place to ask.
    kit.cyl(2.3, 0.12, 0, 0.06, 0, m.concrete, g, 64);
    kit.cyl(1.9, 0.02, 0, 0.125, 0, m.water, g, 64).castShadow = false;
    kit.solid(0, 0, 4.2, 4.2, 0.1);
    a.labCentre = g.localToWorld(new THREE.Vector3(0, 0, 0));
    const bench = kit.bench(0, 4.6, 3.6, { top: m.fabric });
    seat(bench.seat, { label: "BENCH", eye: [0, 1.2, 4.6], yaw: 0, exit: [0, 5.6] });
    // The lectern: describe a feeling, receive an editable beginning.
    kit.box(0.5, 1.02, 0.36, 4.2, 0.51, -1.4, m.walnut);
    const desk = kit.box(0.62, 0.03, 0.44, 4.2, 1.05, -1.38, m.black);
    desk.rotation.x = 0.28;
    a.action(desk, { type: "tool", room: "idea" });
    a.solid(g, 4.2, -1.4, 0.5, 0.4, 0.26);
    a.type("DESCRIBE A FEELING", { x: 4.2, y: 0.78, z: -1.21, width: 0.42, parent: g, style: "mono", size: 56, color: "#e8dcc6", canvasHeight: 110 });
    a.type("ASK.", { x: 0, y: 3.4, z: 10.8, rotation: Math.PI, width: 3.4, parent: g, style: "display", size: 230, color: "#2a231d", opacity: 0.86, canvasHeight: 300 });
    a.type("SKETCH.  BEGIN.", { x: 0, y: 2.55, z: 10.8, rotation: Math.PI, width: 2.2, parent: g, style: "mono", size: 56, color: "#3a332c", canvasHeight: 110 });
    kit.curtain(-10.55, -5.2, 9, { rotation: W });
    kit.plant(9.4, 9.4, 2.8);
    kit.plant(9.6, -9.5, 2);
    kit.floorLamp(-9, 9.2);
    kit.sculpture(-8.6, -8.4, { kind: 0 });
  } else if (r.id === "terrace") {
    for (let i = 0; i < 7; i++) kit.box(2.7, 0.05, 20.6, -9.1 + i * 3.02, 0.026, 0, m.wood).castShadow = false;
    kit.box(13, 0.04, 3.6, 0.5, 0.06, -8.2, m.water).castShadow = false;
    kit.box(13.3, 0.12, 0.15, 0.5, 0.09, -6.35, m.concrete);
    kit.box(22, 0.16, 0.24, 0, 4.9, 6.6, m.walnut);
    for (const x of [-9.6, 9.6]) kit.box(0.2, 4.9, 0.2, x, 2.45, 6.6, m.walnut);
    for (let i = 0; i < 12; i++) kit.box(0.08, 0.12, 4.6, -9 + i * 1.64, 5, 8.8, m.walnut);
    const bench = kit.bench(-4.4, 3, 4.6, { d: 0.9, h: 0.42, top: m.fabric });
    seat(bench.seat, { label: "DAYBED", eye: [-4.4, 1.12, 3], yaw: Math.PI * 0.82, exit: [-4.4, 1.8] });
    kit.table(-4.4, 1.4, 1.2, 0.6, { h: 0.34, solid: false });
    kit.box(0.5, 0.8, 0.5, 3, 0.4, -3, m.concrete);
    a.solid(g, 3, -3, 0.5, 0.5, 0.26);
    a.exportSculpture = a.action(kit.mesh(new THREE.TorusKnotGeometry(0.46, 0.085, 110, 12), m.bronze.clone(), 3, 1.5, -3), { type: "tool", room: "terrace" });
    a.type("LET IT LEAVE THE HOUSE.", { x: 3, y: 0.56, z: -2.74, width: 0.46, parent: g, style: "mono", size: 50, color: "#3a332c", canvasHeight: 100 });
    for (const [x, z, h] of [[-8.6, 8.6, 2.8], [8.4, 8.4, 2.4], [8.8, -3.2, 2], [-8.8, -4.4, 2.2]]) kit.plant(x, z, h);
    kit.floorLamp(-7.4, 4.4, { height: 0.5 });
    kit.floorLamp(6.4, 3.2, { height: 0.5 });
    kit.floorLamp(-1.2, -5.6, { height: 0.5 });
  }
}

/** The grand: eighty-eight individually playable keys and a lid propped open. */
function piano(a, g, kit, x, z, seat) {
  const SCALE = 0.78;
  const m = a.m, body = new THREE.Group();
  body.position.set(x, 0, z);
  body.rotation.y = -0.2;
  // Built large so each key is easy to strike, then brought down until the bench is a real bench.
  body.scale.setScalar(SCALE);
  g.add(body);
  body.updateMatrixWorld(true);
  const shape = new THREE.Shape();
  shape.moveTo(-1.6, -0.2);
  shape.lineTo(1.6, -0.2);
  shape.bezierCurveTo(2.1, -1.7, 1.7, -3.5, 0.7, -3.8);
  shape.bezierCurveTo(-0.6, -3.9, -1.65, -2.4, -1.6, -0.2);
  const lacquer = new THREE.MeshStandardMaterial({ color: "#0b0a09", roughness: 0.12, metalness: 0.3, envMapIntensity: 1.4 });
  const shell = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.04, bevelThickness: 0.04 }), lacquer);
  shell.rotation.x = Math.PI / 2;
  shell.position.y = 1.45;
  shell.castShadow = shell.receiveShadow = true;
  body.add(shell);
  a.action(shell, { type: "instrument", instrument: "keys" });
  a.box(3.2, 0.18, 0.65, 0, 1.2, 0.18, lacquer, body);
  const white = Array.from({ length: 88 }, (_, i) => i + 21).filter((p) => ![1, 3, 6, 8, 10].includes(p % 12)), width = 3.04 / white.length;
  const whites = [], blacks = [], key = (kx, ky, kz, pitch) => ({ matrix: new THREE.Matrix4().makeTranslation(kx, ky, kz), action: { type: "note", pitch }, pitch, depth: 0, down: false });
  for (const [i, pitch] of white.entries()) {
    const kx = -1.52 + (i + 0.5) * width;
    whites.push(key(kx, 1.315, 0.25, pitch));
    if (pitch < 108 && [0, 2, 5, 7, 9].includes(pitch % 12)) blacks.push(key(kx + width / 2, 1.35, 0.12, pitch + 1));
  }
  a.instanced(new THREE.BoxGeometry(width - 0.003, 0.05, 0.46), m.ivory, whites, body);
  a.instanced(new THREE.BoxGeometry(width * 0.6, 0.075, 0.27), m.black, blacks, body);
  a.pianoKeys = [...whites, ...blacks];
  for (const [lx, lz] of [[-1.25, 0.25], [1.25, 0.25], [0.5, -3.15]]) a.box(0.14, 1.05, 0.14, lx, 0.525, lz, lacquer, body);
  const lid = a.box(3.3, 0.06, 2.9, 0, 1.92, -1.9, lacquer, body);
  lid.rotation.z = -0.22;
  a.box(0.03, 0.8, 0.03, 1.15, 1.65, -2.6, m.bronze, body);
  for (let i = 0; i < 3; i++) a.box(0.06, 0.02, 0.16, -0.14 + i * 0.14, 0.09, 0.42, m.bronze, body);
  const bench = a.box(1.5, 0.1, 0.5, 0, 0.6, 1.5, m.leather, body);
  for (const lx of [-0.62, 0.62]) a.box(0.05, 0.55, 0.4, lx, 0.275, 1.5, lacquer, body);
  a.type("AURA", { x: 0, y: 1.22, z: 0.512, width: 0.36, parent: body, style: "display", size: 150, color: "#c9a56a", canvasWidth: 512, canvasHeight: 150 });
  const world = (lx, ly, lz) => g.worldToLocal(body.localToWorld(new THREE.Vector3(lx, ly, lz)));
  // Seated, the eyes are a forearm above the keys and the whole keyboard is in reach of the cursor.
  const eye = world(0, 1.62, 1.45), exit = world(0, 0, 2.5);
  // From the bench a click that misses a key lands on the case; it should do nothing rather than open the editor.
  seat(bench, { label: "PIANO", eye: [eye.x, eye.y, eye.z], yaw: -0.2, pitch: -0.3, exit: [exit.x, exit.z] }).own = [shell];
  a.solid(g, x - 0.2 * SCALE, z - 1.9 * SCALE, 3.6 * SCALE, 4.4 * SCALE, 0.3);
  a.contact(x - 0.2 * SCALE, z - 1.6 * SCALE, 5.4 * SCALE, 6.4 * SCALE, g);
}
