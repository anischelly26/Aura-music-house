import { newProject, scaleIntervals, noteName } from "./project.js";

/** An authored starter transformed by an explicit small vocabulary, never a model call. */
export function foundationFromText(text) {
  const p = newProject();
  p.name = text.trim().slice(0, 65) || "A new feeling";
  p.intent = text.slice(0, 600);
  const tempo = text.match(/\b(\d{2,3})\s*bpm\b/i);
  if (tempo) p.bpm = Math.min(240, Math.max(40, Number(tempo[1])));
  const key = text.match(/\b([A-G])([#♯b♭]?)\s+(minor|major|dorian)\b/i);
  let scale = /\b(bright|uplifting|hopeful)\b/i.test(text) ? "Major" : "Minor",
    root = 2;
  if (key) {
    root =
      ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[key[1].toUpperCase()] +
        (/[♯#]/.test(key[2]) ? 1 : /[b♭]/.test(key[2]) ? -1 : 0) +
        12) %
      12;
    scale = key[3][0].toUpperCase() + key[3].slice(1).toLowerCase();
  }
  const source = scaleIntervals.Minor,
    target = scaleIntervals[scale];
  for (const t of p.tracks) {
    if (t.instrument === "drums") continue;
    for (const c of t.clips) {
      for (const n of c.notes) {
        const relative = n.pitch - 2,
          degree = source.indexOf(((relative % 12) + 12) % 12);
        n.pitch +=
          root - 2 + (degree >= 0 ? target[degree] - source[degree] : 0);
      }
      if (t.instrument === "keys") {
        const pitches = c.notes.map((n) => n.pitch).sort((a, b) => a - b),
          third = pitches[1] - pitches[0];
        c.name =
          noteName(pitches[0]).replace(/\d+$/, "") +
          (third === 3 ? " minor" : third === 4 ? " major" : " chord");
      }
      if (
        /\b(sparse|minimal)\b/i.test(text) &&
        ["bass", "pluck"].includes(t.instrument)
      )
        c.notes = c.notes.filter((_, i) => i % 2 === 0);
    }
  }
  p.root = root;
  p.scale = scale;
  if (/\bpiano only\b/i.test(text))
    p.tracks = p.tracks.filter((t) => t.instrument === "keys");
  else if (/\b(ambient|no drums|without drums)\b/i.test(text)) {
    const drums = p.tracks.find((t) => t.instrument === "drums");
    if (drums) drums.mute = true;
  }
  return p;
}
