import { makeTrack, makeClip, uid, scaleIntervals } from "../project.js";
import { seeded } from "../house/layout.js";

/**
 * Transparent, rule-based writing: drum grids, bass that follows the kick, diatonic
 * chords and a motif that repeats with one change. No model, no sampling — every
 * result is ordinary editable MIDI.
 */
export const styles = {
  lofi: { label: "Lo-fi", bpm: [72, 86], scales: ["Minor", "Dorian"], swing: 0.34, kit: "soft", drums: "boombap", chords: "electric", bass: "bass", lead: "marimba", pad: "pad", progressions: [[0, 5, 3, 4], [0, 3, 5, 4], [1, 4, 0, 0]] },
  house: { label: "House", bpm: [118, 126], scales: ["Minor", "Dorian"], swing: 0.08, kit: "classic", drums: "four", chords: "organ", bass: "bass", lead: "pluck", pad: "strings", progressions: [[0, 5, 2, 6], [0, 3, 0, 4], [0, 2, 5, 4]] },
  trap: { label: "Trap", bpm: [132, 148], scales: ["Minor", "Harmonic minor"], swing: 0, kit: "industrial", drums: "trap", chords: "bell", bass: "bass", lead: "flute", pad: "choir", progressions: [[0, 0, 5, 4], [0, 5, 0, 6], [0, 3, 5, 4]] },
  ambient: { label: "Ambient", bpm: [60, 78], scales: ["Major", "Dorian"], swing: 0, kit: "soft", drums: null, chords: "pad", bass: "bass", lead: "harp", pad: "strings", progressions: [[0, 3, 4, 3], [0, 4, 5, 3], [5, 3, 0, 4]] },
  techno: { label: "Techno", bpm: [126, 134], scales: ["Minor"], swing: 0.04, kit: "industrial", drums: "techno", chords: "lead", bass: "bass", lead: "pluck", pad: "pad", progressions: [[0, 0, 5, 5], [0, 0, 0, 6], [0, 2, 0, 5]] },
  boombap: { label: "Boom bap", bpm: [84, 96], scales: ["Minor", "Dorian"], swing: 0.3, kit: "classic", drums: "boombap", chords: "keys", bass: "bass", lead: "reed", pad: "strings", progressions: [[0, 3, 4, 0], [0, 5, 3, 4], [1, 4, 0, 5]] },
  dnb: { label: "Drum & bass", bpm: [168, 176], scales: ["Minor"], swing: 0, kit: "classic", drums: "dnb", chords: "pad", bass: "bass", lead: "bell", pad: "strings", progressions: [[0, 5, 3, 4], [0, 0, 5, 6]] },
};
const note = (pitch, start, duration, velocity) => ({ id: uid(), pitch, start: Math.round(start * 1000) / 1000, duration, velocity: Math.max(0.05, Math.min(1, velocity)) });
const seven = (scale) => (scaleIntervals[scale]?.length === 7 ? scaleIntervals[scale] : scaleIntervals.Minor);

