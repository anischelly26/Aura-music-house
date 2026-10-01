import * as THREE from "three";
import { seeded } from "./layout.js";
export function surfaceTexture(kind) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d"),
    random = seeded(kind === "wood" ? 12 : 94),
    d = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4,
        n = (random() - 0.5) * 8;
      const v =
        kind === "wood"
          ? 185 + Math.sin(x * 0.65 + Math.sin(y * 0.01) * 0.8) * 4 + n * 0.4
          : 185 + n;
      d.data[i] = v;
      d.data[i + 1] = v;
      d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
  ctx.putImageData(d, 0, 0);
  if (kind === "stone") {
    ctx.strokeStyle = "#aaa79f50";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 39);
      ctx.bezierCurveTo(75, i * 37 + 10, 110, i * 48 - 10, 256, i * 40 + 3);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(kind === "wood" ? 2 : 4, kind === "wood" ? 3 : 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
export function materials() {
  const concrete = surfaceTexture("concrete"),
    wood = surfaceTexture("wood"),
    stone = surfaceTexture("stone");
  return {
    leaf: new THREE.MeshStandardMaterial({color: "#435743", roughness: .9}),
    wall: new THREE.MeshStandardMaterial({
      color: "#bbb7aa",
      map: concrete,
      bumpMap: concrete, bumpScale: .025,
      roughness: 0.89,
    }),
    floor: new THREE.MeshStandardMaterial({
      color: "#8b877b",
      map: stone,
      bumpMap: stone, bumpScale: .018,
      roughness: 0.62,
    }),
    ceiling: new THREE.MeshStandardMaterial({
      color: "#98968d",
      map: concrete,
      roughness: 1,
    }),
    wood: new THREE.MeshStandardMaterial({
      color: "#9d8467",
      map: wood,
      bumpMap: wood, bumpScale: .015,
      roughness: 0.68,
    }),
    dark: new THREE.MeshStandardMaterial({ color: "#252926", roughness: 0.75 }),
    black: new THREE.MeshStandardMaterial({
      color: "#121715",
      roughness: 0.25,
      metalness: 0.15,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: "#8f8a79",
      roughness: 0.3,
      metalness: 0.75,
    }),
    bronze: new THREE.MeshStandardMaterial({
      color: "#947950",
      roughness: 0.32,
      metalness: 0.65,
    }),
    fabric: new THREE.MeshStandardMaterial({ color: "#afa493", roughness: 1 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: "#bed3c8",
      transparent: true,
      opacity: 0.17,
      roughness: 0.12,
      metalness: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    ivory: new THREE.MeshStandardMaterial({
      color: "#e6ded0",
      roughness: 0.42,
    }),
    light: new THREE.MeshBasicMaterial({ color: "#ffe0b0", toneMapped: false }),
    softlight: new THREE.MeshBasicMaterial({
      color: "#d4d8ce",
      toneMapped: false,
    }),
    rug: new THREE.MeshStandardMaterial({ color: "#505951", roughness: 1 }),
    water: new THREE.MeshStandardMaterial({
      color: "#4c6768",
      roughness: 0.2,
      metalness: 0.52,
    }),
  };
}
export function textTexture(
  text,
  {
    width = 1024,
    height = 256,
    color = "#dfd8c7",
    sub = "",
    bg = null,
    size = 68,
  } = {},
) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.font = `300 ${size}px Arial`;
  ctx.fillText(text, width / 2, height * 0.48, width-64);
  if (sub) {
    ctx.font = "18px Arial";
    ctx.fillStyle = "#aaa497";
    ctx.fillText(sub, width / 2, height * 0.78,width-48);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
