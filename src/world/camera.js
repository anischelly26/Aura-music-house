import * as THREE from "three";

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// The held views are composed for a frame at least this wide for its height.
const FRAME = 1.5, WIDEST = 78, FURTHEST = 1.7;

/**
 * Designed camera moves: pushing in to an instrument, settling over the timeline,
 * returning to the body. While a move is active the player controller stands down.
 */
export class CameraDirector {
  constructor(world) {
    this.w = world;
    this.state = "idle";
    this.t = 0;
    this.from = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 60 };
    this.to = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 60 };
    this.home = null;
    this.parallax = new THREE.Vector2();
    this.probe = new THREE.PerspectiveCamera();
    this.offset = new THREE.Vector3();
  }
  get active() {
    return this.state !== "idle";
  }
  get holding() {
    return this.state === "hold";
  }
  /** 0 while roaming, 1 while held on an object — drives dimming and the lens vignette. */
  get amount() {
    return this.state === "in" ? ease(this.t) : this.state === "hold" ? 1 : this.state === "out" ? 1 - ease(this.t) : 0;
  }
  pose(position, target, fov) {
    this.probe.position.copy(position);
    this.probe.lookAt(target);
    return { position: position.clone(), quaternion: this.probe.quaternion.clone(), fov };
  }
  focus({ position, target, fov = 46, duration = 1.15, onArrive = null }) {
    const c = this.w.camera;
    // Moving from one held view to another keeps the original standing place as home.
    if (this.state === "idle") this.home = { position: c.position.clone(), quaternion: c.quaternion.clone(), fov: this.w.fieldOfView };
    this.from.position.copy(c.position);
    this.from.quaternion.copy(c.quaternion);
    this.from.fov = c.fov;
    // In a narrower frame — a phone held upright — the lens widens, then the camera steps back, until the instrument fits again.
    const need = FRAME / c.aspect;
    if (need > 1) {
      const half = Math.tan(THREE.MathUtils.degToRad(fov / 2)), lens = Math.min(need, Math.max(1, Math.tan(THREE.MathUtils.degToRad(WIDEST / 2)) / half));
      fov = THREE.MathUtils.radToDeg(Math.atan(half * lens)) * 2;
      position = target.clone().add(position.clone().sub(target).multiplyScalar(Math.min(FURTHEST, need / lens)));
    }
    Object.assign(this.to, this.pose(position, target, fov));
    this.duration = this.w.reduced ? 0.01 : duration;
    this.t = 0;
    this.state = "in";
    this.onArrive = onArrive;
    this.onDone = null;
    this.rest = this.to.position.clone();
    // Close work gets a smaller lean, so a small control does not slide out from under the cursor.
    this.lean = Math.min(0.05, 0.012 * position.distanceTo(target));
  }
  release(duration = 0.85, onDone = null) {
    if (this.state === "idle" || !this.home) return onDone?.();
    const c = this.w.camera;
    this.from.position.copy(c.position);
    this.from.quaternion.copy(c.quaternion);
    this.from.fov = c.fov;
    this.to.position.copy(this.home.position);
    this.to.quaternion.copy(this.home.quaternion);
    this.to.fov = this.home.fov;
    this.duration = this.w.reduced ? 0.01 : duration;
    this.t = 0;
    this.state = "out";
    this.onDone = onDone;
  }
  /** Ends any move immediately at the body's last position. */
  cancel() {
    if (this.state === "idle") return;
    const c = this.w.camera;
    if (this.home) { c.position.copy(this.home.position); c.quaternion.copy(this.home.quaternion); c.fov = this.home.fov; c.updateProjectionMatrix(); }
    this.finish();
  }
  finish() {
    const w = this.w, c = w.camera, done = this.onDone;
    this.state = "idle";
    this.onDone = null;
    c.rotation.setFromQuaternion(c.quaternion, "YXZ");
    w.yaw = w.lookYaw = c.rotation.y;
    w.pitch = w.lookPitch = Math.max(-1.1, Math.min(1.1, c.rotation.x));
    w.player.sync();
    done?.();
  }
  update(dt) {
    if (this.state === "idle") return;
    const c = this.w.camera;
    if (this.state === "hold") {
      // A held view still breathes: the cursor leans the camera a little, in proportion to how far away the work is.
      const p = this.w.pointer, k = 1 - Math.exp(-dt * 3.5);
      this.parallax.x += (p.x * this.lean - this.parallax.x) * k;
      this.parallax.y += (p.y * this.lean * 0.6 - this.parallax.y) * k;
      this.offset.set(this.parallax.x, this.parallax.y, 0).applyQuaternion(this.to.quaternion);
      c.position.copy(this.rest).add(this.offset);
      return;
    }
    this.t = Math.min(1, this.t + dt / this.duration);
    const k = ease(this.t);
    c.position.lerpVectors(this.from.position, this.to.position, k);
    // A slight rise through the middle of the move keeps it from feeling like a slide.
    c.position.y += Math.sin(k * Math.PI) * 0.06 * Math.min(1, this.from.position.distanceTo(this.to.position) / 3);
    c.quaternion.slerpQuaternions(this.from.quaternion, this.to.quaternion, k);
    c.fov = this.from.fov + (this.to.fov - this.from.fov) * k;
    c.updateProjectionMatrix();
    if (this.t < 1) return;
    if (this.state === "in") {
      this.state = "hold";
      this.parallax.set(0, 0);
      const arrived = this.onArrive;
      this.onArrive = null;
      arrived?.();
    } else this.finish();
  }
}