/** One bar (sixteen steps) of drums in a named feel. `fill` busies the last beat. */
export function drumPattern(feel, random = Math.random, { fill = false, sparse = false } = {}) {
  const out = [], hit = (pitch, step, velocity, duration = 0.15) => out.push(note(pitch, step / 4, duration, velocity));
  const kick = 36, snare = 38, clap = 39, hat = 42, open = 46, shaker = 70, ride = 51;
  if (feel === "four") {
    for (const s of [0, 4, 8, 12]) hit(kick, s, 0.88);
    for (const s of [4, 12]) hit(clap, s, 0.68);
    for (let s = 0; s < 16; s++) if (s % 4 === 2) hit(open, s, 0.5, 0.2); else if (!sparse && s % 2 === 0) hit(hat, s, 0.32);
    if (!sparse) for (const s of [3, 7, 11, 15]) if (random() < 0.5) hit(shaker, s, 0.26);
  } else if (feel === "trap") {
    hit(kick, 0, 0.92); hit(kick, random() < 0.5 ? 6 : 7, 0.8); if (random() < 0.7) hit(kick, 10, 0.84); if (random() < 0.4) hit(kick, 13, 0.7);
    hit(snare, 8, 0.82); hit(clap, 8, 0.6);
    for (let s = 0; s < 16; s += 2) hit(hat, s, s % 4 === 0 ? 0.5 : 0.36);
    // A hat roll: the signature gesture, placed once or twice per bar.
    const roll = [2, 6, 10, 14][Math.floor(random() * 4)];
    for (let i = 1; i < 4; i++) hit(hat, roll + i * 0.5, 0.26 + i * 0.07, 0.06);
    if (random() < 0.6) hit(open, 14, 0.42, 0.22);
  } else if (feel === "techno") {
    for (const s of [0, 4, 8, 12]) hit(kick, s, 0.95);
    for (const s of [2, 6, 10, 14]) hit(open, s, 0.45, 0.14);
    for (const s of [4, 12]) hit(clap, s, 0.55);
    if (!sparse) for (let s = 0; s < 16; s++) if (s % 2) hit(hat, s, 0.22 + random() * 0.14);
    if (random() < 0.5) hit(ride, 14, 0.3, 0.3);
  } else if (feel === "dnb") {
    hit(kick, 0, 0.9); hit(kick, 10, 0.86); hit(snare, 4, 0.84); hit(snare, 12, 0.84);
    for (let s = 0; s < 16; s += 2) hit(hat, s, s % 4 ? 0.34 : 0.46);
    for (const s of [7, 15]) if (random() < 0.6) hit(snare, s, 0.3);
    if (random() < 0.5) hit(kick, 6, 0.6);
  } else {
    // Boom bap: a late second kick and a lazy pocket.
    hit(kick, 0, 0.9); hit(kick, random() < 0.6 ? 7 : 6, 0.7); hit(kick, 10, 0.82);
    hit(snare, 4, 0.78); hit(snare, 12, 0.8);
    for (let s = 0; s < 16; s += 2) hit(hat, s, s % 4 ? 0.34 : 0.48);
    if (!sparse && random() < 0.6) hit(hat, 15, 0.28);
    if (random() < 0.35) hit(open, 6, 0.36, 0.2);
  }
  if (fill) {
    const keep = out.filter((n) => n.start < 3 || n.pitch === kick);
    out.length = 0;
    out.push(...keep);
    for (let i = 0; i < 4; i++) hit(i < 2 ? snare : 45, 12 + i, 0.5 + i * 0.1);
  }
  return out;
}
/** Diatonic triads for scale degrees, voiced around middle C. */
export function chordsFor(root, scale, degrees) {
  const I = seven(scale);
  return degrees.map((d) => [0, 2, 4].map((step) => 48 + root + I[(d + step) % 7] + (d + step >= 7 ? 12 : 0)).map((p) => (p > 67 ? p - 12 : p)).sort((x, y) => x - y));
}
/** A bass part that lands with the kick: roots on the kick's steps, an octave lift now and then. */
export function bassFor(chords, kicks, feel, random = Math.random, beatsPerChord = 4) {
  const out = [], steps = kicks.length ? kicks : [0, 2];
  chords.forEach((chord, i) => {
    const root = chord[0] - (chord[0] >= 60 ? 24 : 12), base = i * beatsPerChord;
    for (let bar = 0; bar < beatsPerChord / 4; bar++)
      for (const step of steps) {
        const start = base + bar * 4 + step, long = feel === "trap" || feel === "ambient";
        out.push(note(random() < 0.16 && step > 0 ? root + 12 : root, start + 0.01, long ? 1.4 : feel === "four" || feel === "techno" ? 0.42 : 0.7, 0.62 + (step === 0 ? 0.16 : 0)));
      }
    if ((feel === "four" || feel === "techno") && beatsPerChord >= 4) for (let b = 0; b < beatsPerChord; b++) out.push(note(root + 12, base + b + 0.5, 0.22, 0.5));
  });
  return out;
}
/** A two-bar idea, repeated, with the last note changed the second time. */
export function melodyFor(root, scale, chords, random = Math.random, bars = 4) {
  const I = scaleIntervals[scale] || scaleIntervals.Minor, pool = [];
  for (let octave = 0; octave < 2; octave++) for (const step of I) pool.push(60 + root + step + octave * 12);
  const rhythm = [];
  for (let s = 0; s < 16; s++) if (random() < (s % 4 === 0 ? 0.75 : s % 2 === 0 ? 0.5 : 0.18)) rhythm.push(s / 2);
  if (rhythm.length < 3) rhythm.push(0, 1.5, 3);
  let index = Math.floor(pool.length / 2);
  const motif = rhythm.map((start, i) => {
    index = Math.max(0, Math.min(pool.length - 1, index + Math.round((random() - 0.5) * 4)));
    return { start, pitch: i === 0 ? chords[0][2] + 12 : pool[index] };
  });
  const out = [];
  for (let rep = 0; rep < bars / 2; rep++)
    motif.forEach((n, i) => {
      const last = i === motif.length - 1 && rep % 2 === 1, next = motif[i + 1]?.start ?? 8;
      out.push(note(last ? chords[(rep * 2 + 1) % chords.length][1] + 12 : n.pitch, rep * 8 + n.start, Math.min(1.5, Math.max(0.3, (next - n.start) * 0.85)), i % 4 === 0 ? 0.66 : 0.48));
    });
  return out;
}
export const kickSteps = (notes) => [...new Set(notes.filter((n) => n.pitch === 36 && n.start < 4).map((n) => Math.round(n.start * 4) / 4))].sort((x, y) => x - y);

