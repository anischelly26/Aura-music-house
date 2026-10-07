import * as THREE from "three";
import { seeded } from "./layout.js";

/** AURA's physical palette: plaster, walnut, brass, black equipment — and one ember signal. */
export const palette = {
  ink: "#0c0b0a",
  char: "#191613",
  bone: "#efe7d8",
  paper: "#d6cab6",
  plaster: "#d9cfbd",
  stone: "#8d857a",
  walnut: "#6f4a31",
  oak: "#b08a5e",
  brass: "#b08d57",
  oxblood: "#5d2a22",
  moss: "#4b5a44",
  ember: "#ff5a26",
  signal: "#f3efe6",
};
export const fonts = {
  display: '"Bricolage Grotesque", "Arial Narrow", Arial, sans-serif',
  serif: '"Instrument Serif", Georgia, serif',
  mono: '"DM Mono", ui-monospace, Consolas, monospace',
};
/** One metre of surface maps to this many texture repeats; box UVs are scaled to match. */
export const TILE = 3;

function valueNoise(seed) {
  const random = seeded(seed), grid = new Float32Array(64 * 64);
  for (let i = 0; i < grid.length; i++) grid[i] = random();
  const at = (x, y) => grid[((y & 63) << 6) | (x & 63)];
  // px/py are the lattice periods, so a texture that spans a whole period tiles seamlessly.
  return (x, y, px = 64, py = 64) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (at(x0, y0) * (1 - u) + at(x1, y0) * u) * (1 - v) + (at(x0, y1) * (1 - u) + at(x1, y1) * u) * v;
  };
}
function paint(size, shade) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d"), image = ctx.createImageData(size, size), d = image.data;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [r, g, b] = shade(x / size, y / size), i = (y * size + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  return { canvas: c, ctx };
}
function texture(canvas, color = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** Tileable procedural surfaces. All periods divide 64 so edges meet cleanly. */
export function surfaceTexture(kind) {
  const n = valueNoise({ wood: 12, plaster: 94, stone: 31, fabric: 57, concrete: 73 }[kind] || 5);
  const fbm = (x, y, octaves, px, py) => {
    let sum = 0, amp = 0.5, scale = 1;
    for (let i = 0; i < octaves; i++) { sum += n(x * scale, y * scale, px * scale, py * scale) * amp; amp *= 0.5; scale *= 2; }
    return sum;
  };
  if (kind === "wood") {
    // Long walnut figure: stretched noise, a few darker growth lines, plank joints.
    const { canvas, ctx } = paint(512, (u, v) => {
      const figure = fbm(u * 8 + fbm(u * 2, v * 16, 3, 2, 16) * 2.2, v * 64, 4, 8, 64), streak = Math.pow(n(u * 4, v * 128, 4, 128), 3);
      const k = 0.66 + figure * 0.42 - streak * 0.22;
      return [150 * k, 106 * k, 74 * k];
    });
    ctx.fillStyle = "#2a1a10";
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 4; i++) ctx.fillRect(0, i * 128, 512, 1.2);
    return texture(canvas);
  }
  if (kind === "stone") {
    // Honed limestone slabs with a quiet joint every 1.5 m.
    const { canvas, ctx } = paint(512, (u, v) => {
      const cloud = fbm(u * 8, v * 8, 5, 8, 8), vein = Math.pow(Math.abs(Math.sin((u * 2 + fbm(u * 4, v * 4, 3, 4, 4) * 1.5) * Math.PI * 2)), 14) * 0.08;
      const k = 0.8 + cloud * 0.3 - vein;
      return [176 * k, 168 * k, 156 * k];
    });
    ctx.strokeStyle = "#4b453d";
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.5, 0.5, 256, 512);
    ctx.strokeRect(256.5, 0.5, 256, 512);
    ctx.beginPath(); ctx.moveTo(0, 256.5); ctx.lineTo(512, 256.5); ctx.stroke();
    return texture(canvas);
  }
  if (kind === "fabric") {
    const { canvas } = paint(256, (u, v) => {
      const weave = (Math.sin(u * Math.PI * 128) * 0.5 + 0.5) * (Math.sin(v * Math.PI * 128) * 0.5 + 0.5);
      const k = 0.82 + weave * 0.14 + fbm(u * 16, v * 16, 2, 16, 16) * 0.1;
      return [235 * k, 228 * k, 214 * k];
    });
    return texture(canvas);
  }
  const { canvas } = paint(512, (u, v) => {
    // Hand-trowelled plaster / board-formed concrete: broad clouds with a fine tooth.
    const cloud = fbm(u * 4, v * 4, 5, 4, 4), tooth = n(u * 64, v * 64, 64, 64) * 0.05, band = kind === "concrete" ? Math.pow(n(1, v * 16, 64, 16), 2) * 0.05 : 0;
    const k = 0.84 + cloud * 0.22 + tooth - band;
    return [238 * k, 232 * k, 220 * k];
  });
  return texture(canvas);
}
/** Scales a box's UVs to its real size so every surface shares one texel density. */
export function worldUV(geometry, w, h, d) {
  const uv = geometry.attributes.uv, sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++)
    for (let i = 0; i < 4; i++) {
      const index = face * 4 + i;
      uv.setXY(index, (uv.getX(index) * sizes[face][0]) / TILE, (uv.getY(index) * sizes[face][1]) / TILE);
    }
  return geometry;
}
export function materials() {
  const plaster = surfaceTexture("plaster"), concrete = surfaceTexture("concrete"), wood = surfaceTexture("wood"), stone = surfaceTexture("stone"), fabric = surfaceTexture("fabric");
  fabric.repeat.set(4, 4);
  const standard = (options) => new THREE.MeshStandardMaterial(options);
  const m = {
    leaf: standard({ color: "#3f5238", roughness: 0.85 }),
    wall: standard({ color: palette.plaster, map: plaster, bumpMap: plaster, bumpScale: 0.6, roughness: 0.93 }),
    concrete: standard({ color: "#9a9287", map: concrete, bumpMap: concrete, bumpScale: 0.8, roughness: 0.86 }),
    floor: standard({ color: "#a39a8c", map: stone, bumpMap: stone, bumpScale: 0.25, roughness: 0.42, metalness: 0.04 }),
    ceiling: standard({ color: "#c9c0b0", map: plaster, roughness: 1 }),
    wood: standard({ color: "#b98a62", map: wood, bumpMap: wood, bumpScale: 0.35, roughness: 0.52 }),
    walnut: standard({ color: "#8a5f42", map: wood, bumpMap: wood, bumpScale: 0.35, roughness: 0.46 }),
    dark: standard({ color: "#211d1a", roughness: 0.78 }),
    black: standard({ color: "#0f0e0d", roughness: 0.32, metalness: 0.25 }),
    rubber: standard({ color: "#161514", roughness: 0.95 }),
    metal: standard({ color: "#a7a39a", roughness: 0.34, metalness: 0.9 }),
    chrome: standard({ color: "#dedad2", roughness: 0.12, metalness: 1 }),
    bronze: standard({ color: palette.brass, roughness: 0.3, metalness: 0.85 }),
    fabric: standard({ color: "#cfc4b1", map: fabric, bumpMap: fabric, bumpScale: 0.5, roughness: 1 }),
    felt: standard({ color: palette.oxblood, map: fabric, roughness: 1 }),
    leather: standard({ color: "#3a2a22", roughness: 0.55 }),
    glass: standard({ color: "#cfd9d2", transparent: true, opacity: 0.13, roughness: 0.04, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 }),
    smoked: standard({ color: "#0b0a09", transparent: true, opacity: 0.72, roughness: 0.06, metalness: 0.4, depthWrite: false }),
    ivory: standard({ color: "#ebe3d2", roughness: 0.38 }),
    paper: standard({ color: "#e7dcc8", roughness: 0.95 }),
    vinyl: standard({ color: "#0a0a0a", roughness: 0.22, metalness: 0.35 }),
    light: new THREE.MeshBasicMaterial({ color: "#ffd9a6", toneMapped: false }),
    softlight: new THREE.MeshBasicMaterial({ color: "#f4ead8", toneMapped: false }),
    ember: new THREE.MeshBasicMaterial({ color: palette.ember, toneMapped: false }),
    led: new THREE.MeshBasicMaterial({ color: "#ffb37a", toneMapped: false }),
    off: standard({ color: "#2a2623", roughness: 0.5 }),
    rug: standard({ color: "#3d3a34", map: fabric, bumpMap: fabric, bumpScale: 0.8, roughness: 1 }),
    rugWarm: standard({ color: "#8f5a3c", map: fabric, bumpMap: fabric, bumpScale: 0.8, roughness: 1 }),
    water: standard({ color: "#273a3d", roughness: 0.08, metalness: 0.7, envMapIntensity: 1.4 }),
  };
  // Practical light sources bloom on HIGH/ULTRA; the lighting manager scales these.
  // Matte, untextured surfaces are merged into a single vertex-coloured material per room.
  for (const key of ["dark", "rubber", "leaf", "off", "paper"]) m[key].userData.paint = true;
  // Fixed glazing can be merged; sliding doors keep their own copy.
  m.glass.userData.mergeable = true;
  m.light.userData.glow = 2.6;
  m.softlight.userData.glow = 1.6;
  m.ember.userData.glow = 3.2;
  m.led.userData.glow = 2.2;
  return m;
}
export function setAnisotropy(m, level) {
  for (const material of Object.values(m)) for (const key of ["map", "bumpMap"]) if (material[key]) { material[key].anisotropy = level; material[key].needsUpdate = true; }
}
/**
 * A canvas that is redrawn while you watch it — a display, a meter, the timeline. On integrated graphics every
 * upload into an sRGB texture stalls the frame for tens of milliseconds, whatever its size, so these are stored
 * as plain bytes and decoded in the shader instead: the arrangement three.js itself uses for video.
 * The texture and its material go together.
 */
