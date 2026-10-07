import * as THREE from "three";
import { roomAt } from "../house/layout.js";

export const EYE = 1.68;
const GRAVITY = 13;
const STEP = 0.24;

/**
 * First-person body: weighted acceleration, smoothed look, restrained head motion,
 * step-ups and gravity. It shares the house's collision test and never touches audio.
 */
export class PlayerController {
  constructor(world) {
    this.w = world;
    this.vy = 0;
    this.grounded = true;
    this.stride = 0;
    this.bob = 0;
    this.roll = 0;
    this.dip = 0;
    this.dipVelocity = 0;
    this.sprint = 0;
    this.pace = 1;
    this.lookEase = 18;
    this.seat = null;
    this.breath = 0;
    this.kick = new THREE.Vector2();
  }
  ground(x, z) {
    return this.w.architecture.groundHeight(x, z);
  }
  canMove(fromX, fromZ, x, z) {
    const a = this.w.architecture;
    return a.canWalk(x, z) && a.groundHeight(x, z) - a.groundHeight(fromX, fromZ) <= STEP;
  }
  /** Places the body instantly (room jumps, seats, the end of a camera move). */
  place(x, z, eye = EYE) {
    const c = this.w.camera;
    c.position.set(x, this.ground(x, z) + eye, z);
    this.base = c.position.y;
    this.vy = 0;
    this.grounded = true;
    this.dip = this.dipVelocity = this.bob = this.roll = 0;
    this.w.velocity.set(0, 0);
  }
  /** Adopts wherever a camera move left the body, so walking resumes without a jump. */
  sync() {
    this.base = this.w.camera.position.y;
    this.vy = 0;
    this.dip = this.dipVelocity = this.bob = this.roll = 0;
    this.w.velocity.set(0, 0);
  }
  input() {
    const w = this.w, k = w.keys;
    let f = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0),
      s = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    f += w.touchControls.forward;
    s += w.touchControls.strafe;
    let sprint = k.has("ShiftLeft") || k.has("ShiftRight");
    for (const g of navigator.getGamepads?.() || []) {
      if (!g) continue;
      const axis = (v) => (Math.abs(v || 0) > 0.15 ? v : 0);
      s += axis(g.axes[0]);
      f -= axis(g.axes[1]);
      w.rotate(axis(g.axes[2]) * 11, axis(g.axes[3]) * 11);
      sprint ||= !!g.buttons[10]?.pressed;
      if (g.buttons[0]?.pressed && !this.padPressed) w.interact();
      this.padPressed = g.buttons[0]?.pressed;
      break;
    }
    const length = Math.hypot(f, s);
    if (length > 1) { f /= length; s /= length; }
    return { f, s, sprint };
  }
  look(dt) {
    const w = this.w, factor = w.reduced ? 1 : 1 - Math.exp(-dt * this.lookEase);
    w.yaw += Math.atan2(Math.sin(w.lookYaw - w.yaw), Math.cos(w.lookYaw - w.yaw)) * factor;
    w.pitch += (w.lookPitch - w.pitch) * factor;
  }
  update(dt) {
    const w = this.w, c = w.camera, pos = c.position, v = w.velocity;
    if (w.arrival || w.director.active) return;
    if (w.journey) return this.travel(dt);
    this.look(dt);
    if (this.seat) return this.sit(dt);
    const { f, s, sprint } = this.input();
    const moving = Math.hypot(f, s) > 0.01;
    this.sprint += ((sprint && f > 0.1 ? 1 : 0) - this.sprint) * (1 - Math.exp(-dt * 6));
    const speed = w.speed * this.pace * (1 + this.sprint * 0.75) * (f < 0 ? 0.75 : 1);
    let wishX = (-Math.sin(w.yaw) * f + Math.cos(w.yaw) * s) * speed,
      wishZ = (-Math.cos(w.yaw) * f - Math.sin(w.yaw) * s) * speed;
    if (w.walkTarget) {
      const dx = w.walkTarget.x - pos.x, dz = w.walkTarget.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.18) w.walkTarget = null;
      else { wishX = (dx / d) * w.speed; wishZ = (dz / d) * w.speed; }
    }
    // Quick to answer, slower to settle: acceleration and braking use different rates.
    const response = w.smoothing / 10, rate = moving || w.walkTarget ? 9 * response : 7 * response, blend = 1 - Math.exp(-dt * rate);
    v.x += (wishX - v.x) * blend;
    v.y += (wishZ - v.y) * blend;
    if (!moving && !w.walkTarget && v.lengthSq() < 0.0004) v.set(0, 0);
    const nx = pos.x + v.x * dt, nz = pos.z + v.y * dt;
    if (this.canMove(pos.x, pos.z, nx, pos.z)) pos.x = nx;
    else { v.x *= 0.2; w.walkTarget = null; }
    if (this.canMove(pos.x, pos.z, pos.x, nz)) pos.z = nz;
    else { v.y *= 0.2; w.walkTarget = null; }
    this.settle(dt, EYE);
    this.animate(dt, f, s);
    w.setRoom(roomAt(pos.x, pos.z).id);
  }
  /** Gravity, step-ups and the small knee-bend on landing. */
  settle(dt, eye) {
    const w = this.w, pos = w.camera.position, floor = this.ground(pos.x, pos.z) + eye;
    if (this.base === undefined) this.base = floor;
    if (this.base > floor + 0.015) {
      this.grounded = false;
      this.vy -= GRAVITY * dt;
      this.base += this.vy * dt;
      if (this.base <= floor) {
        const impact = -this.vy;
        this.base = floor;
        this.vy = 0;
        this.grounded = true;
        if (impact > 1.2) { this.dipVelocity -= Math.min(1.1, impact * 0.22); w.sound.land(Math.min(1, impact / 4)); }
      }
    } else {
      this.grounded = true;
      this.vy = 0;
      this.base += (floor - this.base) * (1 - Math.exp(-dt * 16));
    }
    // Critically damped spring: the camera dips and recovers without ringing.
    this.dipVelocity += (-this.dip * 90 - this.dipVelocity * 19) * dt;
    this.dip += this.dipVelocity * dt;
    pos.y = this.base + this.dip + this.bob;
  }
  animate(dt, f, s) {
    const w = this.w, speed = w.velocity.length(), reduced = w.reduced;
    const amount = reduced ? 0 : Math.min(1, speed / 3.3) * (this.grounded ? 1 : 0);
    this.stride += speed * dt * 0.62;
    const phase = this.stride * Math.PI * 2, target = Math.sin(phase * 2) * 0.014 * amount * (1 + this.sprint * 0.6);
    this.bob += (target - this.bob) * (1 - Math.exp(-dt * 14));
    if (amount > 0.25) {
      const step = Math.floor(this.stride * 2);
      if (step !== this.lastStep) { this.lastStep = step; w.sound.footstep(0.55 + this.sprint * 0.45, w.architecture.softGround(w.camera.position.x, w.camera.position.z)); }
    }
    this.breath += dt;
    const sway = reduced ? 0 : Math.sin(phase) * 0.0035 * amount, lean = reduced ? 0 : -s * 0.006 * Math.min(1, speed / 2);
    this.roll += (sway + lean - this.roll) * (1 - Math.exp(-dt * 8));
    const idle = reduced ? 0 : Math.sin(this.breath * 0.9) * 0.0012 * (1 - amount);
    this.kick.multiplyScalar(Math.exp(-dt * 9));
    const fov = w.fieldOfView + this.sprint * 4 * (reduced ? 0 : 1) + w.fovOffset;
    if (Math.abs(w.camera.fov - fov) > 0.01) { w.camera.fov += (fov - w.camera.fov) * (1 - Math.exp(-dt * 7)); w.camera.updateProjectionMatrix(); }
    w.camera.rotation.set(w.pitch + idle + this.kick.y, w.yaw + this.kick.x, this.roll, "YXZ");
  }
  sitDown(seat) {
    const w = this.w;
    this.seat = seat;
    w.velocity.set(0, 0);
    w.journey = w.walkTarget = null;
    this.standAt = { x: w.camera.position.x, z: w.camera.position.z };
    this.seatBlend = 0;
    this.seatFrom = w.camera.position.clone();
    if (seat.yaw !== undefined) w.lookYaw = w.yaw + Math.atan2(Math.sin(seat.yaw - w.yaw), Math.cos(seat.yaw - w.yaw));
    w.lookPitch = seat.pitch ?? -0.06;
    w.sound.seat();
  }
  /** A seat's way out — or the nearest clear floor, if something has since been put where it was. */
  clear(point, seat) {
    const a = this.w.architecture;
    if (a.canWalk(point.x, point.z)) return point;
    for (let radius = 0.4; radius <= 3; radius += 0.2)
      for (let i = 0; i < 16; i++) {
        const x = seat.eye.x + Math.cos((i / 16) * Math.PI * 2) * radius, z = seat.eye.z + Math.sin((i / 16) * Math.PI * 2) * radius;
        if (a.canWalk(x, z)) return { x, z };
      }
    return point;
  }
  stand() {
    if (!this.seat) return;
    const w = this.w, seat = this.seat, exit = this.clear(seat.exit || this.standAt, seat);
    this.seat = null;
    w.camera.position.x = exit.x;
    w.camera.position.z = exit.z;
    this.base = w.camera.position.y;
    w.sound.seat();
    seat.onStand?.();
  }
  sit(dt) {
    const w = this.w, seat = this.seat, pos = w.camera.position;
    this.seatBlend = Math.min(1, this.seatBlend + dt / (w.reduced ? 0.01 : 0.9));
    const t = this.seatBlend, ease = t * t * (3 - 2 * t);
    pos.lerpVectors(this.seatFrom, seat.eye, ease);
    this.base = pos.y;
    // Settle into the cushion at the end of the move.
    const sink = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.035 * (1 - t);
    pos.y -= sink;
    const { f, s } = this.input();
    if (t >= 1 && (Math.abs(f) > 0.5 || Math.abs(s) > 0.5)) return this.stand();
    this.breath += dt;
    const idle = w.reduced ? 0 : Math.sin(this.breath * 0.8) * 0.0018;
    this.roll *= Math.exp(-dt * 6);
    const fov = w.fieldOfView - 3 + w.fovOffset;
    if (Math.abs(w.camera.fov - fov) > 0.01) { w.camera.fov += (fov - w.camera.fov) * (1 - Math.exp(-dt * 4)); w.camera.updateProjectionMatrix(); }
    w.camera.rotation.set(w.pitch + idle, w.yaw, this.roll, "YXZ");
  }
  /** Guided walk along a planned route (room shortcuts, click-to-walk, AURA leading the way). */
  travel(dt) {
    const w = this.w, c = w.camera, pos = c.position, j = w.journey;
    if (j.arrived) {
      if (j.facing) c.quaternion.slerp(j.facing, 1 - Math.exp(-dt * 6));
      if (!j.facing || c.quaternion.angleTo(j.facing) < 0.005) w.finishJourney(j);
      return;
    }
    const target = j.points[j.index], dx = target.x - pos.x, dz = target.z - pos.z, distance = Math.hypot(dx, dz);
    const last = j.index === j.points.length - 1;
    const cruise = j.speed || Math.min(5.2, w.speed * 1.55), speed = cruise * (last ? Math.min(1, 0.25 + distance / 2.5) : 1);
    j.pace = (j.pace ?? 0) + (speed - (j.pace ?? 0)) * (1 - Math.exp(-dt * 5));
    if (distance < dt * j.pace + 0.08) {
      pos.x = target.x;
      pos.z = target.z;
      j.index++;
      if (j.index >= j.points.length) {
        j.arrived = true;
        if (!j.facing) w.finishJourney(j);
      }
    } else {
      pos.x += (dx / distance) * j.pace * dt;
      pos.z += (dz / distance) * j.pace * dt;
      w.velocity.set((dx / distance) * j.pace, (dz / distance) * j.pace);
      const old = c.quaternion.clone();
      c.lookAt(target.x, pos.y, target.z);
      if (j.facing && last) c.quaternion.slerp(j.facing, Math.max(0, 1 - distance / 4));
      c.quaternion.slerp(old, Math.exp(-dt * 4));
      w.yaw = w.lookYaw = c.rotation.y;
      w.pitch = w.lookPitch = c.rotation.x;
    }
    this.settle(dt, EYE);
    const amount = w.reduced ? 0 : Math.min(1, j.pace / 3.3);
    this.stride += j.pace * dt * 0.62;
    this.bob += (Math.sin(this.stride * Math.PI * 4) * 0.012 * amount - this.bob) * (1 - Math.exp(-dt * 14));
    const step = Math.floor(this.stride * 2);
    if (step !== this.lastStep && amount > 0.25) { this.lastStep = step; w.sound.footstep(0.5, w.architecture.softGround(pos.x, pos.z)); }
    w.setRoom(roomAt(pos.x, pos.z).id);
  }
}
