import { rooms, roomById } from "../house/layout.js";
import { newProject, noteName, scaleIntervals } from "../project.js";
import { listProjects } from "../storage.js";
import { moods, skies } from "../world/lighting.js";
import { presets as qualities } from "../world/quality.js";
import { coverArt } from "./playback.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clock = (seconds) => Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
const DRUMS = [["KICK", 36], ["SNARE", 38], ["CLAP", 39], ["HAT", 42], ["OPEN", 46]];

/**
 * The phone in your hand. It is a remote for the house, not a second application:
 * everything it shows is the same project, the same transport and the same rooms.
 */
export class Phone {
  constructor(world) {
    this.w = world;
    this.s = world.studio;
    this.pb = world.playback;
    this.root = document.querySelector("#phone");
    this.up = false;
    this.app = "home";
    this.mobile = world.touch && Math.min(innerWidth, innerHeight) < 820;
    document.body.classList.toggle("mobile", this.mobile);
    this.root.innerHTML = '<div class="phoneBody"><div class="phoneScreen"><div class="phoneStatus"><span class="phoneClock"></span><i></i></div><div class="phoneView"></div><div class="phoneBar"><button data-go="home">HOME</button><button class="phoneMini" data-go="now"><i></i><span></span></button><button data-close>CLOSE</button></div></div></div>';
    this.view = this.root.querySelector(".phoneView");
    this.root.addEventListener("click", (e) => {
      const go = e.target.closest("[data-go]");
      if (go) return this.open(go.dataset.go);
      if (e.target.closest("[data-close]")) return this.toggle(false);
      if (this.mobile && e.target.closest(".phoneStatus")) this.toggle();
    });
    this.root.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) world.sound.tick(); });
    addEventListener("mousemove", (e) => {
      if (!this.up || this.mobile) return;
      this.root.style.setProperty("--tiltY", ((e.clientX / innerWidth - 0.75) * 9).toFixed(2) + "deg");
      this.root.style.setProperty("--tiltX", (-(e.clientY / innerHeight - 0.5) * 6).toFixed(2) + "deg");
    });
    this.pb.addEventListener("change", () => this.refresh());
    world.events.addEventListener("room", () => { if (this.up && this.app === "map") this.render(); });
    world.events.addEventListener("quality", () => { if (this.up && this.app === "settings") this.status(); });
    setInterval(() => this.tick(), 250);
    this.refresh();
    if (this.mobile) this.render();
  }
  toggle(force) {
    const up = force ?? !this.up;
    if (up === this.up || !this.w.entered || this.w.arrival) return;
    this.up = up;
    document.body.classList.toggle("phoneUp", up);
    this.w.fovOffset = up && !this.mobile ? -5 : 0;
    if (up) {
      document.exitPointerLock?.();
      if (this.w.interaction.focused) this.w.blur();
      this.w.sound.open();
      this.render();
    } else {
      this.w.sound.close();
      this.w.canvas.focus({ preventScroll: true });
    }
  }
  open(app = "home") {
    this.app = app;
    if (!this.up) this.toggle(true);
    else this.render();
    this.view.scrollTop = 0;
  }
  refresh() {
    const piece = this.pb.current;
    this.root.querySelector(".phoneMini span").textContent = piece.title;
    if (this.up && ["now", "radio", "home"].includes(this.app)) this.render();
  }
  tick() {
    const now = new Date();
    this.root.querySelector(".phoneClock").textContent = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    if (!this.up) return;
    if (this.app === "now") {
      const p = this.pb.progress, scrub = this.view.querySelector(".phoneScrub");
      if (!scrub) return;
      scrub.style.setProperty("--at", (p.fraction * 100).toFixed(1) + "%");
      this.view.querySelector("[data-elapsed]").textContent = clock(p.seconds);
    } else if (this.app === "beat") this.beatStep();
    else if (this.app === "settings") this.status();
  }
  status() {
    const el = this.view.querySelector("[data-perf]");
    if (el && this.w.renderer) el.textContent = this.w.performance.describe();
  }
  $(selector) {
    return this.view.querySelector(selector);
  }
  on(selector, fn) {
    for (const el of this.view.querySelectorAll(selector)) el.onclick = this.w.safe((e) => fn(el, e));
  }
  thumb(canvas, piece) {
    canvas.width = canvas.height = 96;
    canvas.getContext("2d").drawImage(this.pb.cover(piece, 256), 0, 0, 96, 96);
  }
  render() {
    const app = this[this.app] ? this.app : "home";
    this.view.style.animation = "none";
    void this.view.offsetWidth;
    this.view.style.animation = "";
    this[app]();
  }
  head(eyebrow, title) {
    return `<div class="phoneEyebrow">${esc(eyebrow)}</div><div class="phoneTitle">${esc(title)}</div>`;
  }
  // ——— Apps ———
  home() {
    const p = this.s.getProject(), items = [["now", "Now playing", this.pb.current.title], ["projects", "Projects", p.name], ["radio", "Records", `${this.pb.library().length - 1} on the shelf`], ["samples", "Samples", `${Object.keys(p.assets || {}).length} in project`], ["aura", "AURA", "ask · learn"], ["map", "Map", roomById(this.w.currentRoom).name], ["notes", "Notes", ""], ["settings", "Settings", this.w.performance.preset.label]];
    if (this.mobile) items.splice(1, 0, ["beat", "Beat", "16 steps"], ["keys", "Keys", "in key"]);
    this.view.innerHTML = this.head(new Date().toLocaleDateString(document.documentElement.lang || "en", { weekday: "long", day: "numeric", month: "long" }).toUpperCase(), "Good to see you.") + `<ul class="phoneHome">${items.map(([id, name, note], i) => `<li><button data-go="${id}"><small>${String(i + 1).padStart(2, "0")}</small>${esc(name.toUpperCase())}<em>${esc(note)}</em></button></li>`).join("")}</ul>`;
  }
  now() {
    const pb = this.pb, piece = pb.current, p = pb.progress, e = this.s.engine;
    this.view.innerHTML = `<div class="phoneEyebrow">NOW PLAYING · ${piece.kind === "project" ? "YOUR PROJECT" : piece.kind === "vinyl" ? "PRESSED RECORD" : "AURA ORIGINAL"}</div><canvas class="phoneCover" width="512" height="512"></canvas><div class="phoneTrack">${esc(piece.title)}</div><div class="phoneArtist">${esc(piece.detail || piece.artist)}</div><div class="phoneScrub" style="--at:${(p.fraction * 100).toFixed(1)}%"><i></i></div><div class="phoneTimes"><span data-elapsed>${clock(p.seconds)}</span><span>${clock(p.duration)}</span></div><div class="phoneTransport"><button data-prev>PREV</button><button class="phonePlay" data-play>${pb.playing ? "PAUSE" : "PLAY"}</button><button data-next>NEXT</button></div><div class="phoneActions">${piece.kind === "project" ? '<button class="primary" data-go="vinyl">PRESS TO VINYL</button>' : '<button data-project>BACK TO MY PROJECT</button>'}<button data-listen>${this.w.listening ? "STOP LISTENING" : "JUST LISTEN"}</button>${piece.kind === "project" ? `<button data-loop aria-pressed="${e.loop}">LOOP ${e.loop ? "ON" : "OFF"}</button>` : ""}</div><span class="phoneLabel">Master level</span><div class="phoneRange"><input type="range" min="0" max="1" step=".01" value="${this.s.getProject().master}" data-master aria-label="Master level"><output>${Math.round(this.s.getProject().master * 100)}</output></div>`;
    this.$(".phoneCover").getContext("2d").drawImage(pb.cover(piece, 512), 0, 0);
    this.on("[data-play]", () => pb.toggle());
    this.on("[data-prev]", () => pb.previous());
    this.on("[data-next]", () => pb.next());
    this.on("[data-project]", () => pb.select("project"));
    this.on("[data-listen]", () => { this.w.setListening(!this.w.listening); this.toggle(false); });
    this.on("[data-loop]", () => { e.loop = !e.loop; this.render(); });
    this.$(".phoneScrub").onclick = this.w.safe((event) => { const box = event.currentTarget.getBoundingClientRect(); return pb.seek((event.clientX - box.left) / box.width); });
    const master = this.$("[data-master]");
    master.oninput = () => { const p2 = this.s.getProject(); p2.master = Number(master.value); this.s.engine.updateMix(p2); master.nextElementSibling.textContent = Math.round(master.value * 100); };
    master.onchange = () => { const value = Number(master.value); this.s.commit("Master volume", (q) => (q.master = value)); };
  }
  async projects() {
    const p = this.s.getProject();
    this.view.innerHTML = this.head("PROJECTS", p.name) + `<div class="phoneActions"><button class="primary" data-new>NEW</button><button data-starter>STARTER</button><button data-file>OPEN FILE</button><button data-save>SAVE</button><button data-keep>KEEP A VERSION</button><button data-export>EXPORT</button><button data-precise>PRECISE EDITOR</button><button data-workbench>WORKBENCH</button></div><span class="phoneLabel">Saved on this device</span><div data-list><p class="phoneNote">Looking…</p></div>`;
    this.on("[data-new]", () => this.s.selectProject(newProject(true)));
    this.on("[data-starter]", () => this.s.selectProject(newProject()));
    this.on("[data-file]", () => document.querySelector("#projectFile").click());
    this.on("[data-save]", async () => { await this.s.persist(); this.s.toast("Saved on this device."); });
    this.on("[data-keep]", () => { this.toggle(false); return this.w.openMemory(); });
    this.on("[data-export]", () => { this.toggle(false); return this.w.openTool("terrace"); });
    this.on("[data-precise]", () => this.w.production("arrange"));
    this.on("[data-workbench]", () => { this.toggle(false); window.aura.workbench.open(); });
    const sessions = await listProjects().catch(() => []);
    if (this.app !== "projects" || !this.up) return;
    const list = this.$("[data-list]");
    list.innerHTML = sessions.length ? sessions.slice(0, 20).map((x) => `<button class="phoneRow ${x.id === p.id ? "current" : ""}" data-session="${esc(x.id)}"><canvas></canvas><span><strong>${esc(x.name)}</strong><small>${x.bpm} BPM · ${x.tracks.length} TRACKS · ${new Date(x.savedAt).toLocaleDateString()}</small></span></button>`).join("") : '<p class="phoneNote">Nothing saved yet. Your project saves itself as you work.</p>';
    list.querySelectorAll("[data-session]").forEach((row) => {
      const session = sessions.find((x) => x.id === row.dataset.session), canvas = row.querySelector("canvas");
      canvas.width = canvas.height = 96;
      canvas.getContext("2d").drawImage(coverArt({ seed: session.id, title: session.name, subtitle: "", size: 256 }), 0, 0, 96, 96);
      row.onclick = this.w.safe(async () => { await this.s.persist(); await this.s.selectProject(session); this.open("now"); });
    });
  }
  radio() {
    const pb = this.pb, row = (piece) => `<button class="phoneRow ${piece.id === pb.current.id ? "current" : ""}" data-piece="${esc(piece.id)}"><canvas></canvas><span><strong>${esc(piece.title)}</strong><small>${esc(piece.detail || piece.style || piece.artist)}</small></span><em>${piece.id === pb.current.id && pb.playing ? "PLAYING" : ""}</em></button>`;
    const records = pb.records(), originals = pb.originals();
    this.view.innerHTML = this.head("RECORDS", "On the shelf.") + `<span class="phoneLabel">Your project</span>${row(pb.projectPiece())}<span class="phoneLabel">Pressed in this house</span>${records.length ? records.map(row).join("") : '<p class="phoneNote">Press your project to vinyl from Now playing; it appears here and by the turntable.</p>'}<span class="phoneLabel">AURA originals · written by rule, not recorded</span>${originals.map(row).join("")}`;
    this.view.querySelectorAll("[data-piece]").forEach((el) => {
      const piece = pb.library().find((x) => x.id === el.dataset.piece);
      this.thumb(el.querySelector("canvas"), piece);
      el.onclick = this.w.safe(() => (piece.id === pb.current.id ? pb.toggle() : pb.play(piece.id)));
    });
  }
  vinyl() {
    const pb = this.pb, piece = pb.projectPiece();
    this.sleeve ??= 0;
    this.view.innerHTML = this.head("PRESS TO VINYL", piece.title) + `<p class="phoneNote">Choose a sleeve. The record goes on the shelf by the turntable and plays this project as it is saved.</p><div class="phoneSleeves">${[0, 1, 2, 3].map((style) => `<button data-style="${style}" aria-pressed="${style === this.sleeve}"><canvas width="256" height="256"></canvas></button>`).join("")}</div><div class="phoneActions"><button class="primary" data-press>PRESS THIS RECORD</button><button data-go="now">CANCEL</button></div>`;
    this.view.querySelectorAll("[data-style]").forEach((el) => {
      el.querySelector("canvas").getContext("2d").drawImage(coverArt({ seed: piece.seed, title: piece.title, subtitle: piece.detail, style: Number(el.dataset.style), size: 256 }), 0, 0);
      el.onclick = () => { this.sleeve = Number(el.dataset.style); this.render(); };
    });
    this.on("[data-press]", async () => {
      await this.s.persist();
      const record = pb.press({ style: this.sleeve, seed: piece.seed });
      this.w.sound.confirm();
      this.toggle(false);
      this.w.hud.moment({ eyebrow: "PRESSED", title: record.title.split(" ").slice(0, 3).join("\n"), sub: "It is on the shelf by the turntable.", small: true, hold: 2600 });
      this.w.mentor?.say("Your record is by the turntable. Shall I walk you there?", { chips: [{ label: "TAKE ME THERE", run: () => this.w.guide.goTo(this.w.turntable) }] });
    });
  }
  samples() {
    const p = this.s.getProject(), assets = Object.entries(p.assets || {});
    this.view.innerHTML = this.head("SAMPLES", "In this project.") + `<div class="phoneActions"><button class="primary" data-import>IMPORT AUDIO</button><button data-record>RECORD A TAKE</button><button data-library>FULL LIBRARY</button><button data-turntable>CUT FROM A RECORD</button></div>${assets.length ? assets.map(([id, asset]) => `<button class="phoneRow" data-asset="${esc(id)}"><span><strong>${esc((asset.name || "Audio").replace(/\.[a-z0-9]{2,4}$/i, ""))}</strong><small>${asset.duration.toFixed(1)} S · TAP TO HEAR</small></span></button>`).join("") : '<p class="phoneNote">No audio yet. Import a file, record a take in the vocal room, or cut a few bars from a record on the turntable.</p>'}`;
    this.on("[data-import]", () => document.querySelector("#audioFile").click());
    this.on("[data-record]", () => { this.toggle(false); this.w.goRoom("record"); });
    this.on("[data-library]", () => { this.toggle(false); window.aura.workbench.open("samples"); });
    this.on("[data-turntable]", () => { this.toggle(false); this.w.guide.goTo(this.w.turntable); });
    this.on("[data-asset]", (el) => this.s.engine.previewBuffer(this.s.engine.assets.get(el.dataset.asset)));
  }
  aura() {
    const asks = ["What should I add here?", "Why does my mix sound muddy?", "Create a drum pattern", "Make the bass fit the drums", "Teach me how chords work", "Explain compression", "How do I create tension before the drop?"];
    this.view.innerHTML = this.head("AURA", "Ask, or learn.") + `<div class="phoneActions"><button class="primary" data-ask>ASK ANYTHING</button></div><span class="phoneLabel">Try</span>${asks.map((q) => `<button class="phoneRow" data-q="${esc(q)}"><span><strong style="font:italic 400 19px var(--serif);text-transform:none">${esc(q)}</strong></span></button>`).join("")}<span class="phoneLabel">AURA school · learn by doing</span><div class="phoneChoice">${this.w.guide.lessons().map(([id, name]) => `<button data-lesson="${id}">${esc(name)}</button>`).join("")}</div><div class="phoneActions"><button data-coach>READING LESSONS</button></div><p class="phoneNote">AURA runs on this device with transparent rules and your real project data. It is not a language model unless a server connection is configured.</p>`;
    this.on("[data-ask]", () => { this.toggle(false); this.w.mentor.ask(); });
    this.on("[data-q]", (el) => { this.toggle(false); this.w.mentor.hear(el.dataset.q); });
    this.on("[data-lesson]", (el) => { this.toggle(false); this.w.guide.lesson(el.dataset.lesson); });
    this.on("[data-coach]", () => { this.toggle(false); window.aura.coach.open(); });
  }
  map() {
    const here = this.w.currentRoom, grid = [...rooms].sort((x, y) => x.row - y.row || x.col - y.col);
    this.view.innerHTML = this.head("MAP · NORTH IS UP", roomById(here).name) + `<div class="phoneMap">${grid.map((r) => `<button data-room="${r.id}" class="${r.id === here ? "here" : ""}"><b>${r.number}</b><span>${esc(r.name.toUpperCase())}</span></button>`).join("")}</div><p class="phoneNote">Tap a room and you will be walked there. Number keys 1–9 do the same; hold Shift to arrive at once.</p>`;
    this.on("[data-room]", (el, e) => { this.toggle(false); this.w.goRoom(el.dataset.room, e.shiftKey); });
  }
  notes() {
    const key = "aura-notes:" + this.s.getProject().id;
    this.view.innerHTML = this.head("NOTES", this.s.getProject().name) + '<textarea placeholder="Chorus needs air. Try the pad an octave up…" aria-label="Notes for this project"></textarea>';
    const area = this.$("textarea");
    area.value = localStorage.getItem(key) || "";
    area.oninput = () => { try { localStorage.setItem(key, area.value.slice(0, 20000)); } catch {} };
  }
  settings() {
    const w = this.w, perf = w.performance, light = w.lighting, choice = (name, options, current) => `<div class="phoneChoice">${options.map(([id, label]) => `<button data-${name}="${id}" aria-pressed="${id === current}">${label}</button>`).join("")}</div>`;
    const range = (key, label, min, max, step, value) => `<span class="phoneLabel">${label}</span><div class="phoneRange"><input type="range" data-option="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"><output></output></div>`;
    this.view.innerHTML = this.head("SETTINGS", "Your pace.") + `<span class="phoneLabel">Graphics · music tools are identical in every mode</span>${choice("quality", [["auto", "AUTO"], ...Object.entries(qualities).map(([id, q]) => [id, q.label])], perf.auto ? "auto" : perf.name)}<p class="phoneNote" data-perf></p><span class="phoneLabel">Light in the house</span>${choice("mood", Object.entries(moods).map(([id, m]) => [id, m.label]), light.moodName)}<span class="phoneLabel">Outside</span>${choice("sky", Object.entries(skies).map(([id, s]) => [id, s.label]), light.skyName)}<span class="phoneLabel">Comfort</span><label class="phoneSwitch">Reduced motion<input type="checkbox" data-reduced ${w.reduced ? "checked" : ""}></label><label class="phoneSwitch">Cinematic arrival<input type="checkbox" data-arrival ${localStorage.getItem("aura-intro") !== "off" ? "checked" : ""}></label><label class="phoneSwitch">Interface sound<input type="checkbox" data-sound ${w.sound.enabled ? "checked" : ""}></label>${range("speed", "Walking pace", 1.5, 5.5, 0.1, w.speed)}${range("sensitivity", "Look sensitivity", 0.0008, 0.005, 0.0001, w.sensitivity)}${range("fieldOfView", "Field of view", 48, 84, 1, w.fieldOfView)}<span class="phoneLabel">Interface sound level</span><div class="phoneRange"><input type="range" data-sfx min="0" max="1" step=".01" value="${w.sound.level}" aria-label="Interface sound level"><output></output></div><span class="phoneLabel">Keys</span><p class="phoneNote">WASD walk · SHIFT hurry · E use · ESC step back<br>TAB phone · T ask AURA · L just listen<br>SPACE play · 1–9 rooms · CTRL ↵ precise editor · CTRL K commands</p><div class="phoneActions"><button data-replay>REPLAY THE WELCOME</button></div>`;
    this.status();
    this.on("[data-quality]", (el) => { perf.set(el.dataset.quality); this.render(); });
    this.on("[data-mood]", (el) => { light.setMood(el.dataset.mood); this.render(); });
    this.on("[data-sky]", (el) => { light.setSky(el.dataset.sky); this.render(); });
    this.$("[data-reduced]").onchange = (e) => w.setReduced(e.target.checked);
    this.$("[data-arrival]").onchange = (e) => localStorage.setItem("aura-intro", e.target.checked ? "on" : "off");
    this.$("[data-sound]").onchange = (e) => w.sound.setEnabled(e.target.checked);
    this.$("[data-sfx]").oninput = (e) => { w.sound.setLevel(Number(e.target.value)); w.sound.tick(); };
    for (const input of this.view.querySelectorAll("[data-option]")) {
      const show = () => (input.nextElementSibling.textContent = input.dataset.option === "sensitivity" ? Math.round(Number(input.value) * 10000) : Number(input.value).toFixed(input.step < 1 ? 1 : 0));
      show();
      input.oninput = () => { w.setOption(input.dataset.option, input.value); show(); };
    }
    this.on("[data-replay]", () => { localStorage.removeItem("aura-first-run"); this.toggle(false); w.guide.begin(true); });
  }
  // ——— Touch instruments (the mobile experience) ———
  beat() {
    const p = this.s.getProject(), clip = p.tracks.find((t) => t.instrument === "drums")?.clips[0];
    const has = (pitch, i) => !!clip?.notes.some((n) => n.pitch === pitch && Math.abs(n.start - i / 4) < 0.05);
    this.view.innerHTML = this.head("BEAT", `${p.bpm} BPM`) + DRUMS.map(([name, pitch]) => `<div class="phoneSteps"><span>${name}</span>${Array.from({ length: 16 }, (_, i) => `<button data-step="${i}" data-pitch="${pitch}" class="${has(pitch, i) ? "on" : ""}" aria-label="${name} step ${i + 1}" aria-pressed="${has(pitch, i)}"></button>`).join("")}</div>`).join("") + `<div class="phoneActions"><button class="primary" data-play>${this.pb.playing ? "PAUSE" : "PLAY"}</button><button data-slower>− TEMPO</button><button data-faster>+ TEMPO</button><button data-write>LET AURA WRITE ONE</button></div><p class="phoneNote">These are the first sixteen steps of your drum clip — the same ones the pads and the step circle edit.</p>`;
    this.on("[data-step]", (el) => { this.s.toggleStep(Number(el.dataset.step), Number(el.dataset.pitch)); this.render(); });
    this.on("[data-play]", async () => { this.pb.select("project", false); await this.pb.toggle(); this.render(); });
    this.on("[data-slower]", () => { this.s.commit("Change tempo", (q) => (q.bpm = Math.max(40, q.bpm - 4))); this.render(); });
    this.on("[data-faster]", () => { this.s.commit("Change tempo", (q) => (q.bpm = Math.min(240, q.bpm + 4))); this.render(); });
    this.on("[data-write]", () => { this.w.mentor.hear("Create a drum pattern"); this.render(); });
  }
  beatStep() {
    const e = this.s.engine, clip = this.s.getProject().tracks.find((t) => t.instrument === "drums")?.clips[0];
    const now = e.playing && clip && !this.pb.foreign ? Math.floor((((e.beat - clip.start) % 4) + 4) % 4 * 4) : -1;
    if (now === this.lastBeatStep) return;
    this.lastBeatStep = now;
    for (const el of this.view.querySelectorAll("[data-step]")) el.classList.toggle("now", Number(el.dataset.step) === now);
  }
  keys() {
    const p = this.s.getProject(), intervals = scaleIntervals[p.scale] || scaleIntervals.Minor, notes = [];
    for (let octave = 0; notes.length < 16; octave++) for (const step of intervals) if (notes.length < 16) notes.push(48 + p.root + step + octave * 12);
    this.view.innerHTML = this.head("KEYS", `${noteName(60 + p.root).replace(/\d+$/, "")} ${p.scale.toLowerCase()}`) + `<div class="phoneKeys">${notes.map((pitch) => `<button data-pitch="${pitch}">${noteName(pitch)}</button>`).join("")}</div><p class="phoneNote">Every pad is in your project's scale, played with the selected voice. Nothing here can sound wrong.</p>`;
    for (const el of this.view.querySelectorAll("[data-pitch]")) {
      let voice = null, down = false;
      const release = () => { down = false; el.classList.remove("down"); voice?.release(); voice = null; };
      el.onpointerdown = async (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        down = true;
        el.classList.add("down");
        const made = await this.s.engine.noteOn(this.w.keysTrack(), Number(el.dataset.pitch), 0.72).catch((err) => this.s.toast(err.message));
        if (!made) return;
        if (down) voice = made;
        else made.release();
      };
      el.onpointerup = el.onpointercancel = el.onlostpointercapture = release;
    }
  }
}
