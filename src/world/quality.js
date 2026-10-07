import * as THREE from "three";

/** What each preset is allowed to spend. Music tools are identical in every one. */
export const presets = {
  low: { label: "LOW", pixelRatio: 0.75, pixels: 0.8e6, shadows: false, softShadows: false, shadowSize: 512, shadowAuto: false, env: false, post: false, lights: 2, particles: 0.35, anisotropy: 1, far: 260 },
  // Soft shadows cost what plain ones do in three.js 0.180 (16 samples against 17), and their edges do not step.
  medium: { label: "MEDIUM", pixelRatio: 1, pixels: 1.5e6, shadows: true, softShadows: true, shadowSize: 1024, shadowAuto: false, env: true, post: false, lights: 2, particles: 0.7, anisotropy: 4, far: 450 },
  high: { label: "HIGH", pixelRatio: 1.5, pixels: 3.2e6, shadows: true, softShadows: true, shadowSize: 2048, shadowAuto: false, env: true, post: true, lights: 4, particles: 1, anisotropy: 8, far: 450 },
  ultra: { label: "ULTRA", pixelRatio: 2, pixels: 9e6, shadows: true, softShadows: true, shadowSize: 4096, shadowAuto: true, env: true, post: true, lights: 6, particles: 1.4, anisotropy: 16, far: 450 },
};
const legacy = { balanced: "medium", full: "high", performance: "low" };

export function gpuName(renderer) {
  try {
    const gl = renderer.getContext(), info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    return "";
  }
}
/** A sensible first guess from the reported adapter; the governor refines it at runtime. */
export function detectQuality(renderer) {
  const gpu = gpuName(renderer).toLowerCase(), coarse = matchMedia("(any-pointer: coarse)").matches && Math.min(innerWidth, innerHeight) < 820;
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return "low";
  if (coarse) return /apple|adreno \(tm\) 7|mali-g7|mali-g[89]/.test(gpu) ? "medium" : "low";
  if (/rtx|radeon rx|radeon pro|geforce gtx 1[06-9]|geforce gtx 16|arc\(tm\) a|apple m[1-9]|quadro/.test(gpu)) return /rtx [34]0[789]0|rtx 50|apple m[2-9] (max|ultra)/.test(gpu) ? "ultra" : "high";
  if (/iris\(r\) xe|iris xe|apple gpu|geforce|radeon/.test(gpu)) return "medium";
  if (/intel|uhd|hd graphics|mali|adreno|powervr/.test(gpu)) return "medium";
  return "medium";
}

