import { projectBeats } from "../audio.js";
import { makeTrack, makeClip, noteName, scaleIntervals, uid } from "../project.js";
import { makeEffect } from "../effects.js";
import { rooms } from "../house/layout.js";
import { moods, skies } from "../world/lighting.js";
import { styles, drumPattern, chordsFor, bassFor, melodyFor, kickSteps } from "./composer.js";

const $ = (s) => document.querySelector(s);
const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const numerals = ["i", "ii", "iii", "iv", "v", "vi", "vii"];
const melodic = (t) => !["drums", "audio"].includes(t.instrument);

/** Everything AURA knows about the session at this moment. Measured or counted, never guessed. */
export function readProject(p, engine, metrics) {
  const seven = scaleIntervals[p.scale]?.length === 7 ? scaleIntervals[p.scale] : scaleIntervals.Minor, beats = projectBeats(p), bars = Math.ceil(beats / 4);
  const chord = (degree) => {
    const tones = [0, 2, 4].map((s) => seven[(degree + s) % 7] + (degree + s >= 7 ? 12 : 0)), third = tones[1] - tones[0], fifth = tones[2] - tones[0];
    return { degree, root: (p.root + tones[0]) % 12, name: names[(p.root + tones[0]) % 12] + (third === 3 ? (fifth === 6 ? "°" : "m") : ""), numeral: third === 4 ? numerals[degree].toUpperCase() : numerals[degree] + (fifth === 6 ? "°" : "") };
  };
  const role = (t) => (t.instrument === "drums" ? "drums" : t.instrument === "audio" ? "audio" : t.instrument === "bass" ? "bass" : ["pad", "strings", "choir", "organ"].includes(t.instrument) ? "pad" : ["keys", "electric"].includes(t.instrument) ? "chords" : "lead");
  const tracks = p.tracks.map((t) => {
    const notes = t.clips.flatMap((c) => c.notes.map((n) => ({ ...n, at: c.start + n.start })));
    const mean = notes.length ? notes.reduce((s, n) => s + n.pitch, 0) / notes.length : null;
    return { track: t, role: role(t), notes, mean, low: melodic(t) && mean !== null && mean < 55, level: metrics?.tracks.get(t.id)?.peak ?? null, highpassed: (t.inserts || []).some((fx) => fx.type === "filter" && fx.enabled) };
  });
  const by = (name) => tracks.filter((x) => x.role === name), drums = by("drums")[0], pattern = drums?.track.clips[0]?.notes.filter((n) => n.start < 4) || [];
  // Which tracks are sounding in each bar: the shape of the arrangement.
  const active = Array.from({ length: bars }, (_, bar) => p.tracks.filter((t) => !t.mute && t.clips.some((c) => c.start < bar * 4 + 4 && c.start + c.length > bar * 4 && (c.asset || c.notes.some((n) => c.start + n.start >= bar * 4 && c.start + n.start < bar * 4 + 4)))).map((t) => t.id).join(","));
  const bar = Math.min(bars - 1, Math.floor((engine?.beat || 0) / 4));
  return {
    p, beats, bars, bar, key: names[p.root] + " " + p.scale.toLowerCase(), chord, chords: [0, 1, 2, 3, 4, 5, 6].map(chord), tracks, by, drums,
    kicks: kickSteps(pattern), snares: [...new Set(pattern.filter((n) => n.pitch === 38 || n.pitch === 39).map((n) => Math.round(n.start * 4)))], hats: pattern.filter((n) => n.pitch === 42).length,
    sections: new Set(active).size, active, here: (active[bar] || "").split(",").filter(Boolean).map((id) => p.tracks.find((t) => t.id === id)),
    feel: p.bpm >= 160 ? "dnb" : p.bpm >= 129 ? "trap" : p.bpm >= 116 ? "house" : p.bpm >= 97 ? "boombap" : p.bpm >= 80 ? "boombap" : "lofi",
    eighth: Math.round(60000 / p.bpm / 2), sixteenth: Math.round(60000 / p.bpm / 4),
  };
}

/**
 * AURA: the house's resident mentor. It answers in one or two sentences, in your
 * project's own terms, and wherever it can it offers to do the thing — every action
 * is an ordinary undoable edit. Local and rule-based unless a model is connected.
 */
