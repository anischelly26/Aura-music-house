import * as THREE from "three";
import { SpatialTimeline } from "./objects/timeline.js";
import { DrumMachine, Synth, Mixer } from "./objects/instruments.js";
import { Turntable } from "./objects/vinyl.js";
import { AuraHalo } from "./objects/presence.js";
import { GameConsole } from "./objects/console.js";
import { Phone } from "../system/phone.js";
import { Mentor } from "../system/mentor.js";
import { Guide } from "../system/guide.js";
import { coverArt } from "../system/playback.js";

const W = Math.PI / 2;

/** Everything that lives in the house and needs the finished world to exist first. */
export function install(world) {
  const a = world.architecture, place = (device) => { a.roomExtras.get(device.room).push(device.group); device.group.visible = a.roomGroups.get(device.room).visible; return device; };
  // The living room: every part of a track within a few steps of the sofa.
  world.timeline = place(new SpatialTimeline(world));
  world.mixer = place(new Mixer(world, { room: "living", position: [8.02, 0.86, -6.22], rotation: -W }));
  world.synth = place(new Synth(world, { room: "living", position: [8, 0.86, -4.9], rotation: -W }));
  world.drums = place(new DrumMachine(world, { room: "living", position: [8, 0.86, -3.72], rotation: -W }));
  world.turntable = place(new Turntable(world, { room: "living", position: [-6.15, 0.72, -8.47] }));
  world.console = place(new GameConsole(world, { room: "living", position: [1.9, 0.56, -4.95] }));
  world.aura = new AuraHalo(world, { room: "living", position: [0.1, 2.3, 3.02], ceiling: 7.42 });
  // The rooms beyond hold the larger instruments.
  place(new Synth(world, { name: "synth-room", room: "instrument", position: [-26.5, 0.84, 8.2], rotation: Math.PI }));
  place(new DrumMachine(world, { name: "drum-room", room: "rhythm", position: [14.2, 0.9, -6.2] }));
  place(new Mixer(world, { name: "desk", room: "master", position: [0, 0.8, -23.42], scale: 1.9 }));
  world.lab = new AuraHalo(world, { room: "idea", position: [-20, 2.5, 20], scale: 1.9, ceiling: 6.3 });
  // The wall is the arrangement: aiming at it takes you to the table to work on it.
  a.usable(a.wallScreen.mesh, { verb: "COMPOSE", label: "AT THE TABLE", range: 9, run: () => world.timeline.enter() });

  // The open project hangs in the entry as its own sleeve.
  const art = a.galleryArt, hang = () => {
    const p = world.studio.getProject(), piece = world.playback.projectPiece();
    art.canvas.getContext("2d").drawImage(world.playback.cover(piece, 512), 0, 0, art.canvas.width, art.canvas.height);
    art.texture.needsUpdate = true;
    return p;
  };
  world.events.addEventListener("project", hang);
  world.whenFontsReady(() => { world.playback.covers.clear(); hang(); });
  hang();
  // Kept versions stand on the ledge by the door.
  const rail = a.memoryRail, cards = Array.from({ length: 5 }, (_, i) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.008), [a.m.paper, a.m.paper, a.m.paper, a.m.paper, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }), a.m.paper]);
    mesh.position.set(-2.2 + i * 1.1, 0.21, 0.04);
    mesh.rotation.x = -0.14;
    mesh.castShadow = true;
    mesh.visible = false;
    rail.add(mesh);
    a.usable(mesh, { verb: "OPEN", label: "KEPT VERSIONS", range: 4, run: () => world.openMemory() });
    return { mesh, canvas, texture };
  });
  world.events.addEventListener("memories", () => cards.forEach((card, i) => {
    const memory = world.memories[i];
    card.mesh.visible = !!memory;
    if (!memory) return;
    card.canvas.getContext("2d").drawImage(coverArt({ seed: memory.id, title: memory.name, subtitle: new Date(memory.savedAt).toLocaleDateString(), size: 256 }), 0, 0);
    card.texture.needsUpdate = true;
  }));

  world.phone = new Phone(world);
  world.mentor = new Mentor(world);
  world.guide = new Guide(world);
  world.hud.now();
}
