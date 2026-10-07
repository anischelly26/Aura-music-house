import * as THREE from "three";
import { rooms, pit } from "../house/layout.js";
import { EYE } from "./player.js";

const $ = (s) => document.querySelector(s);
const smooth = (t) => t * t * (3 - 2 * t);
const span = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

/** Every structural edge of the house as a line: the drawing the arrival moves through. */
function blueprint(a) {
  const out = [], line = (x0, y0, z0, x1, y1, z1) => out.push(x0, y0, z0, x1, y1, z1);
  const cage = (minX, maxX, minZ, maxZ, y0, y1) => {
    for (const y of [y0, y1]) { line(minX, y, minZ, maxX, y, minZ); line(maxX, y, minZ, maxX, y, maxZ); line(maxX, y, maxZ, minX, y, maxZ); line(minX, y, maxZ, minX, y, minZ); }
    for (const [x, z] of [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]]) line(x, y0, z, x, y1, z);
  };
  for (const w of a.walls) {
    if (w.glass) continue;
    cage(w.minX + 0.34, w.maxX - 0.34, w.minZ + 0.34, w.maxZ - 0.34, 0, 6.4);
  }
  cage(-31, 31, -31, 31, 0, 6.4);
  for (let z = -31; z <= 31; z += 7.75) for (const x of [-31, 31]) line(x, 0, z, x, 6.4, z);
  for (const r of rooms) {
    if (r.id === "terrace") continue;
    const w = r.col === 1 ? 9 : 11, d = r.row === 1 ? 9 : 11, y = r.id === "living" ? 7.5 : 6.4, sw = r.id === "living" ? 5.5 : 3.5, sd = r.id === "living" ? 5.5 : 3;
    for (const [hx, hz] of [[w, d], [sw, sd]]) { line(r.x - hx, y, r.z - hz, r.x + hx, y, r.z - hz); line(r.x + hx, y, r.z - hz, r.x + hx, y, r.z + hz); line(r.x + hx, y, r.z + hz, r.x - hx, y, r.z + hz); line(r.x - hx, y, r.z + hz, r.x - hx, y, r.z - hz); }
  }
  cage(-7.86, 7.86, -7.86, 7.86, 6.4, 7.5);
  cage(pit.minX, pit.maxX, pit.minZ, pit.maxZ, -pit.depth, 0);
  // Door, threshold and the approach, drawn as construction lines toward the viewer.
  cage(-2.68, 2.68, 30.9, 31.1, 0, 4.7);
  line(0, 0, 31, 0, 4.7, 31);
  cage(-3, 3, 29.5, 38.5, -0.17, 0.01);
  for (const x of [-3, 3]) line(x, 0.01, 38.5, x * 2.4, 0.01, 74);
  for (let z = 42; z <= 70; z += 4) line(-0.4, 0.01, z, 0.4, 0.01, z);
  line(-31, 0, 31, -46, 0, 31); line(31, 0, 31, 46, 0, 31);
  return out;
}

/**
 * The first fourteen seconds. A word in the dark, a waveform, the waveform unfolding
 * into a drawing of the house, the camera travelling through the drawing as it turns
 * into the place itself, the door opening. Then one word: ENTER.
 */