/** A complete sixteen-bar piece: intro, body, a thinner ending. Deterministic for a given seed. */
export function compose(seed, styleName = "lofi", name = "Untitled") {
  const style = styles[styleName] || styles.lofi, random = seeded(seed);
  const bpm = Math.round(style.bpm[0] + random() * (style.bpm[1] - style.bpm[0])), root = Math.floor(random() * 12), scale = style.scales[Math.floor(random() * style.scales.length)];
  const degrees = style.progressions[Math.floor(random() * style.progressions.length)], chords = chordsFor(root, scale, degrees);
  const p = { version: 1, id: "aura-original-" + seed, name, bpm, root, scale, bars: 16, master: 0.72, swing: style.swing, tracks: [], assets: {} };
  const add = (instrument, title, setup) => { const t = makeTrack(instrument, p.tracks.length); t.name = title; setup?.(t); p.tracks.push(t); return t; };
  const keys = add(style.chords, "Chords", (t) => { t.gain = 0.5; t.pan = -0.14; t.reverb = 0.26; });
  const pad = add(style.pad, "Air", (t) => { t.gain = 0.3; t.pan = 0.2; t.reverb = 0.4; });
  const bass = add(style.bass, "Bass", (t) => { t.gain = 0.66; });
  const lead = add(style.lead, "Motif", (t) => { t.gain = 0.42; t.pan = 0.16; t.reverb = 0.3; });
  let main = [];
  if (style.drums) {
    const drums = add("drums", "Drums", (t) => { t.gain = 0.62; t.drumKit = style.kit; });
    main = drumPattern(style.drums, random);
    const thin = drumPattern(style.drums, random, { sparse: true }).filter((n) => n.pitch !== 36);
    for (let bar = 0; bar < 16; bar++) {
      const c = makeClip(bar < 4 ? "Entry" : bar % 4 === 3 ? "Turn" : "Groove", bar * 4, 4);
      c.notes = (bar < 4 ? thin : bar >= 14 ? thin : bar % 4 === 3 ? drumPattern(style.drums, random, { fill: true }) : main).map((n) => ({ ...n, id: uid() }));
      drums.clips.push(c);
    }
  }
  const kicks = kickSteps(main), beatsPerChord = 4;
  for (let section = 0; section < 4; section++) {
    const start = section * 16, c = makeClip(["Opening", "Body", "Lift", "Leaving"][section], start, 16);
    chords.forEach((chord, i) => chord.forEach((pitch, j) => c.notes.push(note(pitch, i * beatsPerChord + j * 0.03, beatsPerChord - 0.25, 0.46))));
    keys.clips.push(c);
    const air = makeClip("Air", start, 16);
    chords.forEach((chord, i) => air.notes.push(note(chord[1] + 12, i * beatsPerChord, beatsPerChord - 0.1, 0.3), note(chord[2] + 12, i * beatsPerChord, beatsPerChord - 0.1, 0.26)));
    pad.clips.push(air);
    if (section > 0) { const b = makeClip("Low end", start, 16); b.notes = bassFor(chords, kicks, style.drums || "ambient", random, beatsPerChord); bass.clips.push(b); }
    if (section === 1 || section === 2) { const m = makeClip("Motif", start, 16); m.notes = melodyFor(root, scale, chords, random); lead.clips.push(m); }
  }
  pad.automation = [{ beat: 0, value: 0.3 }, { beat: 16, value: 0.7 }, { beat: 48, value: 0.9 }, { beat: 64, value: 0.35 }];
  return p;
}