export class Mentor {
  constructor(world) {
    this.w = world;
    this.s = world.studio;
    this.el = $("#speech");
    this.line = $("#speechLine");
    this.chips = $("#speechChips");
    this.input = $("#askInput");
    this.visible = false;
    this.asking = false;
    this.token = 0;
    this.modelAvailable = false;
    $("#askForm").onsubmit = (e) => { e.preventDefault(); const q = this.input.value.trim(); this.input.value = ""; if (q) this.hear(q); else this.close(); };
    this.el.addEventListener("pointerenter", () => clearTimeout(this.timer));
    this.el.addEventListener("pointerleave", () => { if (this.visible && !this.asking) this.linger(5000); });
    // A connected model is optional; the house never asks for a key in the browser.
    if (location.protocol !== "file:" && (typeof __AURA_COACH_SERVER__ === "undefined" || __AURA_COACH_SERVER__)) fetch("/api/coach", { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)).then((v) => (this.modelAvailable = v?.available === true)).catch(() => {});
  }
  halos() {
    return [this.w.aura, this.w.lab].filter(Boolean);
  }
  read() {
    return readProject(this.s.getProject(), this.s.engine, this.w.metrics);
  }
  show() {
    if (!this.visible) { this.visible = true; this.el.classList.add("visible"); document.body.classList.add("speaking"); this.halos().forEach((h) => h.wake()); }
    clearTimeout(this.timer);
  }
  linger(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (!this.asking) this.close(); }, ms);
  }
  close() {
    this.token++;
    clearTimeout(this.timer);
    this.visible = this.asking = false;
    this.el.classList.remove("visible");
    document.body.classList.remove("speaking", "asking");
    this.halos().forEach((h) => h.sleep());
    this.input.blur();
    if (this.w.entered && this.w.mode === "house") this.w.canvas.focus({ preventScroll: true });
  }
  /** Calls AURA: the halo wakes, the room dims a little, a line opens for the question. */
  ask(placeholder = null) {
    const w = this.w;
    if (!w.entered || w.arrival || w.mode !== "house") return;
    document.exitPointerLock?.();
    w.resetNavigationInput();
    if (!this.visible) { w.sound.wake(); this.line.textContent = this.greeting(); this.chips.replaceChildren(); }
    this.show();
    this.asking = true;
    document.body.classList.add("asking");
    if (placeholder) this.input.placeholder = placeholder;
    this.input.focus({ preventScroll: true });
    if (!this.chips.children.length) this.offer([["WHAT SHOULD I ADD HERE?"], ["CREATE A DRUM PATTERN"], ["WHY IS MY MIX MUDDY?"], ["TEACH ME"]].map(([label]) => ({ label, run: () => this.hear(label) })));
  }
  greeting() {
    const c = this.read();
    return `${c.key[0].toUpperCase() + c.key.slice(1)}, ${c.p.bpm} BPM, ${c.p.tracks.length} tracks. What do you need?`;
  }
  offer(chips = []) {
    this.chips.replaceChildren(...chips.map(({ label, run, act }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      if (act) b.className = "act";
      b.onclick = this.w.safe(async () => {
        const w = this.w, token = this.token, focused = w.interaction.focused, journey = w.journey;
        w.sound.press();
        const done = run();
        // An offer to take you somewhere is over once you are on your way.
        if (token === this.token && ((w.journey && w.journey !== journey) || w.interaction.focused !== focused || w.mode !== "house")) this.close();
        await done;
      });
      return b;
    }));
  }
  /** AURA speaks: the words arrive at reading pace and the halo answers each one. */
  say(text, { chips = [], hold = null, quiet = false } = {}) {
    const token = ++this.token, w = this.w;
    this.asking = false;
    document.body.classList.remove("asking");
    this.show();
    if (!quiet) w.sound.wake();
    this.offer([]);
    this.line.textContent = "";
    return new Promise((resolve) => {
      const words = text.split(/(\s+)/);
      let i = 0;
      const step = () => {
        if (token !== this.token) return resolve(false);
        if (i >= words.length || w.reduced) {
          this.line.textContent = text;
          this.offer(chips);
          this.linger(hold ?? Math.max(6500, text.length * 85) + (chips.length ? 9000 : 0));
          return resolve(true);
        }
        this.line.textContent += words[i++];
        if (words[i - 1].trim()) this.halos().forEach((h) => h.speak(0.6));
        setTimeout(step, words[i - 1].trim() ? 46 : 12);
      };
      step();
    });
  }
  undoChip() {
    return { label: "UNDO", run: () => { this.s.store.undo(); return this.say("Undone.", { quiet: true, hold: 2500 }); } };
  }
  listenChip() {
    return { label: "LISTEN", run: async () => { this.w.playback.select("project", false); if (!this.s.engine.playing) await this.w.playback.play(); } };
  }
  // ——— Things AURA can do to the project (each one a single undoable step) ———
  ensure(instrument, name) {
    const p = this.s.getProject();
    let t = p.tracks.find((x) => x.instrument === instrument);
    if (!t) { this.s.addInstrument(instrument); t = this.s.getTrack(); if (name) this.s.commit("Name track", (q) => { q.tracks.find((x) => x.id === t.id).name = name; }); }
    return this.s.getProject().tracks.find((x) => x.id === t.id);
  }
  writeDrums(feel, options = {}) {
    const t = this.ensure("drums"), style = Object.values(styles).find((x) => x.drums === feel) || styles.boombap, id = t.id;
    this.s.commit("AURA: write " + feel + " drums", (p) => {
      const track = p.tracks.find((x) => x.id === id);
      if (!track.clips.length) track.clips.push(makeClip("Groove", 0, 4));
      // Every drum clip gets the pattern, so the whole arrangement changes feel together.
      track.clips.forEach((clip, i) => { if (clip.length >= 4) clip.notes = [...drumPattern(feel, Math.random, { fill: options.fills && i % 4 === 3 }), ...clip.notes.filter((n) => n.start >= 4)]; });
      track.drumKit = style.kit;
      p.swing = style.swing;
    });
    this.s.select(id, t.clips[0]?.id);
    return style;
  }
  progression(c) {
    const style = styles[c.feel] || styles.lofi, degrees = style.progressions[Math.floor(Math.random() * style.progressions.length)];
    return { degrees, chords: chordsFor(c.p.root, c.p.scale, degrees), label: degrees.map((d) => c.chord(d).name).join(" → ") };
  }
  writeChords(c, prog) {
    const existing = c.tracks.find((x) => x.role === "chords" || x.role === "pad"), t = existing?.track || this.ensure("keys"), id = t.id;
    this.s.commit("AURA: write a progression", (p) => {
      const track = p.tracks.find((x) => x.id === id), clip = makeClip(prog.label.replace(/ → /g, " "), 0, 16);
      prog.chords.forEach((chord, i) => chord.forEach((pitch, j) => clip.notes.push({ id: uid(), pitch, start: i * 4 + j * 0.03, duration: 3.7, velocity: 0.5 })));
      track.clips = [clip, ...track.clips.filter((x) => x.start >= 16)];
      p.bars = Math.max(p.bars, 4);
    });
    this.s.select(id);
  }
  /** Where the harmony already is: the lowest chord tone in each bar of the chord track, or the key's root. */
  roots(c, bars = 4) {
    const source = c.tracks.find((x) => x.role === "chords") || c.tracks.find((x) => x.role === "pad");
    return Array.from({ length: bars }, (_, bar) => {
      const notes = source?.notes.filter((n) => n.at < bar * 4 + 4 && n.at + n.duration > bar * 4) || [];
      const root = notes.length ? Math.min(...notes.map((n) => n.pitch)) : 48 + c.p.root;
      return [root, root + 4, root + 7];
    });
  }
  writeBass(c) {
    const t = this.ensure("bass"), id = t.id, kicks = c.kicks.length ? c.kicks : [0, 2], chords = this.roots(c);
    this.s.commit("AURA: fit the bass to the kick", (p) => {
      const track = p.tracks.find((x) => x.id === id), clip = makeClip("With the kick", 0, 16);
      clip.notes = bassFor(chords, kicks, c.drums ? c.feel === "house" ? "four" : c.feel : "ambient", Math.random);
      track.clips = [clip, ...track.clips.filter((x) => x.start >= 16)];
    });
    this.s.select(id);
    return kicks;
  }
  writeMotif(c) {
    const lead = c.by("lead")[0]?.track || (() => { this.s.addInstrument("pluck"); return this.s.getTrack(); })(), id = lead.id, chords = this.roots(c);
    this.s.commit("AURA: write a motif", (p) => {
      const track = p.tracks.find((x) => x.id === id), clip = makeClip("Motif", 0, 16);
      clip.notes = melodyFor(p.root, p.scale, chords.map((ch) => ch.map((n) => n + 12)), Math.random);
      track.clips = [clip, ...track.clips.filter((x) => x.start >= 16)];
    });
    this.s.select(id);
  }
  addInsert(trackId, type, params = {}) {
    this.s.commit("AURA: add " + type, (p) => {
      const t = p.tracks.find((x) => x.id === trackId), fx = makeEffect(type);
      Object.assign(fx.params, params);
      t.inserts = [...(t.inserts || []), fx].slice(0, 12);
    });
  }
  /** Silences the kick for the bar before a boundary, and ends that bar with a fill. */
  breakBefore(c, bar) {
    const t = c.drums?.track;
    if (!t) return false;
    this.s.commit("AURA: break before bar " + (bar + 1), (p) => {
      const track = p.tracks.find((x) => x.id === t.id), from = (bar - 1) * 4;
      for (const clip of track.clips) {
        if (clip.start > from || clip.start + clip.length <= from) continue;
        const local = from - clip.start;
        clip.notes = clip.notes.filter((n) => !(n.pitch === 36 && n.start >= local && n.start < local + 4) && !(n.start >= local + 3 && n.start < local + 4));
        for (let i = 0; i < 4; i++) clip.notes.push({ id: uid(), pitch: i < 2 ? 38 : 45, start: local + 3 + i / 4, duration: 0.15, velocity: 0.5 + i * 0.12 });
      }
    });
    return true;
  }
  swell(c, bar) {
    const pad = (c.by("pad")[0] || c.by("chords")[0])?.track;
    if (!pad) return false;
    this.s.commit("AURA: swell into bar " + (bar + 1), (p) => {
      const t = p.tracks.find((x) => x.id === pad.id), from = Math.max(0, (bar - 2) * 4), to = bar * 4;
      t.automation = [...t.automation.filter((x) => x.beat < from || x.beat > to), { beat: from, value: 0.35 }, { beat: Math.max(from, to - 0.25), value: 1 }, { beat: to, value: 0.7 }].sort((x, y) => x.beat - y.beat).slice(0, 512);
    });
    return true;
  }
  boundary(c) {
    // The next place the arrangement changes, or the halfway bar if it never does.
    for (let bar = c.bar + 1; bar < c.bars; bar++) if (c.active[bar] !== c.active[bar - 1]) return bar;
    return Math.min(c.bars - 1, Math.max(2, Math.round(c.bars / 2)));
  }
  // ——— Understanding a question ———
  async hear(question) {
    const q = question.toLowerCase().trim(), c = this.read(), w = this.w, s = this.s;
    this.show();
    w.events.dispatchEvent(new CustomEvent("ask", { detail: question }));
    const is = (pattern) => pattern.test(q);
    // The house itself: lights, weather, rooms, transport.
    if (is(/^(play|start)\b|press play/)) { await w.playback.play(); return this.say("Playing.", { quiet: true, hold: 2200 }); }
    if (is(/^(stop|pause)\b/)) { w.playback.pause(); return this.say("Stopped.", { quiet: true, hold: 2200 }); }
    const tempo = q.match(/(\d{2,3})\s*bpm|tempo (?:to |at )?(\d{2,3})/);
    if (tempo) { const bpm = Math.max(40, Math.min(240, Number(tempo[1] || tempo[2]))); s.commit("Change tempo", (p) => (p.bpm = bpm)); return this.say(`${bpm} BPM. An eighth-note delay is now ${Math.round(60000 / bpm / 2)} ms.`, { chips: [this.undoChip()] }); }
    const key = q.match(/\bkey (?:of |to |is |in )?([a-g])([#♯b♭]?)(?:\s+(minor|major|dorian))?\b/);
    if (key) {
      const root = ({ c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[key[1]] + (/[#♯]/.test(key[2]) ? 1 : /[b♭]/.test(key[2]) ? -1 : 0) + 12) % 12, scale = key[3] ? key[3][0].toUpperCase() + key[3].slice(1) : s.getProject().scale;
      s.commit("Change key", (p) => { p.root = root; p.scale = scale; });
      return this.say(`The project is in ${names[root]} ${scale.toLowerCase()} now. Notes already written stay where they are; the scale guides in the editors follow.`, { chips: [this.undoChip()] });
    }
    const mute = q.match(/\b(mute|unmute|solo|unsolo)\b (?:the )?(.+)/);
    if (mute) {
      const target = c.tracks.find((x) => mute[2].includes(x.role) || x.track.name.toLowerCase().includes(mute[2].trim()) || mute[2].includes(x.track.instrument));
      if (target) { s.toggleTrack(target.track.id, mute[1].includes("solo") ? "solo" : "mute"); return this.say(`${target.track.name}: ${mute[1]}d.`, { quiet: true, hold: 2600, chips: [this.undoChip()] }); }
    }
    const mood = Object.keys(moods).find((id) => q.includes(id) && is(/light|mood|scene|make it|set/));
    if (mood) { w.lighting.setMood(mood); return this.say(`${moods[mood].label[0] + moods[mood].label.slice(1).toLowerCase()} light.`, { quiet: true, hold: 2600 }); }
    const sky = is(/\brain/) ? "rain" : is(/\bfog|mist/) ? "fog" : is(/\bnight|dark outside|stars/) ? "night" : is(/sunset|golden hour|dusk/) ? "sunset" : is(/\b(day|daylight|morning|sunny)\b/) ? "day" : null;
    if (sky && is(/make|set|turn|outside|weather|sky|let it|want|give me|it'?s/)) { w.lighting.setSky(sky); return this.say({ rain: "Rain on the glass.", fog: "Fog is rolling in.", night: "Night.", sunset: "Golden hour.", day: "Daylight." }[sky], { quiet: true, hold: 2600 }); }
    if (is(/just listen|listening mode|let me listen|relax/)) { this.close(); return w.setListening(true); }
    const room = rooms.find((r) => q.includes(r.name.toLowerCase()) || q.includes(r.id)) || (is(/mixer|mixing/) && is(/go|take|walk|where/) ? rooms.find((r) => r.id === "master") : null);
    if (room && is(/go|take me|walk|show me|where/)) { this.say(`This way — ${room.name.toLowerCase()}.`, { quiet: true, hold: 2600 }); return w.goRoom(room.id); }
    if (is(/save\b/)) { await s.persist(); return this.say("Saved on this device.", { quiet: true, hold: 2400 }); }
    if (is(/export|bounce|render/)) { this.close(); return w.openTool("terrace"); }
    if (is(/vinyl|press (it|this|the)/)) { this.close(); return w.phone.open("vinyl"); }
    if (is(/\bundo\b/)) { s.store.undo(); return this.say("Undone.", { quiet: true, hold: 2200 }); }
    // Learning by doing.
    if (is(/teach|learn|lesson|show me how|how do i (use|play|make a beat)/) || q === "teach me") {
      const lesson = is(/synth|oscillat|sound design|waveform|filter/) ? "synthesis" : is(/rhythm|drum|beat|pulse|groove/) ? "rhythm" : is(/mix|balance|fader|pan|level/) ? "mixing" : is(/arrang|timeline|structure|clip/) ? "arrange" : is(/sampl|vinyl|record|chop/) ? "sampling" : null;
      if (lesson) return w.guide.lesson(lesson);
      if (!is(/chord|scale|melod|compress|eq|reverb|delay|master/)) return this.say("Pick one, and I will take you to it. You learn here by touching things.", { chips: w.guide.lessons().map(([id, name]) => ({ label: name, run: () => w.guide.lesson(id) })) });
    }
    // Writing and repairing.
    const styleAsked = Object.keys(styles).find((id) => q.includes(id.replace("boombap", "boom bap")) || q.includes(id)) || (is(/hip.?hop/) ? "boombap" : is(/lo.?fi/) ? "lofi" : is(/drum.?(and|n|&).?bass|jungle/) ? "dnb" : null);
    if (styleAsked && is(/beat|drum|pattern|make|help|track|groove/)) {
      const style = styles[styleAsked], bpm = Math.round((style.bpm[0] + style.bpm[1]) / 2), about = { trap: "Trap sits around 140 but feels half-time: the snare lands on beat three, and the hats roll.", house: "House is four kicks to the bar, a clap on two and four, an open hat on every off-beat.", lofi: "Lo-fi is slow and swung: a lazy kick, a soft snare, hats that drag a little.", techno: "Techno is a relentless four-on-the-floor with hats driving the off-beats.", boombap: "Boom bap is a hard kick and snare with a late second kick and plenty of swing.", dnb: "Drum and bass runs near 172: kick on one, snares on two and four, a second kick just before three.", ambient: "Ambient leaves the drums out. Let pads and space carry it." }[styleAsked];
      if (!style.drums) return this.say(about, { chips: [{ label: `SET ${bpm} BPM`, act: true, run: () => { s.commit("Change tempo", (p) => (p.bpm = bpm)); return this.say(`${bpm} BPM.`, { quiet: true }); } }] });
      this.writeDrums(style.drums, { fills: true });
      return this.say(`${about} I have written one into your drum clips — every fourth bar turns around.`, { chips: [this.listenChip(), ...(Math.abs(c.p.bpm - bpm) > 12 ? [{ label: `SET ${bpm} BPM`, act: true, run: () => { s.commit("Change tempo", (p) => (p.bpm = bpm)); return this.say(`${bpm} BPM.`, { quiet: true, chips: [this.listenChip()] }); } }] : []), { label: "ANOTHER", act: true, run: () => this.hear(question) }, this.undoChip()] });
    }
    if (is(/(create|make|write|give me|generate|new).*(drum|beat|pattern|groove|rhythm)|drum pattern/)) {
      const feel = c.feel === "lofi" ? "boombap" : c.feel === "house" ? "four" : c.feel, style = this.writeDrums(feel, { fills: true });
      return this.say(`At ${c.p.bpm} BPM I have written a ${style.label.toLowerCase()} pattern: kick on steps ${this.read().kicks.map((k) => k * 4 + 1).join(", ")}, with a turnaround every fourth bar.`, { chips: [this.listenChip(), { label: "ANOTHER", act: true, run: () => this.hear(question) }, { label: "OPEN THE PADS", run: () => w.drums.enter() }, this.undoChip()] });
    }
    if (is(/bass.*(fit|lock|match|follow|with).*(drum|kick)|(fit|lock|tighten).*bass|make.*bass/)) {
      if (!c.drums) return this.say("There are no drums yet for the bass to follow. Shall I write some first?", { chips: [{ label: "WRITE DRUMS", act: true, run: () => this.hear("create a drum pattern") }] });
      const kicks = this.writeBass(c);
      return this.say(`Done. The bass now lands on the kick — steps ${kicks.map((k) => k * 4 + 1).join(", ")} — and plays the root of each chord. Short notes leave the kick its space.`, { chips: [this.listenChip(), this.undoChip()] });
    }
    if (is(/what (should|could|can) i (add|do)|what.?s missing|what next|add here|stuck|ideas?\b/)) return this.suggest(c);
    if (is(/tension|build.?up|before the drop|\bdrop\b|riser|anticipat/)) {
      const bar = this.boundary(c);
      return this.say(`Tension is something taken away, then given back. Before bar ${bar + 1}: lose the kick for a bar, end on a fill, and let a pad swell into the downbeat.`, { chips: [...(c.drums ? [{ label: `BREAK BEFORE BAR ${bar + 1}`, act: true, run: () => { this.breakBefore(this.read(), bar); return this.say(`Bar ${bar} now has no kick and ends on a fill.`, { quiet: true, chips: [this.listenChip(), this.undoChip()] }); } }] : []), { label: "SWELL THE PAD", act: true, run: () => (this.swell(this.read(), bar) ? this.say("The pad now rises over two bars and settles on the downbeat.", { quiet: true, chips: [this.listenChip(), this.undoChip()] }) : this.say("There is no pad or chord track to swell yet.", { quiet: true })) }] });
    }
    if (is(/mudd|muffled|boomy|unclear|cluttered|too much low|low.?end/)) return this.muddy(c);
    if (is(/chord|harmon|progression|triad/)) {
      const prog = this.progression(c), home = c.chord(0);
      return this.say(`A chord is three notes stacked in thirds. In ${c.key} your home chord is ${home.name}; the others the key gives you are ${c.chords.slice(1).map((x) => x.name).join(", ")}. Try ${prog.label}.`, { chips: [{ label: "HEAR IT", run: () => this.hearChords(prog.chords) }, { label: "WRITE IT INTO THE PROJECT", act: true, run: () => { this.writeChords(this.read(), prog); return this.say(`${prog.label} is on your chord track, one bar each.`, { quiet: true, chips: [this.listenChip(), this.undoChip()] }); } }] });
    }
    if (is(/compress/)) {
      const target = c.drums || c.tracks[0];
      return this.say(`A compressor turns down the loudest moments so everything else can come up. Threshold is where it starts; ratio is how hard. For ${target ? target.track.name : "drums"}: threshold −18 dB, ratio 4, a fast release. If it sounds flat, you have gone too far.`, { chips: target ? [{ label: `COMPRESS ${target.track.name.toUpperCase().slice(0, 14)}`, act: true, run: () => { this.addInsert(target.track.id, "compressor", { threshold: -18, ratio: 4, attack: 0.01, release: 0.12 }); return this.say("Added. Bypass it in the insert rack to compare.", { quiet: true, chips: [{ label: "OPEN INSERTS", run: () => { s.select(target.track.id); window.aura.workbench.open("effects"); } }, this.undoChip()] }); } }] : [] });
    }
    if (is(/\beq\b|equali|frequenc/)) return this.say("EQ is a volume control for one part of the spectrum. Cut before you boost: remove what a sound does not need, and the part that matters appears. Low-mid build-up lives around 200–400 Hz.", { chips: [{ label: "OPEN THE MIXER", run: () => w.mixer.enter() }] });
    if (is(/reverb|space|room sound/)) return this.say("Reverb places a sound in a room. Send a little from several tracks to the same space and they sound like one band. Keep it off the bass and the kick.", { chips: [{ label: "OPEN THE MIXER", run: () => w.mixer.enter() }] });
    if (is(/delay|echo/)) return this.say(`A delay repeats the sound in time with the song. At ${c.p.bpm} BPM an eighth note is ${c.eighth} ms and a dotted eighth is ${Math.round(c.eighth * 1.5)} ms — the classic rhythmic echo.`, { chips: c.by("lead")[0] ? [{ label: "DOTTED DELAY ON THE LEAD", act: true, run: () => { this.addInsert(c.by("lead")[0].track.id, "delay", { time: Math.min(1.5, (c.eighth * 1.5) / 1000), feedback: 0.35 }); return this.say("Added at 25% mix.", { quiet: true, chips: [this.listenChip(), this.undoChip()] }); } }] : [] });
    if (is(/scale|what notes|which notes/)) { const I = scaleIntervals[c.p.scale]; return this.say(`${c.key[0].toUpperCase() + c.key.slice(1)} is ${I.map((step) => names[(c.p.root + step) % 12]).join(" ")}. Stay on those and nothing will clash; step outside on purpose, for colour.`); }
    if (is(/melod|motif|hook|topline|lead line/)) return this.say("A melody people remember is a short idea, repeated, with one thing changed the second time. Leave silence in it.", { chips: [{ label: "WRITE A MOTIF", act: true, run: () => { this.writeMotif(this.read()); return this.say("A two-bar idea, repeated, with the last note changed. It is yours to edit.", { quiet: true, chips: [this.listenChip(), this.undoChip()] }); } }] });
    if (is(/master|loud|limiter|lufs/)) return this.say(`Mastering is the last small adjustment, not a rescue. Leave headroom — your master is at ${Math.round(c.p.master * 100)}% — and check the mix in mono before you worry about loudness. The mixing room's meters tell the truth.`, { chips: [{ label: "GO TO THE MIXING ROOM", run: () => w.goRoom("master") }] });
    if (is(/swing|humani|groove feel|shuffle/)) return this.say(`Swing delays every second sixteenth, so the rhythm leans back. Yours is at ${Math.round(c.p.swing * 100)}%. Around 30% it shuffles; past 50% it limps. Humanise nudges timing and velocity so no two hits are identical.`, { chips: [{ label: "OPEN THE PADS", run: () => w.drums.enter() }] });
    if (is(/sampl|chop/)) return this.say("Sampling is finding two good bars in something that exists and giving them a new job. The turntable can cut bars from any record straight onto your timeline.", { chips: [{ label: "TAKE ME TO THE TURNTABLE", run: () => w.guide.goTo(w.turntable) }, { label: "LEARN BY DOING", run: () => w.guide.lesson("sampling") }] });
    if (is(/arrang|structure|intro|verse|chorus|section|song form/)) return this.say(`An arrangement is who plays when. Yours has ${c.bars} bars and ${c.sections === 1 ? "the same parts all the way through — it is still a loop" : c.sections + " different combinations of parts"}. Start thin, add one thing every four or eight bars, and take something away before each change.`, { chips: [{ label: "COMPOSE AT THE TABLE", run: () => w.timeline.enter() }] });
    if (is(/synth|oscillat|filter|envelope|attack|release|sound design/)) return this.say("A synth is an oscillator making a raw tone, a filter removing brightness, and an envelope shaping how each note starts and ends. Change one thing at a time and listen.", { chips: [{ label: "LEARN AT THE SYNTH", run: () => w.guide.lesson("synthesis") }] });
    if (is(/who are you|what are you|what can you do|help\b/)) return this.say("I am AURA. I live in this house. I can explain what you are hearing, write drums, bass, chords and motifs into your project, tidy a mix, change the light, and walk you to anything.", { chips: [{ label: "WHAT SHOULD I ADD?", run: () => this.hear("what should I add here?") }, { label: "TEACH ME", run: () => this.hear("teach me") }] });
    // Anything else goes to a connected model if there is one; otherwise AURA says what it can do.
    if (this.modelAvailable) return this.model(question, c);
    return this.say("I did not catch a job in that. I can write, explain, fix a mix, or take you somewhere.", { chips: [{ label: "WHAT SHOULD I ADD?", run: () => this.hear("what should I add here?") }, { label: "CREATE A DRUM PATTERN", run: () => this.hear("create a drum pattern") }, { label: "TEACH ME", run: () => this.hear("teach me") }] });
  }
  /** Reads the arrangement at the playhead and proposes the next move. */
  suggest(c) {
    const has = (role) => c.by(role).length > 0, here = c.here.map((t) => t.name).join(", ") || "nothing", chips = [];
    let advice;
    if (!has("drums")) { advice = `At bar ${c.bar + 1} you have ${here}, and no drums anywhere. A pulse would give the harmony something to push against.`; chips.push({ label: "WRITE DRUMS", act: true, run: () => this.hear("create a drum pattern") }); }
    else if (!has("bass")) { advice = `The drums have nothing underneath them. A bass line on the kick — steps ${c.kicks.map((k) => k * 4 + 1).join(", ") || "1 and 9"} — will glue rhythm to harmony.`; chips.push({ label: "ADD A BASS LINE", act: true, run: () => this.hear("make the bass fit the drums") }); }
    else if (!has("chords") && !has("pad")) { advice = `There is rhythm and low end but no harmony. Three or four chords in ${c.key} would give the track a mood.`; chips.push({ label: "WRITE CHORDS", act: true, run: () => this.hear("teach me how chords work") }); }
    else if (!has("lead")) { advice = "Everything supports and nothing leads. A short motif on top — two bars, repeated — would give the ear something to follow."; chips.push({ label: "WRITE A MOTIF", act: true, run: () => this.hear("write a melody") }); }
    else if (c.sections <= 2) { const bar = this.boundary(c); advice = `All the parts are here, but the arrangement barely changes over ${c.bars} bars. Take something away before bar ${bar + 1} so its return means something.`; chips.push({ label: `BREAK BEFORE BAR ${bar + 1}`, act: true, run: () => this.hear("how do I create tension before the drop") }, { label: "COMPOSE AT THE TABLE", run: () => this.w.timeline.enter() }); }
    else { advice = `Bar ${c.bar + 1}: ${here}. The parts and the shape are there. Now it is balance — bring the faders down and build the mix up from drums and bass.`; chips.push({ label: "OPEN THE MIXER", run: () => this.w.mixer.enter() }, { label: "IS IT MUDDY?", run: () => this.hear("why does my mix sound muddy") }); }
    return this.say(advice, { chips });
  }
  /** Looks for the usual causes of a clouded low end in this particular project. */
  muddy(c) {
    const low = c.tracks.filter((x) => x.low && x.role !== "bass" && !x.track.mute), wetBass = c.by("bass").find((x) => x.track.reverb > 0.14), chips = [], findings = [];
    if (low.length) { findings.push(`${low.map((x) => x.track.name).join(" and ")} ${low.length > 1 ? "sit" : "sits"} in the same register as the bass`); for (const x of low.slice(0, 2)) if (!x.highpassed) chips.push({ label: `HIGH-PASS ${x.track.name.toUpperCase().slice(0, 14)}`, act: true, run: () => { this.addInsert(x.track.id, "filter", { frequency: 140, q: 0.7 }); return this.say(`${x.track.name} now starts at 140 Hz. The bass has the bottom to itself.`, { quiet: true, chips: [this.listenChip(), this.undoChip()] }); } }); }
    if (wetBass) { findings.push(`the bass is sending ${Math.round(wetBass.track.reverb * 100)}% to the reverb`); chips.push({ label: "DRY THE BASS", act: true, run: () => { this.s.commit("Change reverb", (p) => { p.tracks.find((t) => t.id === wetBass.track.id).reverb = 0.03; }); return this.say("The bass is dry now. Low notes and long reverb make fog.", { quiet: true, chips: [this.undoChip()] }); } }); }
    const boosted = c.tracks.filter((x) => x.track.eq > 2);
    if (boosted.length) findings.push(`${boosted.map((x) => x.track.name).join(", ")} ${boosted.length > 1 ? "have" : "has"} the low-mids boosted`);
    const loud = c.tracks.filter((x) => x.track.gain > 0.8 && !x.track.mute).length;
    if (loud >= 3) findings.push(`${loud} faders are near the top, so nothing has room`);
    chips.push({ label: "OPEN THE MIXER", run: () => this.w.mixer.enter() });
    return this.say(findings.length ? `Mud is usually several things sharing 150–400 Hz. Here: ${findings.join("; ")}.` : "I cannot see an obvious cause in the notes or the routing: nothing is doubling the bass and the sends are modest. Listen in mono, then pull the low-mid knob down a little on the pads.", { chips });
  }
  async hearChords(chords) {
    const track = this.w.keysTrack(), e = this.s.engine;
    for (const chord of chords) {
      const voices = await Promise.all(chord.map((pitch) => e.noteOn(track, pitch, 0.55).catch(() => null)));
      this.halos().forEach((h) => h.speak(1));
      await new Promise((resolve) => setTimeout(resolve, 900));
      voices.forEach((v) => v?.release());
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  async model(question, c) {
    this.say("Thinking…", { quiet: true, hold: 30000 });
    try {
      const context = { bpm: c.p.bpm, bars: c.bars, root: names[c.p.root], scale: c.p.scale, tracks: c.tracks.slice(0, 32).map((x) => ({ instrument: x.track.instrument, gain: x.track.gain, pan: x.track.pan, mute: x.track.mute, clips: x.track.clips.length, notes: x.notes.length, outOfScale: 0 })) };
      const response = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(25000), body: JSON.stringify({ question: question.slice(0, 1000), context, history: [] }) });
      if (!response.ok) throw Error("unavailable");
      const value = await response.json();
      return this.say(String(value.answer || "").slice(0, 1200) || "I have no answer for that.");
    } catch {
      return this.say("The connected model did not answer. I can still write, explain and fix things myself.", { chips: [{ label: "WHAT SHOULD I ADD?", run: () => this.hear("what should I add here?") }] });
    }
  }
}
export { makeTrack };
