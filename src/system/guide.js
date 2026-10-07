import * as THREE from "three";
import { palette } from "../house/materials.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * AURA school and the first visit. Nothing here is a slideshow: each step waits
 * for the visitor to do the thing with their own hands, and the house points the
 * way with light.
 */
export class Guide {
  constructor(world) {
    this.w = world;
    this.token = 0;
    // A column of light over wherever AURA wants you to go…
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 128;
    const ctx = c.getContext("2d"), grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "#00000000");
    grad.addColorStop(0.55, "#ffffff30");
    grad.addColorStop(1, "#ffffffc0");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 128);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 4.6, 28, 1, true), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: "#ffb37a", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.ground = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 48), new THREE.MeshBasicMaterial({ color: palette.ember, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.ground.rotation.x = -Math.PI / 2;
    // …and a small ring around the exact control to touch.
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 8, 40), new THREE.MeshBasicMaterial({ color: palette.ember, transparent: true, opacity: 0, depthTest: false, toneMapped: false }));
    this.ring.renderOrder = 9;
    for (const mesh of [this.beam, this.ground, this.ring]) { mesh.visible = false; world.scene.add(mesh); }
    this.beacon = null;
    this.marked = null;
    this.position = new THREE.Vector3();
    this.box = new THREE.Box3();
    this.size = new THREE.Vector3();
    world.devices.push(this);
    this.group = this.beam;
    this.reach = Infinity;
  }
  get focused() {
    return false;
  }
  refresh() {}
  lessons() {
    return [["rhythm", "RHYTHM"], ["synthesis", "SYNTHESIS"], ["mixing", "MIXING"], ["arrange", "ARRANGING"], ["sampling", "SAMPLING"]];
  }
  // ——— Pointing ———
  light(point) {
    this.beacon = point ? new THREE.Vector3(point.x, this.w.architecture.groundHeight(point.x, point.z), point.z) : null;
  }
  mark(mesh) {
    this.marked = mesh || null;
  }
  clear() {
    this.light(null);
    this.mark(null);
  }
  update(dt, bands, t) {
    const pulse = 0.6 + 0.4 * Math.sin(t / 260), show = (mesh, on, max) => { mesh.material.opacity += ((on ? max : 0) - mesh.material.opacity) * (1 - Math.exp(-dt * 4)); mesh.visible = mesh.material.opacity > 0.01; };
    if (this.beacon) {
      const near = Math.hypot(this.w.camera.position.x - this.beacon.x, this.w.camera.position.z - this.beacon.z) < 1.6;
      this.beam.position.set(this.beacon.x, this.beacon.y + 2.3, this.beacon.z);
      this.ground.position.set(this.beacon.x, this.beacon.y + 0.03, this.beacon.z);
      this.ground.scale.setScalar(1 + (1 - pulse) * 0.5);
      show(this.beam, !near, 0.34 + pulse * 0.12);
      show(this.ground, !near, 0.5 + pulse * 0.4);
    } else { show(this.beam, false, 0); show(this.ground, false, 0); }
    const target = this.marked;
    if (target && target.parent) {
      this.box.setFromObject(target).getSize(this.size);
      this.box.getCenter(this.position);
      this.ring.position.copy(this.position);
      this.ring.quaternion.copy(this.w.camera.quaternion);
      this.ring.scale.setScalar(Math.max(this.size.x, this.size.y, this.size.z) * (0.72 + (1 - pulse) * 0.18) + 0.006);
      show(this.ring, true, 0.55 + pulse * 0.45);
    } else show(this.ring, false, 0);
  }
  /** Where to stand to use an instrument, and what to look at. */
  spot(device) {
    const view = device.view, target = view.target, flat = new THREE.Vector3(view.position.x - target.x, 0, view.position.z - target.z);
    if (flat.lengthSq() < 0.01) flat.set(0, 0, 1);
    flat.normalize();
    // Step back from the instrument until there is floor to stand on.
    for (let d = 0.7; d < 3.2; d += 0.15) {
      const x = target.x + flat.x * d, z = target.z + flat.z * d;
      if (this.w.architecture.canWalk(x, z)) return { x, z, look: [target.x, target.y, target.z] };
    }
    return { x: view.position.x, z: view.position.z, look: [target.x, target.y, target.z] };
  }
  /** Walks the visitor to an instrument and, on arrival, moves in to it. */
  goTo(device, focus = true) {
    const w = this.w, spot = this.spot(device);
    if (w.interaction.focused) w.blur(true);
    if (w.player.seat) w.stand();
    w.returnHouse();
    this.light(spot);
    return new Promise((resolve) => w.walkTo(spot.x, spot.z, { look: spot.look, done: () => { this.light(null); if (focus) device.enter(); resolve(); } }));
  }
  /**
   * Resolves when the visitor does something: a control is touched, an instrument is entered, a question is asked.
   * `project` and `transport` describe a state of the session rather than a moment, so those are also re-checked
   * on a slow clock in case the state was reached another way; pass `watch` to do the same for any other test
   * that reads state and ignores the event.
   */
  until(type, test = () => true, token = this.token, watch = type === "project" || type === "transport") {
    let cancel;
    const promise = new Promise((resolve) => {
      let poll;
      const check = (event) => {
        if (token !== this.token) return cancel();
        let ok = false;
        try { ok = test(event?.detail, event); } catch {}
        if (ok) { off(); resolve(true); }
      };
      const targets = type === "project" ? [[this.w.studio.store, "change"]] : type === "transport" ? [[this.w.studio.engine, "transport"]] : [[this.w.events, type]];
      const off = () => { for (const [target, name] of targets) target.removeEventListener(name, check); clearInterval(poll); };
      cancel = () => { off(); resolve(false); };
      for (const [target, name] of targets) target.addEventListener(name, check);
      // A lesson that has ended must not leave its listeners behind, so every wait keeps a slow clock to notice.
      poll = setInterval(() => { if (watch || token !== this.token) check(null); }, 500);
    });
    // A wait that lost a race (the step was skipped) is withdrawn by whoever started it.
    promise.cancel = cancel;
    return promise;
  }
  control(device, label) {
    return device.controls.find((mesh) => { const use = mesh.userData.use, text = typeof use.label === "function" ? use.label() : use.label; return typeof text === "string" && text.toUpperCase().startsWith(label); });
  }
  stop() {
    this.token++;
    this.clear();
  }
  async step(token, text, { mark = null, until, chips = [] }) {
    if (token !== this.token) return false;
    this.mark(mark);
    this.w.mentor.say(text, { chips: [...chips, { label: "SKIP", run: () => this.w.events.dispatchEvent(new Event("skip")) }, { label: "END LESSON", run: () => { this.stop(); this.w.mentor.say("We can pick it up any time.", { quiet: true, hold: 2600 }); } }], hold: 600000 });
    const skip = this.until("skip", () => true, token), done = await Promise.race([until, skip]);
    until.cancel?.();
    skip.cancel();
    if (token !== this.token) return false;
    this.w.sound.confirm();
    this.w.aura?.speak(1);
    return done;
  }
  async lesson(id) {
    const w = this.w, s = w.studio, token = ++this.token, m = w.mentor, e = s.engine;
    const at = async (device, opening) => {
      if (device.focused) return true;
      await m.say(opening, { chips: [{ label: "TAKE ME THERE", run: () => this.goTo(device) }], hold: 600000 });
      this.light(this.spot(device));
      const arrived = await this.until("focus", (name) => name === device.name, token);
      this.light(null);
      return arrived && token === this.token;
    };
    const drumHas = (pitch, steps) => { const clip = s.getProject().tracks.find((t) => t.instrument === "drums")?.clips[0]; return steps.every((i) => clip?.notes.some((n) => n.pitch === pitch && Math.abs(n.start - i / 4) < 0.05)); };
    const said = (device, label) => (d) => d?.device === device.name && String(d.control).toUpperCase().startsWith(label);
    if (id === "rhythm") {
      const d = w.drums;
      if (!(await at(d, "Rhythm begins with a pulse. The pads are on the desk by the east wall — follow the light, or let me take you."))) return;
      if (!(await this.step(token, "Hit the kick. Bottom left. Harder toward the middle of the pad.", { mark: this.control(d, "KICK"), until: this.until("control", said(d, "KICK"), token) }))) return;
      // A project that already has the pattern is shown it, and asked to change it, rather than told to build it.
      if (drumHas(36, [0, 4, 8, 12])) {
        if (!(await this.step(token, "The row at the front is one bar in sixteen steps. Yours already has the kick on 1, 5, 9 and 13 — add one more, or take one out and hear the hole.", { mark: this.control(d, "KICK · 01"), until: this.until("control", said(d, "KICK ·"), token) }))) return;
      } else if (!(await this.step(token, "That sound needs a place in time. The row at the front is one bar in sixteen steps. Light 1, 5, 9 and 13.", { mark: this.control(d, "KICK · 01"), until: this.until("project", () => drumHas(36, [0, 4, 8, 12]), token) }))) return;
      if (drumHas(38, [4, 12])) {
        if (!(await this.step(token, "Now hit the snare. The row changes to show it: 5 and 13, the backbeat, already in place.", { mark: this.control(d, "SNARE"), until: this.until("control", said(d, "SNARE"), token) }))) return;
      } else if (!(await this.step(token, "Now hit the snare so the row shows it — then light 5 and 13. That is the backbeat.", { mark: this.control(d, "SNARE"), until: this.until("project", () => drumHas(38, [4, 12]), token) }))) return;
      if (!e.playing && !(await this.step(token, "Press play and count with it: one, two, three, four.", { mark: this.control(d, "PLAY"), until: this.until("transport", () => e.playing, token) }))) return;
      if (!(await this.step(token, "Now turn SWING a little. Listen to the off-beats lean back.", { mark: this.control(d, "SWING"), until: this.until("control", said(d, "SWING"), token) }))) return;
      this.finish(token, "That is a beat, and it is in your project. Everything else is variation.");
    } else if (id === "synthesis") {
      const d = w.synth;
      if (!(await at(d, "Every synthesizer is three ideas: a tone, a filter, a shape. Come to the keys."))) return;
      if (!(await this.step(token, "Start with one oscillator. Hold any key, or press A on your keyboard.", { until: this.until("control", said(d, "KEY"), token) }))) return;
      if (!(await this.step(token, "That is the raw tone. Change the waveform: press SAW and play again. More harmonics, more edge.", { mark: this.control(d, "SAW"), until: this.until("control", said(d, "SAW"), token) }))) return;
      if (!(await this.step(token, "Now the filter. Turn BRIGHT down and the top of the sound closes.", { mark: this.control(d, "BRIGHT"), until: this.until("control", said(d, "BRIGHT"), token) }))) return;
      if (!(await this.step(token, "ATTACK is how a note begins. Turn it up and the sound fades in instead of striking.", { mark: this.control(d, "ATTACK"), until: this.until("control", said(d, "ATTACK"), token) }))) return;
      if (!(await this.step(token, "RELEASE is how it ends. Long release, and notes overlap into a pad.", { mark: this.control(d, "RELEASE"), until: this.until("control", said(d, "RELEASE"), token) }))) return;
      this.finish(token, "Tone, filter, shape. You just designed a sound, and the track remembers it.");
    } else if (id === "mixing") {
      const d = w.mixer;
      if (!(await at(d, "Mixing is deciding what matters most. The console is at the end of the desk."))) return;
      if (!e.playing && !(await this.step(token, "Start the music so we are mixing something.", { until: this.until("transport", () => e.playing, token), chips: [{ label: "PLAY", run: () => w.playback.play() }] }))) return;
      if (!(await this.step(token, "Take the first fader all the way down, then bring it back until it sits just under the others.", { mark: this.control(d, "LEVEL"), until: this.until("control", said(d, "LEVEL"), token) }))) return;
      if (!(await this.step(token, "Level is depth. PAN is width: turn one channel a little to the left.", { mark: this.control(d, "PAN"), until: this.until("control", said(d, "PAN"), token) }))) return;
      if (!(await this.step(token, "Solo a channel to hear it alone. Press it again to bring the others back.", { mark: this.control(d, "SOLO"), until: this.until("control", said(d, "SOLO"), token) }))) return;
      this.finish(token, "Balance first, effects later. Most of a mix is those two controls.");
    } else if (id === "arrange") {
      const d = w.timeline;
      if (!(await at(d, "A song is a loop that changes. The table in the lounge is your timeline."))) return;
      if (!(await this.step(token, "Each strip is a track. Drag any clip to move it in time.", { until: this.until("control", (x) => x?.device === "timeline" && x.control === "move", token) }))) return;
      if (!(await this.step(token, "Take a clip by its right edge to make it longer or shorter.", { until: this.until("control", (x) => x?.device === "timeline" && x.control === "resize", token) }))) return;
      if (!(await this.step(token, "Hold Alt and drag: you carry a copy and leave the original.", { until: this.until("control", (x) => x?.device === "timeline" && ["move", "duplicate"].includes(x.control), token) }))) return;
      if (!(await this.step(token, "Drag along the ruler at the front to loop a section while you work on it.", { until: this.until("control", (x) => x?.device === "timeline" && x.control === "loop", token) }))) return;
      this.finish(token, "Move, trim, copy, loop. That is arranging. Press Escape to stand up.");
    } else if (id === "sampling") {
      const d = w.turntable;
      if (!(await at(d, "Sampling is finding two good bars and giving them a new job. The turntable is in the corner by the records."))) return;
      if (!(await this.step(token, "Choose a record from the rack. The needle will find its own way.", { until: this.until("control", said(d, "RECORD"), token) }))) return;
      if (!(await this.step(token, "Let it play. When you hear a bar you like, cut two bars.", { mark: this.control(d, "2 BARS"), until: this.until("control", said(d, "CUT"), token) }))) return;
      this.finish(token, "Those bars are a new audio track on your timeline. Go and see where they fit.");
    }
  }
  finish(token, text) {
    if (token !== this.token) return;
    this.clear();
    this.w.hud.moment({ eyebrow: "AURA SCHOOL", title: "Done.", small: true, hold: 1500 });
    this.w.mentor.say(text, { chips: [{ label: "ANOTHER LESSON", run: () => this.w.mentor.hear("teach me") }] });
  }
  /** The first visit: one line, a light to follow, and a question. Returns true if it began. */
  begin(force = false) {
    const w = this.w;
    if (!force && localStorage.getItem("aura-first-run")) return false;
    const token = ++this.token;
    (async () => {
      await wait(w.reduced ? 300 : 1400);
      if (token !== this.token) return;
      await w.mentor.say("Welcome.", { hold: 60000 });
      await wait(1500);
      if (token !== this.token) return;
      w.hud.hint(w.touch ? [["DRAG", "LOOK"], ["PAD", "WALK"]] : [["CLICK", "LOOK"], ["WASD", "WALK"], ["SHIFT", "HURRY"]], 14000);
      this.light({ x: 0, z: 7.4 });
      w.mentor.say("Walk toward the living room. Follow the light.", { quiet: true, hold: 600000 });
      await Promise.race([this.until("room", () => w.currentRoom === "living", token, true), wait(90000)]);
      if (token !== this.token) return;
      this.light(null);
      try { localStorage.setItem("aura-first-run", "done"); } catch {}
      await w.hud.moment({ eyebrow: "07 — THE LIVING ROOM", title: "Sound\nhas a\nhome.", hold: 2300 });
      if (token !== this.token) return;
      await w.mentor.say("This is where ideas become tracks. The table is your timeline, the wall is your arrangement, and I am the light above them. What do you want to do?", {
        hold: 600000,
        chips: [
          { label: "LEARN", run: () => w.mentor.hear("teach me") },
          { label: "CREATE", run: async () => { await this.goTo(w.timeline); w.mentor.say("Drag clips to move them. Ask me for drums, bass or chords whenever you want them written.", { quiet: true }); } },
          { label: "EXPLORE", run: () => { w.mentor.say("Nine rooms, one for each part of a track. Press T and I will answer from anywhere.", { quiet: true }); w.hud.hint([["E", "USE"], ["TAB", "PHONE"], ["T", "ASK AURA"], ["1–9", "ROOMS"]], 12000); } },
          { label: "JUST LISTEN", run: () => { w.mentor.close(); w.setListening(true); } },
        ],
      });
    })();
    return true;
  }
}
