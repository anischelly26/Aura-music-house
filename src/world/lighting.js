import * as THREE from "three";
import { glowLevel } from "./quality.js";

const FAR = 1e12;

/** The world outside the glass. Sun angles are degrees; colours are sRGB. */
export const skies = {
  day: { label: "DAY", sun: "#fff1d6", sunPower: 3.1, azimuth: -52, elevation: 56, top: "#6f9bbd", horizon: "#e8dcc6", ground: "#cbbfa8", hemi: 0.62, fog: "#dcd3c2", fogNear: 110, fogFar: 430, stars: 0, cloud: 0.35, rain: 0, env: 0.42, exposure: 1.02, ridge: "#8b8f93" },
  sunset: { label: "SUNSET", sun: "#ff9552", sunPower: 2.5, azimuth: -98, elevation: 8.5, top: "#34415f", horizon: "#f3a160", ground: "#d98f5c", hemi: 0.4, fog: "#e0a376", fogNear: 70, fogFar: 380, stars: 0.12, cloud: 0.55, rain: 0, env: 0.3, exposure: 1.06, ridge: "#5b4b55" },
  night: { label: "NIGHT", sun: "#7f97cc", sunPower: 0.32, azimuth: 40, elevation: 46, top: "#04060d", horizon: "#141b30", ground: "#0b0e16", hemi: 0.1, fog: "#0d1220", fogNear: 60, fogFar: 330, stars: 1, cloud: 0.15, rain: 0, env: 0.07, exposure: 0.98, ridge: "#0c1019" },
  rain: { label: "RAIN", sun: "#b5bfc8", sunPower: 0.85, azimuth: -30, elevation: 50, top: "#4f5861", horizon: "#8b939a", ground: "#70777c", hemi: 0.5, fog: "#8a9198", fogNear: 26, fogFar: 190, stars: 0, cloud: 1, rain: 1, env: 0.3, exposure: 1, ridge: "#6f777e" },
  fog: { label: "FOG", sun: "#efe8dc", sunPower: 1.05, azimuth: -45, elevation: 40, top: "#b9b6ae", horizon: "#d6d1c7", ground: "#c9c3b8", hemi: 0.72, fog: "#d3cec4", fogNear: 5, fogFar: 62, stars: 0, cloud: 0.8, rain: 0, env: 0.36, exposure: 1, ridge: "#cdc8be" },
};
/** Moods for the interior. Multipliers on the house's own lights; `sky` is a suggestion the mood brings with it. */
export const moods = {
  create: { label: "CREATE", rooms: 1, lamps: 1, strips: 1, accent: 1, exposure: 1, sky: null },
  focus: { label: "FOCUS", rooms: 1.4, lamps: 0.55, strips: 1.25, accent: 0.7, exposure: 1.06, sky: "day" },
  listen: { label: "LISTEN", rooms: 0.26, lamps: 1.3, strips: 0.3, accent: 1, exposure: 0.84, sky: null },
  midnight: { label: "MIDNIGHT", rooms: 0.12, lamps: 0.85, strips: 0.16, accent: 1.5, exposure: 0.8, sky: "night" },
  sunset: { label: "SUNSET", rooms: 0.5, lamps: 1.15, strips: 0.45, accent: 1.1, exposure: 0.96, sky: "sunset" },
  aura: { label: "AURA", rooms: 0.2, lamps: 0.5, strips: 0.22, accent: 2.3, exposure: 0.8, sky: null },
};
const numeric = ["sunPower", "azimuth", "elevation", "hemi", "fogNear", "fogFar", "stars", "cloud", "rain", "env", "exposure"], colours = ["sun", "top", "horizon", "ground", "fog", "ridge"];
const moodKeys = ["rooms", "lamps", "strips", "accent", "exposure"];

/**
 * All light in the house: the sun and sky, each room's fill, practical lamps,
 * light lines, screens and the ember accents. Presets ease into one another,
 * and everything breathes very slightly with the music.
 */
