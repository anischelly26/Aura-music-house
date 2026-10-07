import * as THREE from "three";
import { Device, clamp } from "../device.js";
import { fonts, palette } from "../../house/materials.js";

/**
 * A games console wired to the media wall. Sit, switch it on, and the arrangement
 * on the wall gives way to a small game; your music keeps playing underneath.
 */
export class GameConsole extends Device {
  constructor(world, options) {
    super(world, { name: "console", label: "SUNDOWN RALLY", verb: "PLAY", view: { position: [0, 0, 0], target: [0, 0, 0] }, range: 4.2, ...options });
    this.dim = 0.8;
    this.hints = [["← →", "MOVE"], ["CLICK", "START · PAUSE"], ["SPACE", "MUSIC"], ["ESC", "BACK"]];
    const m = this.m;
    this.body(this.box(0.3, 0.045, 0.2, 0, 0.0225, 0, m.black, this.group, 0.008));
    this.lamp = this.live(this.box(0.03, 0.003, 0.004, -0.11, 0.022, 0.101, m.off));
    for (const x of [0.27, 0.42]) { const pad = this.box(0.11, 0.02, 0.06, x, 0.01, 0.03, m.ivory, this.group, 0.008); pad.rotation.y = x * 1.2; this.box(0.012, 0.006, 0.012, x - 0.025, 0.022, 0.03, m.black).rotation.y = x * 1.2; }
    this.bake();
    this.screen = world.architecture.wallScreen;
    this.plane = new THREE.Plane();
    this.point = new THREE.Vector3();
    addEventListener("keyup", (e) => this.game?.keys.delete(e.code));
  }
  get game() {
    return window.aura.game;
  }
  /** The view is of the wall, not of the box under it. */
  get view() {
    return { position: new THREE.Vector3(0.1, 0.92, 2.1), target: new THREE.Vector3(0, 2.28, -5.34), fov: 44 };
  }
  onEnter() {
    this.started = performance.now();
    this.game.enterWorld();
    this.lamp.material = this.m.ember;
    this.w.sound.console();
    this.screen.custom = (s, state, now) => this.paint(s, now);
  }
  onExit() {
    this.game.leaveWorld();
    this.lamp.material = this.m.off;
    this.screen.custom = null;
    this.screen.dirty = true;
    this.screen.pieceId = null;
  }
  onClick() {
    this.game.toggle();
    this.w.sound.press();
  }
  onKey(e) {
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") { this.game.keys.add(e.code); return true; }
    if (e.code === "Enter") { this.onClick(); return true; }
    return false;
  }
  paint(s, now) {
    const ctx = s.canvas.getContext("2d"), W = s.canvas.width, H = s.canvas.height, game = this.game, k = (now - this.started) / 900;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, W, H);
    const gw = Math.round((H * 16) / 9), gx = (W - gw) / 2;
    if (k < 1 && !this.w.reduced) {
      // A tube warming up: a line, then a picture.
      const wide = clamp(k * 2.6), tall = Math.max(0.006, Math.pow(clamp((k - 0.38) / 0.62), 2));
      ctx.save();
      ctx.beginPath(); ctx.rect(gx + (gw * (1 - wide)) / 2, (H * (1 - tall)) / 2, gw * wide, H * tall); ctx.clip();
      ctx.drawImage(game.canvas, gx, 0, gw, H);
      ctx.globalAlpha = 1 - clamp((k - 0.5) * 2); ctx.fillStyle = "#fff1dc"; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    ctx.drawImage(game.canvas, gx, 0, gw, H);
    ctx.font = `500 15px ${fonts.mono}`; ctx.fillStyle = "#8c8478"; ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
    ctx.save(); ctx.translate(gx / 2, H / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("SUNDOWN RALLY", 0, 0); ctx.restore();
    ctx.save(); ctx.translate(W - gx / 2, H / 2); ctx.rotate(Math.PI / 2); ctx.textAlign = "center"; ctx.fillStyle = palette.bone; ctx.fillText(`SCORE ${game.state.score}  ·  ROUND ${game.state.round}  ·  BEST ${game.high}`, 0, 0); ctx.restore();
  }
  update(dt) {
    super.update(dt);
    if (!this.focused || !this.w.director.holding || this.w.touch) return;
    // The paddle follows the cursor across the wall.
    const mesh = this.screen.mesh, ray = this.w.interaction.ray().ray;
    mesh.updateWorldMatrix(true, false);
    this.plane.setFromNormalAndCoplanarPoint(this.point.set(0, 0, 1).transformDirection(mesh.matrixWorld), mesh.getWorldPosition(new THREE.Vector3()));
    if (!ray.intersectPlane(this.plane, this.point)) return;
    const local = mesh.worldToLocal(this.point), gw = (this.screen.h * 16) / 9;
    if (!this.game.keys.size) this.game.state.target = clamp(local.x / gw + 0.5, 0.09, 0.91);
  }
}