/** Owns resolution, shadow budget and the frame governor. */
export class PerformanceManager {
  constructor(renderer, onChange) {
    this.renderer = renderer;
    this.onChange = onChange;
    const stored = localStorage.getItem("aura-house-quality");
    this.auto = !stored || stored === "auto";
    this.name = this.auto ? (renderer ? detectQuality(renderer) : "medium") : legacy[stored] || (presets[stored] ? stored : "medium");
    this.scale = 1;
    this.frames = 0;
    this.started = performance.now();
    this.fps = 60;
    this.slow = 0;
    this.fast = 0;
  }
  get preset() {
    return presets[this.name];
  }
  /** Device pixels per CSS pixel: capped by the preset, by a total pixel budget, and by the governor. */
  get pixelRatio() {
    const budget = Math.sqrt(this.preset.pixels / Math.max(1, innerWidth * innerHeight));
    return Math.max(0.5, Math.min(devicePixelRatio || 1, this.preset.pixelRatio, budget) * this.scale);
  }
  set(name) {
    this.auto = name === "auto";
    this.name = this.auto ? detectQuality(this.renderer) : legacy[name] || (presets[name] ? name : "medium");
    this.scale = 1;
    this.slow = this.fast = 0;
    localStorage.setItem("aura-house-quality", this.auto ? "auto" : this.name);
    this.onChange?.();
  }
  /** Loading, shader warm-up and room jumps are not evidence of a slow machine. */
  hold(ms = 5000) {
    this.grace = performance.now() + ms;
    this.slow = this.fast = 0;
  }
  /** Call once per rendered frame. Trims resolution when the frame rate sags; restores it when there is headroom. */
  sample(now) {
    this.frames++;
    const elapsed = now - this.started;
    if (elapsed < 1000) return;
    this.fps = (this.frames * 1000) / elapsed;
    this.frames = 0;
    this.started = now;
    if (now < (this.grace || 0)) return;
    if (this.fps < 46) { this.slow++; this.fast = 0; }
    else if (this.fps > 58) { this.fast++; this.slow = 0; }
    else this.slow = this.fast = 0;
    // Resizing the drawing buffer is itself a hitch, so changes are few and deliberate.
    if (this.slow >= 3 && this.scale > 0.62) {
      this.scale = Math.max(0.6, this.scale - (this.fps < 32 ? 0.2 : 0.1));
      this.slow = 0;
      this.settled = now + 12000;
      this.onChange?.(true);
    } else if (this.fast >= 10 && this.scale < 1 && now > (this.settled || 0)) {
      this.scale = Math.min(1, this.scale + 0.08);
      this.fast = 0;
      this.settled = now + 20000;
      this.onChange?.(true);
    }
  }
  reset(now) {
    this.frames = 0;
    this.started = now;
  }
  describe() {
    const info = this.renderer.info.render;
    return `${this.fps.toFixed(0)} FPS · ${info.calls} DRAWS · ${Math.round(info.triangles / 1000)}K TRIS · ${this.renderer.getPixelRatio().toFixed(2)}× · ${this.preset.label}${this.auto ? " (AUTO)" : ""}`;
  }
}

/**
 * How bright a light source is drawn. Without the finishing pass a source can only reach
 * white. With it, a source at full level is drawn `factor` times brighter than white and
 * the excess becomes bloom; a dimmed source stays as dim as it is on MEDIUM.
 */
export function glowLevel(level, factor, post) {
  if (!post) return Math.min(1, level);
  const lit = Math.min(1, level);
  return Math.min(4, level * (1 + (factor - 1) * lit * lit));
}

const vertexShader = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }";
const pass = (uniforms, fragmentShader) => new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false });

/**
 * The finishing pass for HIGH and ULTRA: bloom from the house's real light sources.
 * The scene is drawn exactly as it is on MEDIUM — same tone mapping, same encoding —
 * but into a float buffer, where lamps, light lines, the ember accents and the sun are
 * allowed to be brighter than white. That excess is blurred and laid back over the
 * picture. Vignette and grain stay in CSS for every preset.
 */