export function liveTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}
const liveMap = `#ifdef USE_MAP
	vec4 sampledDiffuseColor = sRGBTransferEOTF( texture2D( map, vMapUv ) );
	diffuseColor *= sampledDiffuseColor;
#endif`;
export function liveMaterial(material) {
  material.onBeforeCompile = (shader) => { shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", liveMap); };
  material.customProgramCacheKey = () => "live";
  return material;
}
/** Architectural lettering. `style` picks a voice: display (statements), serif (human), mono (system). */
export function textTexture(text, { width = 1024, height = 256, color = palette.bone, sub = "", bg = null, size = 68, style = "mono", align = "center", weight = null, spacing = null, subColor = "#9a9082" } = {}) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height); }
  const lines = String(text).split("\n"), x = align === "left" ? 28 : align === "right" ? width - 28 : width / 2;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const family = fonts[style] || fonts.mono;
  ctx.font = `${weight || (style === "display" ? 800 : 400)} ${style === "serif" ? "italic " : ""}${size}px ${family}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = (spacing ?? (style === "mono" ? size * 0.16 : style === "display" ? -size * 0.035 : 0)) + "px";
  if ("fontStretch" in ctx && style === "display") ctx.fontStretch = "condensed";
  const lineHeight = size * (style === "display" ? 0.86 : 1.1), block = lineHeight * lines.length, top = (sub ? height * 0.44 : height / 2) - block / 2 + lineHeight / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineHeight, width - 40));
  if (sub) {
    ctx.font = `400 ${Math.max(13, size * 0.24)}px ${fonts.mono}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
    ctx.fillStyle = subColor;
    ctx.fillText(sub, x, top + block - lineHeight / 2 + size * 0.42, width - 40);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