export class Arrival {
  constructor(world, { short = false } = {}) {
    this.w = world;
    this.rate = short ? 1.75 : 1;
    this.time = 0;
    this.door = 0;
    this.veil = 1;
    this.waiting = false;
    this.done = false;
    this.el = $("#cinema");
    this.el.hidden = false;
    this.el.className = "";
    this.word = this.el.querySelector(".cinemaWord");
    this.word.className = "cinemaWord";
    document.body.classList.add("cinematic");
    const target = blueprint(world.architecture), count = target.length / 6;
    const position = new Float32Array(target), along = new Float32Array(count * 2), delay = new Float32Array(count * 2), lift = new Float32Array(count * 2);
    // Segments nearest the front door settle first, so the drawing grows away from the viewer.
    const order = Array.from({ length: count }, (_, i) => ({ i, key: Math.hypot(target[i * 6], target[i * 6 + 2] - 31) + Math.random() * 14 })).sort((x, y) => x.key - y.key);
    order.forEach(({ i }, rank) => {
      const u = Math.random();
      along.set([u, u + 1 / count], i * 2);
      const d = (rank / count) * 0.62 + Math.random() * 0.06, l = (Math.random() - 0.3) * 6;
      delay.set([d, d], i * 2);
      lift.set([l, l], i * 2);
    });
    // The waveform reads as one continuous line: sort each segment's place along it.
    const slots = Array.from({ length: count }, (_, i) => i).sort(() => Math.random() - 0.5);
    slots.forEach((slot, i) => along.set([slot / count, (slot + 1) / count], i * 2));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("along", new THREE.BufferAttribute(along, 1));
    geometry.setAttribute("delay", new THREE.BufferAttribute(delay, 1));
    geometry.setAttribute("lift", new THREE.BufferAttribute(lift, 1));
    this.uniforms = { time: { value: 0 }, draw: { value: 0 }, morph: { value: 0 }, opacity: { value: 0 }, energy: { value: 0.3 } };
    this.lines = new THREE.LineSegments(geometry, new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, uniforms: this.uniforms,
      vertexShader: `attribute float along, delay, lift; uniform float time, draw, morph, energy; varying float vAlpha;
        void main(){
          float u = along;
          float envelope = exp(-pow((u - .5) * 3.4, 2.));
          float wave = (sin(u * 74. + time * 2.1) * .55 + sin(u * 31. - time * 1.3) * .3 + sin(u * 173. + time * 3.7) * .15) * envelope * (1.6 + energy * 2.4);
          vec3 from = vec3(mix(-17., 17., u), 2.7 + wave, 45.);
          float p = clamp((morph * 1.7 - delay) / .68, 0., 1.);
          p = p * p * (3. - 2. * p);
          vec3 pos = mix(from, position, p);
          pos.y += sin(p * 3.14159) * lift;
          vec4 mv = modelViewMatrix * vec4(pos, 1.);
          float drawn = smoothstep(u - .02, u + .02, draw * 1.04);
          vAlpha = mix(drawn, 1., p) * smoothstep(150., 30., -mv.z) * smoothstep(.4, 5., -mv.z) * mix(1., .62, p);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: "uniform float opacity; varying float vAlpha; void main(){ gl_FragColor = vec4(.937, .906, .847, vAlpha * opacity); }",
    }));
    this.lines.frustumCulled = false;
    this.overlay = new THREE.Scene();
    this.veilMaterial = new THREE.MeshBasicMaterial({ color: "#0c0b0a", transparent: true, depthTest: false, depthWrite: false });
    this.veilMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.veilMaterial);
    this.veilMesh.frustumCulled = false;
    this.veilMesh.renderOrder = -1;
    this.veilCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.veilScene = new THREE.Scene();
    this.veilScene.add(this.veilMesh);
    this.overlay.add(this.lines);
    this.path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 3.1, 70), new THREE.Vector3(0, 2.8, 58), new THREE.Vector3(0, 2.2, 45), new THREE.Vector3(0, 1.82, 36), new THREE.Vector3(0, EYE, 31), new THREE.Vector3(0, EYE, 27), new THREE.Vector3(0, EYE, 24)], false, "catmullrom", 0.4);
    const camera = world.camera;
    camera.position.copy(this.path.getPoint(0));
    camera.fov = 34;
    camera.updateProjectionMatrix();
    world.lookAt(0, 2.9, 31);
    this.key = (e) => { if (e.code === "Escape") this.skip(); else if ((e.code === "Enter" || e.code === "Space") && this.waiting) { e.preventDefault(); this.enter(); } };
    addEventListener("keydown", this.key, true);
    $("#cinemaSkip").onclick = () => this.skip();
    $("#cinemaEnter").onclick = () => this.enter();
    world.sound.ambience({ drone: 1, room: 0 }, 2.5);
  }
  update(dt) {
    if (this.done) return;
    const w = this.w, c = w.camera;
    if (!this.waiting) this.time += dt * this.rate;
    const t = this.time, u = this.uniforms;
    u.time.value += dt;
    // 0 – 6 s: the word, the line beneath it, the waveform drawing itself.
    this.word.classList.toggle("a", t > 0.4);
    this.word.classList.toggle("b", t > 2);
    this.word.classList.toggle("out", t > 5.2);
    u.opacity.value = span(t, 2.6, 3.4) * (1 - span(t, 10.8, 13.4));
    u.draw.value = smooth(span(t, 2.8, 5.4));
    u.energy.value = 0.25 + w.studio.engine.bands.level * 0.8 + Math.sin(t * 1.7) * 0.08;
    // 5.8 – 8.6 s: the waveform unfolds into the drawing.
    u.morph.value = span(t, 5.8, 8.8);
    // 8 – 14 s: through the drawing, as it becomes the house.
    const travel = smooth(span(t, 7.8, 14.2));
    c.position.copy(this.path.getPoint(travel));
    const fov = 34 + (w.fieldOfView - 34) * smooth(span(t, 8.6, 14.2));
    if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
    const look = smooth(span(t, 11.5, 14.2));
    w.lookAt(0, 2.9 - look * 1, 31 - smooth(span(t, 9.5, 14.2)) * 21);
    this.veil = 1 - smooth(span(t, 9, 11.6));
    this.door = t > 9.9 ? 1 : 0;
    if (t > 12.6 && !this.arrived) { this.arrived = true; w.sound.ambience({ drone: 0, room: 0.7 }, 4); }
    if (t >= 14.2 && !this.waiting) {
      this.waiting = true;
      this.el.classList.add("title");
      w.sound.wipe();
      $("#cinemaEnter").focus({ preventScroll: true });
    }
  }
  /** Draws the frame: the house (once it is being revealed), the veil over it, the drawing on top. */
  render(renderer) {
    const w = this.w;
    renderer.setRenderTarget(null);
    renderer.autoClear = true;
    if (this.veil < 0.999) renderer.render(w.scene, w.camera);
    else { renderer.setClearColor("#0c0b0a", 1); renderer.clear(); }
    renderer.autoClear = false;
    if (this.veil > 0.001 && this.veil < 0.999) { this.veilMaterial.opacity = this.veil; renderer.render(this.veilScene, this.veilCamera); }
    if (this.uniforms.opacity.value > 0.003) renderer.render(this.overlay, w.camera);
    renderer.autoClear = true;
  }
  enter() {
    if (!this.waiting || this.leaving) return;
    this.leaving = true;
    this.el.classList.add("gone");
    this.w.sound.confirm();
    if (!this.w.touch) this.w.lock();
    setTimeout(() => this.finish(), this.w.reduced ? 10 : 620);
  }
  skip() {
    if (this.done) return;
    if (this.waiting) return this.enter();
    this.finish();
  }
  finish() {
    if (this.done) return;
    this.done = true;
    const w = this.w;
    removeEventListener("keydown", this.key, true);
    this.el.hidden = true;
    this.el.className = "";
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    this.veilMesh.geometry.dispose();
    this.veilMaterial.dispose();
    document.body.classList.remove("cinematic");
    w.camera.fov = w.fieldOfView;
    w.camera.updateProjectionMatrix();
    w.arrival = null;
    w.sound.ambience({ drone: 0, room: 0.7 }, 2);
    w.arrive();
  }
}