export class Finish {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true, colorSpace: THREE.SRGBColorSpace });
    // three.js (pinned at 0.180) tone-maps and encodes only for the canvas and for targets flagged like this.
    this.target.isXRRenderTarget = true;
    // Three widths of blur, each half the resolution of the last.
    this.levels = [4, 8, 16].map((divide) => {
      const a = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
      return { divide, a, b: a.clone() };
    });
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    // Keeps only what is brighter than white, in its own colour. Four taps, each thresholded, so a thin light line survives.
    this.bright = pass({ tMap: { value: null }, texel: { value: new THREE.Vector2() } }, `varying vec2 vUv; uniform sampler2D tMap; uniform vec2 texel;
      vec3 over(vec2 uv){ vec3 c = texture2D(tMap, uv).rgb; float m = max(c.r, max(c.g, c.b)); return min(c * clamp((m - 1.) / max(m, .0001), 0., 1.), vec3(3.)); }
      void main(){ gl_FragColor = vec4((over(vUv + texel * vec2(-1., -1.)) + over(vUv + texel * vec2(1., -1.)) + over(vUv + texel * vec2(-1., 1.)) + over(vUv + texel * vec2(1., 1.))) * .25, 1.); }`);
    this.half = pass({ tMap: { value: null }, texel: { value: new THREE.Vector2() } }, "varying vec2 vUv; uniform sampler2D tMap; uniform vec2 texel; void main(){ gl_FragColor = vec4((texture2D(tMap, vUv + texel * vec2(-1., -1.)).rgb + texture2D(tMap, vUv + texel * vec2(1., -1.)).rgb + texture2D(tMap, vUv + texel * vec2(-1., 1.)).rgb + texture2D(tMap, vUv + texel * vec2(1., 1.)).rgb) * .25, 1.); }");
    this.blur = pass({ tMap: { value: null }, direction: { value: new THREE.Vector2() } }, "varying vec2 vUv; uniform sampler2D tMap; uniform vec2 direction; void main(){ vec3 c = texture2D(tMap, vUv).rgb * .227; c += (texture2D(tMap, vUv + direction * 1.385).rgb + texture2D(tMap, vUv - direction * 1.385).rgb) * .316; c += (texture2D(tMap, vUv + direction * 3.231).rgb + texture2D(tMap, vUv - direction * 3.231).rgb) * .07; gl_FragColor = vec4(c, 1.); }");
    this.output = pass({ tScene: { value: null }, tNear: { value: null }, tMid: { value: null }, tFar: { value: null }, bloom: { value: 0.9 } }, `varying vec2 vUv; uniform sampler2D tScene, tNear, tMid, tFar; uniform float bloom;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec3 color = texture2D(tScene, vUv).rgb;
        // A source brighter than white keeps its own colour rather than clipping to white.
        color /= max(1., max(color.r, max(color.g, color.b)));
        vec3 glow = (texture2D(tNear, vUv).rgb * .46 + texture2D(tMid, vUv).rgb * .32 + texture2D(tFar, vUv).rgb * .22) * bloom;
        color = 1. - (1. - color) * (1. - clamp(glow, 0., 1.));
        // Half a code value of noise keeps the soft gradients from banding.
        color += (hash(gl_FragCoord.xy) - .5) / 255.;
        gl_FragColor = vec4(color, 1.);
      }`);
  }
  setSize(width, height, pixelRatio) {
    const w = Math.max(2, Math.round(width * pixelRatio)), h = Math.max(2, Math.round(height * pixelRatio));
    this.target.setSize(w, h);
    for (const level of this.levels) for (const t of [level.a, level.b]) t.setSize(Math.max(2, Math.round(w / level.divide)), Math.max(2, Math.round(h / level.divide)));
  }
  draw(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.camera);
  }
  render(scene, camera) {
    const r = this.renderer, info = r.info;
    // Counted as one frame, so the figures in Settings describe the house and not the last quad.
    info.autoReset = false;
    info.reset();
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    let source = this.target;
    for (const [i, level] of this.levels.entries()) {
      const first = i === 0, down = first ? this.bright : this.half;
      down.uniforms.tMap.value = source.texture;
      down.uniforms.texel.value.set(1 / source.width, 1 / source.height);
      this.draw(down, level.a);
      this.blur.uniforms.tMap.value = level.a.texture;
      this.blur.uniforms.direction.value.set(1 / level.a.width, 0);
      this.draw(this.blur, level.b);
      this.blur.uniforms.tMap.value = level.b.texture;
      this.blur.uniforms.direction.value.set(0, 1 / level.a.height);
      this.draw(this.blur, level.a);
      source = level.a;
    }
    const u = this.output.uniforms;
    u.tScene.value = this.target.texture;
    u.tNear.value = this.levels[0].a.texture;
    u.tMid.value = this.levels[1].a.texture;
    u.tFar.value = this.levels[2].a.texture;
    this.draw(this.output, null);
    info.autoReset = true;
  }
  dispose() {
    this.target.dispose();
    for (const level of this.levels) { level.a.dispose(); level.b.dispose(); }
    for (const m of [this.bright, this.half, this.blur, this.output]) m.dispose();
    this.quad.geometry.dispose();
  }
}