export class LightingManager {
  constructor(world) {
    this.w = world;
    const scene = world.scene, a = world.architecture;
    this.skyName = localStorage.getItem("aura-sky") in skies ? localStorage.getItem("aura-sky") : "day";
    this.moodName = localStorage.getItem("aura-mood") in moods ? localStorage.getItem("aura-mood") : "create";
    this.sky = this.copy(skies[this.skyName]);
    this.mood = { ...moods[this.moodName] };
    this.dim = 0;
    this.dimTarget = 0;
    this.override = null;
    this.hemi = new THREE.HemisphereLight("#ffffff", "#8d8474", 0.6);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff0d2", 3);
    this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 1, far: 220 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.Fog("#dcd3c2", 110, 430);
    this.buildSky();
    this.buildRain();
    this.buildDust();
    // Light-emitting materials remember their true colour; brightness is applied on top.
    this.glow = [];
    for (const material of Object.values(a.m)) if (material.userData.glow) this.glow.push({ material, base: material.color.clone(), factor: material.userData.glow, group: material === a.m.ember ? "accent" : "strips" });
    if (a.pulse) this.pulse = { material: a.pulse, base: a.pulse.color.clone(), factor: a.pulse.userData.glow, level: 0 };
    for (const lamp of a.lamps) lamp.base = lamp.shade.color.clone();
    this.position = new THREE.Vector3();
    this.shadowClock = 0;
    this.moving = 2;
    this.apply(0, { bass: 0, mid: 0, high: 0, level: 0 }, 0);
  }
  copy(source) {
    const out = {};
    for (const key of numeric) out[key] = source[key];
    for (const key of colours) out[key] = new THREE.Color(source[key]);
    return out;
  }
  setSky(name, save = true) {
    if (!skies[name]) return;
    this.skyName = name;
    this.moving = 4;
    if (save) localStorage.setItem("aura-sky", name);
    this.w.events.dispatchEvent(new CustomEvent("light", { detail: { sky: name, mood: this.moodName } }));
  }
  setMood(name, save = true) {
    if (!moods[name]) return;
    this.moodName = name;
    this.moving = 4;
    if (save) localStorage.setItem("aura-mood", name);
    if (moods[name].sky) this.setSky(moods[name].sky, save);
    this.w.events.dispatchEvent(new CustomEvent("light", { detail: { sky: this.skyName, mood: name } }));
  }
  /** A temporary mood (listening, composing, AURA speaking) that returns to the chosen one when cleared. */
  borrow(name) {
    this.override = name && moods[name] ? name : null;
    this.moving = 3;
  }
  buildSky() {
    this.skyUniforms = {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, stars: { value: 0 }, cloud: { value: 0.3 }, time: { value: 0 },
      fogColor: { value: new THREE.Color() }, exposure: { value: 1 }, haze: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyUniforms,
      vertexShader: "varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }",
      fragmentShader: `varying vec3 vDir; uniform vec3 top, horizon, ground, sunColor, sunDir, fogColor; uniform float stars, cloud, time, exposure, haze;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        // The colour the renderer makes of fully fogged ground (ACES filmic, then sRGB), so thick weather meets the sky without a seam.
        vec3 fit(vec3 v){ return (v * (v + .0245786) - .000090537) / (v * (.983729 * v + .4329510) + .238081); }
        vec3 shown(vec3 c){
          c = mat3(1.60475, -.10208, -.00327, -.53108, 1.10813, -.07276, -.07367, -.00605, 1.07602) * fit(mat3(.59719, .07600, .02840, .35458, .90834, .13383, .04823, .01566, .83777) * (c * exposure / .6));
          c = clamp(c, 0., 1.);
          return mix(pow(c, vec3(.41666)) * 1.055 - .055, c * 12.92, vec3(lessThanEqual(c, vec3(.0031308))));
        }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0., a = .5; for(int i = 0; i < 4; i++){ v += noise(p) * a; p = p * 2.03 + 7.1; a *= .5; } return v; }
        void main(){
          vec3 d = normalize(vDir);
          vec3 color = mix(horizon, top, smoothstep(0., .6, d.y));
          color = mix(color, ground, smoothstep(.02, -.22, d.y));
          float s = max(dot(d, sunDir), 0.);
          color += sunColor * (pow(s, 600.) * 6. + pow(s, 24.) * .32 + pow(s, 4.) * .1);
          if (d.y > 0.) {
            vec2 uv = d.xz / (d.y + .22);
            float c = smoothstep(.62 - cloud * .34, 1., fbm(uv * 1.3 + time * .006) + fbm(uv * 3.1 - time * .004) * .35);
            color = mix(color, mix(horizon, vec3(1.), .35) + sunColor * .12, c * (.25 + cloud * .5) * smoothstep(0., .25, d.y));
            vec2 cell = floor(d.xz / (d.y + .6) * 190.);
            float star = step(.9975, hash(cell)) * (.55 + .45 * sin(time * 1.7 + hash(cell + 3.) * 40.));
            color += vec3(star) * stars * smoothstep(.02, .3, d.y) * (1. - c);
          }
          color = mix(color, shown(fogColor), haze * mix(smoothstep(.5, .02, d.y), 1., haze * .7));
          gl_FragColor = vec4(color, 1.);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 18), material);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    this.w.scene.add(this.dome);
  }
  buildRain() {
    const count = 1800, positions = new Float32Array(count * 6), seeds = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * 60, y = Math.random() * 26, z = Math.random() * 60, seed = Math.random();
      positions.set([x, y, z, x, y, z], i * 6);
      seeds.set([seed, seed + 2], i * 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    this.rainUniforms = { time: { value: 0 }, origin: { value: new THREE.Vector3() }, amount: { value: 0 } };
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.rainUniforms,
      vertexShader: `attribute float seed; uniform float time, amount; uniform vec3 origin; varying float vAlpha;
        void main(){
          float tail = step(2., seed), s = seed - tail * 2.;
          vec3 p = position;
          p.y = mod(p.y - time * (17. + s * 9.), 26.) + tail * .42;
          p.x = mod(p.x - origin.x + 30., 60.) - 30. + origin.x + p.y * .05;
          p.z = mod(p.z - origin.z + 30., 60.) - 30. + origin.z;
          // The house is roofed; only the terrace is open to the sky.
          bool indoors = abs(p.x) < 31.2 && abs(p.z) < 31.2 && !(p.x > 9.2 && p.z < -9.2);
          vAlpha = (indoors || s > amount) ? 0. : .32 * (1. - tail * .7);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
        }`,
      fragmentShader: "varying float vAlpha; void main(){ if (vAlpha < .01) discard; gl_FragColor = vec4(.78, .83, .88, vAlpha); }",
    });
    this.rain = new THREE.LineSegments(geometry, material);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.w.scene.add(this.rain);
  }
  /** Motes in the shaft of light under the living-room skylight. Very few, very slow. */
  buildDust() {
    const count = 260, positions = new Float32Array(count * 3), seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) { positions.set([(Math.random() - 0.5) * 12, 0.4 + Math.random() * 6.4, (Math.random() - 0.5) * 12], i * 3); seeds[i] = Math.random(); }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    this.dustUniforms = { time: { value: 0 }, light: { value: 1 }, stir: { value: 0 }, scale: { value: 1 }, tint: { value: new THREE.Color("#ffe4bf") } };
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.dustUniforms,
      vertexShader: `attribute float seed; uniform float time, stir, scale; varying float vAlpha;
        void main(){
          vec3 p = position;
          float t = time * (.04 + seed * .05) + seed * 40.;
          p += vec3(sin(t * 1.3), sin(t * .7) * .6 + stir * sin(t * 9. + seed * 6.) * .04, cos(t)) * (.35 + seed * .4);
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          vAlpha = (.25 + .75 * fract(seed * 7.3)) * smoothstep(13., 3., -mv.z) * smoothstep(.2, 1.2, -mv.z);
          gl_PointSize = scale * (1.2 + seed * 2.2) * (5. / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: "varying float vAlpha; uniform float light; uniform vec3 tint; void main(){ vec2 c = gl_PointCoord - .5; float d = smoothstep(.5, .1, length(c)); gl_FragColor = vec4(tint, d * vAlpha * light * .5); }",
    });
    this.dust = new THREE.Points(geometry, material);
    this.dust.position.set(0, 0, 0);
    this.w.scene.add(this.dust);
  }
  /** A light in a room that is not being drawn lights nothing. */
  shown(light) {
    for (let o = light.parent; o; o = o.parent) if (!o.visible) return false;
    return true;
  }
  apply(dt, bands, now) {
    const w = this.w, a = w.architecture, target = skies[this.skyName], k = dt ? 1 - Math.exp(-dt * 1.15) : 1;
    if (this.moving > 0) {
      for (const key of numeric) this.sky[key] += (target[key] - this.sky[key]) * k;
      for (const key of colours) this.sky[key].lerp(this.scratch.set(target[key]), k);
      const mood = moods[this.override || this.moodName];
      for (const key of moodKeys) this.mood[key] += (mood[key] - this.mood[key]) * k;
      this.moving -= dt;
    }
    this.dim += (this.dimTarget - this.dim) * (dt ? 1 - Math.exp(-dt * 3) : 1);
    const s = this.sky, mood = this.mood, post = !!w.finish, reactive = w.reduced ? 0 : 1, dim = 1 - this.dim * 0.62;
    // Sun and sky.
    const az = THREE.MathUtils.degToRad(s.azimuth), el = THREE.MathUtils.degToRad(s.elevation);
    this.direction.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    this.sun.position.copy(this.direction).multiplyScalar(110);
    this.sun.color.copy(s.sun);
    this.sun.intensity = s.sunPower * (0.55 + 0.45 * dim);
    this.hemi.color.copy(s.top).lerp(this.scratch.set("#ffffff"), 0.55);
    this.hemi.groundColor.copy(s.ground).multiplyScalar(0.55);
    this.hemi.intensity = s.hemi * (0.4 + 0.6 * Math.min(1.2, mood.rooms)) * dim;
    w.scene.fog.color.copy(s.fog);
    w.scene.fog.near = s.fogNear;
    w.scene.fog.far = s.fogFar;
    w.scene.environmentIntensity = s.env * (0.5 + 0.5 * dim);
    w.renderer.toneMappingExposure = 1.12 * s.exposure * mood.exposure;
    if (a.ridgeMaterial) a.ridgeMaterial.color.copy(s.ridge);
    const u = this.skyUniforms;
    u.top.value.copy(s.top); u.horizon.value.copy(s.horizon); u.ground.value.copy(s.ground);
    u.sunColor.value.copy(s.sun).multiplyScalar(Math.min(1.2, s.sunPower / 2.4));
    u.sunDir.value.copy(this.direction);
    u.stars.value = s.stars; u.cloud.value = s.cloud; u.time.value = now / 1000;
    // Thick weather hides the horizon: the nearer the fog closes in, the more of the sky it takes.
    u.fogColor.value.copy(s.fog); u.exposure.value = w.renderer.toneMappingExposure; u.haze.value = 1 - THREE.MathUtils.smoothstep(s.fogFar, 60, 240);
    this.dome.position.copy(w.camera.position);
    this.rain.visible = s.rain > 0.02 && w.quality.preset.particles > 0.3;
    if (this.rain.visible) { this.rainUniforms.time.value = now / 1000; this.rainUniforms.amount.value = s.rain * Math.min(1, w.quality.preset.particles); this.rainUniforms.origin.value.copy(w.camera.position); }
    const daylight = Math.min(1, s.sunPower / 2.6) * Math.max(0.15, Math.sin(el));
    this.dust.visible = w.quality.preset.particles > 0.5 && w.currentRoom === "living";
    if (this.dust.visible) { this.dustUniforms.time.value = now / 1000; this.dustUniforms.light.value = (0.25 + daylight * 0.9) * dim; this.dustUniforms.stir.value = bands.mid * reactive; this.dustUniforms.scale.value = w.renderer.getPixelRatio() * (innerHeight / 900); this.dustUniforms.tint.value.copy(s.sun); }
    // Interior fill: only the nearest few lights are live, to keep shading cheap. The number that are on never changes
    // from room to room — a different number is a different shader for every surface, built at the doorway.
    const bass = bands.bass * reactive, night = 1 - Math.min(1, s.sunPower / 2.2);
    const roomLevel = mood.rooms * (0.75 + night * 0.5) * dim, lampLevel = mood.lamps * (1 + bass * 0.07) * (0.55 + 0.45 * dim);
    w.camera.getWorldPosition(this.position);
    const lights = a.roomLights, budget = w.quality.preset.lights;
    for (const light of lights) { light.userData.d = light.userData.idle || !this.shown(light) ? FAR : light.getWorldPosition(this.scratchV).distanceToSquared(this.position); }
    if (!this.sorted || this.sorted.length !== lights.length) this.sorted = [...lights];
    this.sorted.sort((x, y) => x.userData.d - y.userData.d);
    this.sorted.forEach((light, i) => { light.visible = i < budget && light.userData.d < FAR; });
    for (const lamp of a.lamps) {
      lamp.level += ((lamp.on ? 1 : 0) - lamp.level) * (dt ? 1 - Math.exp(-dt * (lamp.on ? 14 : 9)) : 1);
      // A filament does not come on evenly.
      const flicker = lamp.on && lamp.level < 0.95 ? 0.75 + 0.25 * Math.sin(now * 0.09 + lamp.level * 30) : 1;
      const level = lamp.level * lampLevel * flicker;
      lamp.shade.color.copy(lamp.base).multiplyScalar(post ? glowLevel(0.12 + 0.88 * Math.min(1.25, level), lamp.shade.userData.glow, true) : 0.12 + 0.88 * Math.min(1.25, level));
      lamp.pool.material.opacity = lamp.pool.base * Math.min(1.5, level) * (0.35 + night * 0.9);
      if (lamp.light) lamp.light.userData.level = level;
    }
    for (const light of lights) if (light.visible) light.intensity = light.userData.base * (light.userData.level ?? roomLevel);
    const strip = mood.strips * (0.9 + bands.mid * 0.1 * reactive) * (0.6 + 0.4 * dim), accent = mood.accent * (0.86 + bands.high * 0.3 * reactive);
    for (const g of this.glow) g.material.color.copy(g.base).multiplyScalar(glowLevel(g.group === "accent" ? accent : strip, g.factor, post));
    if (a.wash) a.wash.opacity = a.wash.userData.base * Math.min(1.4, strip) * (0.45 + night * 0.9);
    if (this.pulse) {
      // The drum room's floor line answers the kick.
      this.pulse.level = Math.max(this.pulse.level * Math.exp(-dt * 9), bass > 0.5 ? bass : 0);
      const level = (0.14 + this.pulse.level * 0.86) * mood.accent;
      this.pulse.material.color.copy(this.pulse.base).multiplyScalar(post ? glowLevel(level, this.pulse.factor, true) : level);
    }
    // Static shadows are refreshed while the sun is moving, and occasionally otherwise.
    this.shadowClock += dt;
    if (w.renderer.shadowMap.enabled && !w.renderer.shadowMap.autoUpdate && (this.moving > 0 ? this.shadowClock > 0.18 : this.shadowClock > 4)) { this.shadowClock = 0; w.renderer.shadowMap.needsUpdate = true; }
  }
}
LightingManager.prototype.scratch = new THREE.Color();
LightingManager.prototype.scratchV = new THREE.Vector3();
LightingManager.prototype.direction = new THREE.Vector3();
