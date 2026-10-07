const $ = (s) => document.querySelector(s);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * What little interface there is: a mark, one line about what is playing, a hint
 * that fades, and the occasional line of very large type.
 */
export class Hud {
  constructor(world) {
    this.w = world;
    this.momentEl = $("#moment");
    this.hintEl = $("#hint");
    this.token = 0;
    this.seen = new Set();
    $("#auraMark").onclick = () => world.phone?.toggle();
    $("#nowLine").onclick = world.safe(() => world.play());
    world.studio.engine.addEventListener("transport", () => this.now());
    world.studio.store.addEventListener("change", () => this.now());
  }
  /** Large editorial type for the moments that deserve it. Returns when it has left the frame. */
  moment({ eyebrow = "", title, sub = "", hold = 2400, small = false, centre = false, wait: gate = null }) {
    // A new line of type replaces the one on screen; they never queue up behind the visitor.
    const el = this.momentEl, token = ++this.token, quick = this.w.reduced;
    return (async () => {
      if (el.classList.contains("show")) {
        el.classList.add("leave");
        await wait(quick ? 30 : 360);
        if (token !== this.token) return;
      }
      el.className = (small ? "small " : "") + (centre ? "centre" : "");
      el.querySelector(".momentEyebrow").textContent = eyebrow;
      el.querySelector(".momentTitle").replaceChildren(...String(title).split("\n").map((line) => Object.assign(document.createElement("span"), { textContent: line })));
      el.querySelector(".momentSub").textContent = sub;
      void el.offsetWidth;
      el.classList.add("show");
      if (!quick) this.w.sound.wipe();
      await (gate ? Promise.race([gate, wait(12000)]) : wait(quick ? Math.min(hold, 1800) : hold));
      if (token !== this.token) return;
      el.classList.add("leave");
      await wait(quick ? 50 : 650);
      if (token === this.token) el.classList.remove("show", "leave");
    })();
  }
  /** A room introduces itself once per visit to the house, not every time you cross a threshold. */
  room(room) {
    if (this.seen.has(room.id)) return;
    this.seen.add(room.id);
    this.moment({ eyebrow: `${room.number} — ${room.eyebrow}`, title: room.name.replace(" ", "\n"), sub: room.description, small: true, hold: 2100 });
  }
  /** Keys worth knowing right now: [["E", "USE"], …]. Fades on its own. */
  hint(pairs, hold = 6500) {
    clearTimeout(this.hintTimer);
    this.hintEl.replaceChildren(...pairs.flatMap(([key, label]) => [Object.assign(document.createElement("b"), { textContent: key }), Object.assign(document.createElement("span"), { textContent: label })]));
    this.hintEl.classList.add("visible");
    if (hold) this.hintTimer = setTimeout(() => this.hintEl.classList.remove("visible"), hold);
  }
  clearHint() {
    clearTimeout(this.hintTimer);
    this.hintEl.classList.remove("visible");
  }
  wipe() {
    const el = $("#wipe");
    if (this.w.reduced) return;
    el.classList.remove("run");
    void el.offsetWidth;
    el.classList.add("run");
    this.w.sound.wipe();
  }
  now() {
    const w = this.w, e = w.studio.engine, piece = w.playback?.current, p = w.playback?.project || w.studio.getProject();
    $("#nowTitle").textContent = piece?.title || p.name;
    document.body.classList.toggle("playing", e.playing);
    document.documentElement.style.setProperty("--beat", (60 / p.bpm).toFixed(3) + "s");
    this.position(true);
  }
  position(force = false) {
    const e = this.w.studio.engine, p = this.w.playback?.project || this.w.studio.getProject(), beat = e.beat;
    const text = `${p.bpm} BPM · ${String(Math.floor(beat / 4) + 1).padStart(2, "0")}.${Math.floor(beat % 4) + 1}`;
    if (force || text !== this.lastPosition) { this.lastPosition = text; $("#nowMeta").textContent = text; }
  }
}
