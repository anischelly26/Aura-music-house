import * as THREE from "three";
import { palette } from "../../house/materials.js";

/**
 * AURA's body in the house: three brass rings around a small warm light, hung
 * where you can always find it. Asleep, the rings drift out of plane. Called,
 * they settle into one halo and the light opens.
 */
export class AuraHalo {
  constructor(world, { position, scale = 1, room, ceiling = 7.4, label = "AURA" }) {
    this.w = world;
    this.room = room;
    this.name = "aura:" + room;
    this.reach = 1600;
    this.awake = 0;
    this.target = 0;
    this.voice = 0;
    this.point = 0;
    const a = world.architecture, m = a.m;
    this.group = new THREE.Group();
    this.group.position.set(...position);
    world.scene.add(this.group);
    this.inner = new THREE.Group();
    this.inner.scale.setScalar(scale);
    this.group.add(this.inner);
    const drop = ceiling - position[1];
    for (const x of [-0.5, 0.5]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, drop, 5), m.metal);
      rod.position.set(x * scale, drop / 2, 0);
      this.group.add(rod);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.04 * scale, 0.008, 0.008), m.bronze);
    this.group.add(bar);
    this.rings = [0.5, 0.39, 0.28].map((radius, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.007, 8, 72), m.bronze);
      ring.castShadow = true;
      ring.userData.rest = new THREE.Euler(Math.PI / 2 + [0.5, -0.72, 0.36][i], [0.3, 1.4, 2.6][i], 0);
      this.inner.add(ring);
      return ring;
    });
    this.color = new THREE.Color(palette.ember);
    this.coreMaterial = new THREE.MeshBasicMaterial({ color: palette.ember, toneMapped: false });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 16), this.coreMaterial);
    this.inner.add(this.core);
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d"), grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "#ffffffff");
    grad.addColorStop(0.2, "#ffffff66");
    grad.addColorStop(0.55, "#ffffff18");
    grad.addColorStop(1, "#ffffff00");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    this.glowMaterial = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: palette.ember, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.glow = new THREE.Sprite(this.glowMaterial);
    this.glow.scale.setScalar(0.7);
    this.inner.add(this.glow);
    // AURA's light is one of the house's few live lights, and only while it is awake; at rest the glow alone carries it.
    this.light = new THREE.PointLight("#ffb07a", 0, 7 * scale, 1.8);
    this.light.userData.base = 1;
    this.light.userData.level = 0;
    this.light.userData.idle = true;
    this.group.add(this.light);
    a.roomLights.push(this.light);
    // A generous unseen volume, so AURA is easy to address from across the room.
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.56 * scale, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.group.add(proxy);
    a.usable(proxy, { verb: "ASK", label, range: 7.5, outline: this.rings[0], run: () => world.mentor?.ask() });
    a.roomExtras.get(room).push(this.group);
    this.group.visible = a.roomGroups.get(room).visible;
    world.devices.push(this);
  }
  get focused() {
    return false;
  }
  refresh() {}
  wake() {
    this.target = 1;
  }
  sleep() {
    this.target = 0;
  }
  /** A syllable of light: called as AURA's words appear. */
  speak(amount = 1) {
    this.voice = Math.max(this.voice, amount);
  }
  update(dt, bands, t) {
    const time = t / 1000, still = this.w.reduced;
    this.awake += (this.target - this.awake) * (1 - Math.exp(-dt * (this.target ? 3.2 : 1.6)));
    this.voice *= Math.exp(-dt * 7);
    const k = this.awake * this.awake * (3 - 2 * this.awake), music = still ? 0 : bands.bass * 0.5 + bands.level * 0.3;
    this.rings.forEach((ring, i) => {
      const rest = ring.userData.rest, drift = still ? 0 : Math.sin(time * (0.21 + i * 0.07) + i * 2) * 0.16 * (1 - k);
      // Asleep: three planes, slowly precessing. Awake: one plane, turning together.
      ring.rotation.x = Math.PI / 2 + (rest.x - Math.PI / 2 + drift) * (1 - k);
      ring.rotation.y = (rest.y + time * 0.07 * (i + 1)) * (1 - k);
      ring.rotation.z = time * (0.12 + k * (0.5 + i * 0.22)) * (i % 2 ? -1 : 1);
      ring.position.y = k * (i - 1) * 0.02 * Math.sin(time * 1.4 + i);
    });
    const breath = still ? 0.5 : 0.5 + 0.5 * Math.sin(time * 1.1), open = 0.34 + breath * 0.12 + k * 0.6 + this.voice * 0.5 + music * 0.4;
    this.core.scale.setScalar(0.8 + open * 0.9);
    this.color.set(palette.ember).lerp(this.white, k * 0.55 + this.voice * 0.3);
    this.coreMaterial.color.copy(this.color).multiplyScalar(this.w.finish ? 2.6 : 1);
    this.glowMaterial.color.copy(this.color);
    this.glowMaterial.opacity = Math.min(1, 0.22 + open * 0.5);
    this.glow.scale.setScalar((0.5 + open * 0.9) * this.inner.scale.x);
    this.light.userData.level = (0.6 + k * 5 + this.voice * 3 + music * 1.5) * this.w.lighting.mood.accent;
    // With only two lights to spend, the room keeps its own; AURA's joins them where there are four or more.
    this.light.userData.idle = (k < 0.02 && this.voice < 0.02) || this.w.quality.preset.lights < 4;
    this.inner.position.y = still ? 0 : Math.sin(time * 0.6) * 0.012;
  }
}
AuraHalo.prototype.white = new THREE.Color("#fff1dc");
