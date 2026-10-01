import { effects } from "./effects.js";
import { uid } from "./id.js";
export { uid };
export const colors = [
  "#c5b28e",
  "#a2b29a",
  "#be946f",
  "#9babb1",
  "#bda49c",
  "#c2bd9b",
];
export const presets = [
  {
    id: "keys",
    name: "Felt circuits",
    category: "Keys",
    description: "Soft, harmonic synthesized keys",
    tags: "piano warm mellow",
    color: colors[0],
  },
  {
    id: "pad",
    name: "Midnight glass",
    category: "Pads",
    description: "Slow-attack detuned atmosphere",
    tags: "cinematic dark space",
    color: colors[3],
  },
  {
    id: "bass",
    name: "Sub architecture",
    category: "Bass",
    description: "Filtered saw + sine foundation",
    tags: "deep dark sub",
    color: colors[1],
  },
  {
    id: "pluck",
    name: "Prism pluck",
    category: "Plucks",
    description: "Bright, short bell-like voice",
    tags: "bright electronic lead",
    color: colors[2],
  },
  {
    id: "lead",
    name: "Analog current",
    category: "Synth",
    description: "Detuned saw with a soft release",
    tags: "lead analog aggressive",
    color: colors[4],
  },
  {
    id: "drums",
    name: "Circuit drums",
    category: "Drums",
    description: "Synthesized kick, snare and hats",
    tags: "electronic house techno",
    color: colors[2],
  },
];
const extraVoices = [
  ["electric", "Tine piano", "Keys", "FM tine with decaying overtone", "electric piano fm"],
  ["organ", "Drawbar organ", "Keys", "Six harmonic drawbars, sustained envelope", "organ harmonic keys"],
  ["bell", "FM glass", "Mallets", "Inharmonic frequency modulation", "bell fm metallic"],
  ["marimba", "Wood mallet", "Mallets", "Short resonant 1:4:10 partials", "marimba wood percussion"],
  ["strings", "Ensemble circuits", "Strings", "Six detuned saw oscillators, slow bow envelope", "strings ensemble cinematic"],
  ["flute", "Air column", "Winds", "Sine harmonics and band-limited breath", "flute breath wind"],
  ["reed", "Reed column", "Winds", "Odd harmonics through a formant filter", "reed clarinet wind"],
  ["brass", "Brass current", "Brass", "Saw harmonics with rising resonant filter", "brass synth warm"],
  ["choir", "Vowel cloud", "Voices", "Harmonic oscillators through a vocal formant", "choir vowel voice"],
  ["harp", "Wire harp", "Plucks", "Decaying metallic partials and pick transient", "harp pluck string"],
];
presets.push(...extraVoices.map(([id,name,category,description,tags],i)=>({id,name,category,description,tags,color:colors[i%colors.length]})));
export const drumVoices = [["Kick",36],["Snare",38],["Clap",39],["Closed hat",42],["Open hat",46],["Low tom",45],["High tom",50],["Ride",51],["Crash",49],["Shaker",70],["Conga",64]];
export const drumKits = {classic:"Circuit · balanced", soft:"Dust · soft", industrial:"Forge · hard"};

export const noteName = (n) =>
  ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][n % 12] +
  (Math.floor(n / 12) - 1);
export const scaleIntervals = {
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Major: [0, 2, 4, 5, 7, 9, 11],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Pentatonic: [0, 3, 5, 7, 10],
  Blues: [0, 3, 5, 6, 7, 10],
  "Harmonic minor": [0, 2, 3, 5, 7, 8, 11],
};
export const inScale = (n, p) =>
  (scaleIntervals[p.scale] || scaleIntervals.Minor).includes(
    (n - p.root + 120) % 12,
  );
export const makeTrack = (instrument, index = 0) => ({
  id: uid(),
  name: presets.find((p) => p.id === instrument)?.name || "Audio",
  instrument,
  color: colors[index % colors.length],
  gain: 0.65,
  pan: 0,
  mute: false,
  solo: false,
  eq: 0,
  cutoff: 12000,
  reverb: instrument === "pad" ? 0.32 : 0.08,
  compress: false,
  automation: [],
  inserts: [],
  drumKit: "classic",
  clips: [],
});
export const makeClip = (name = "New phrase", start = 0, length = 4) => ({
  id: uid(),
  name,
  start,
  length,
  notes: [],
});
export function newProject(blank = false) {
  const p = {
    version: 1,
    id: uid(),
    name: blank ? "Untitled session" : "After the blue hour",
    bpm: 112,
    root: 2,
    scale: "Minor",
    bars: 8,
    master: 0.72,
    swing: 0,
    tracks: [],
    assets: {},
  };
  if (blank) {
    const t = makeTrack("keys");
    t.clips.push(makeClip());
    p.tracks.push(t);
    return p;
  }
  const names = [
    "Felt circuits",
    "Sub architecture",
    "Circuit drums",
    "Midnight glass",
    "Prism pluck",
  ];
  const instruments = ["keys", "bass", "drums", "pad", "pluck"];
  p.tracks = instruments.map((s, i) => ({
    ...makeTrack(s, i),
    name: names[i],
  }));
  const chords = [
    [62, 65, 69],
    [58, 62, 65],
    [65, 69, 72],
    [60, 64, 67],
  ];
  for (let i = 0; i < 4; i++) {
    const c = makeClip(
      ["D minor", "B♭ major", "F major", "C major"][i],
      i * 8,
      8,
    );
    chords[i].forEach((pitch, j) =>
      c.notes.push({
        id: uid(),
        pitch,
        start: j * 0.04,
        duration: 7.5,
        velocity: 0.5,
      }),
    );
    p.tracks[0].clips.push(c);
    const b = makeClip("Sub pulse", i * 8, 8);
    for (let j = 0; j < 8; j++)
      b.notes.push({
        id: uid(),
        pitch: chords[i][0] - 24,
        start: j + 0.02,
        duration: 0.7,
        velocity: j % 2 ? 0.62 : 0.78,
      });
    p.tracks[1].clips.push(b);
    const pad = makeClip("Air / " + (i + 1), i * 8, 8);
    chords[i].forEach((pitch) =>
      pad.notes.push({
        id: uid(),
        pitch: pitch + 12,
        start: 0,
        duration: 7.6,
        velocity: 0.32,
      }),
    );
    p.tracks[3].clips.push(pad);
  }
  p.tracks[0].pan = -0.16;
  p.tracks[0].reverb = 0.28;
  p.tracks[1].gain = 0.68;
  p.tracks[2].gain = 0.62;
  p.tracks[3].gain = 0.38;
  p.tracks[3].pan = 0.24;
  p.tracks[3].automation = [
    { beat: 0, value: 0.16 },
    { beat: 16, value: 0.42 },
    { beat: 32, value: 0.65 },
  ];
  for (let i = 0; i < 8; i++) {
    const d = makeClip("Circuit groove", i * 4, 4);
    for (let s = 0; s < 16; s++) {
      if (s % 4 === 0)
        d.notes.push({
          id: uid(),
          pitch: 36,
          start: s / 4,
          duration: 0.2,
          velocity: 0.85,
        });
      if (s === 4 || s === 12)
        d.notes.push({
          id: uid(),
          pitch: 38,
          start: s / 4,
          duration: 0.18,
          velocity: 0.68,
        });
      if (s % 2 === 0)
        d.notes.push({
          id: uid(),
          pitch: 42,
          start: s / 4,
          duration: 0.1,
          velocity: s % 4 === 0 ? 0.34 : 0.48,
        });
    }
    p.tracks[2].clips.push(d);
  }
  const lead = makeClip("Light fragments", 8, 16);
  [74, 77, 81, 77, 72, 74, 77, 79, 77, 76, 74, 72, 69, 72, 74, 76].forEach(
    (pitch, j) =>
      lead.notes.push({
        id: uid(),
        pitch,
        start: j,
        duration: 0.4,
        velocity: j % 4 === 0 ? 0.65 : 0.43,
      }),
  );
  p.tracks[4].clips.push(lead);
  p.tracks[4].pan = 0.18;
  p.tracks[4].gain = 0.4;
  return p;
}
const checkedAudioData=new WeakMap();
export function cloneProject(p) {
  const snapshot=structuredClone({...p,assets:{}});
  snapshot.assets=Object.fromEntries(Object.entries(p.assets||{}).map(([id,asset])=>{
    const {data,...metadata}=asset,copy={...structuredClone(metadata),data};
    if(checkedAudioData.get(asset)===data)checkedAudioData.set(copy,data);
    return [id,copy];
  }));
  return snapshot;
}
export function validateProject(p) {
  if (!p || p.version !== 1 || !Array.isArray(p.tracks) || p.tracks.length > 64)
    throw Error("Unsupported project or more than 64 tracks.");
  const finite = (n, min, max) =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
  if(!validId(p.id))throw Error("Invalid project ID.");
  if (
    !finite(p.bpm, 40, 240) ||
    !finite(p.bars, 1, 64) ||
    !finite(p.master, 0, 1) ||
    !finite(p.swing, 0, 1) ||
    !Number.isInteger(p.root) ||
    typeof p.name !== "string" ||
    p.name.length > 200 ||
    !finite(p.root, 0, 11) ||
    !scaleIntervals[p.scale]
  )
    throw Error("Invalid project settings.");
  if (
    !p.assets ||
    typeof p.assets !== "object" ||
    Array.isArray(p.assets) ||
    Object.keys(p.assets).length > 64
  )
    throw Error("Invalid audio assets.");
  for (const [id,a] of Object.entries(p.assets)) {
    if (
      !a ||
      !validId(id) ||
      typeof a.data !== "string" ||
      a.data.length > 28 * 1024 * 1024 ||
      (checkedAudioData.get(a)!==a.data&&!/^[A-Za-z0-9+/]*={0,2}$/.test(a.data)) ||
      !finite(a.duration, 0.001, 360) ||
      !Array.isArray(a.peaks) ||
      a.peaks.length > 1000 ||
      a.peaks.some((x) => !finite(x, 0, 16))
    )
      throw Error("Invalid audio asset.");
    checkedAudioData.set(a,a.data);
  }
  const ids = new Set();
  for (const t of p.tracks) {
    if (!validId(t.id) || ids.has(t.id))
      throw Error("Invalid track ID.");
    ids.add(t.id);
    if (
      typeof t.name !== "string" ||
      t.name.length > 200 ||
      typeof t.mute !== "boolean" ||
      typeof t.solo !== "boolean" ||
      typeof t.compress !== "boolean"
    )
      throw Error("Invalid track metadata.");
    if (!presets.some((x) => x.id === t.instrument) && t.instrument !== "audio")
      throw Error("Unsupported instrument.");
    for (const [k, min, max] of [
      ["gain", 0, 1],
      ["pan", -1, 1],
      ["eq", -12, 12],
      ["cutoff", 100, 16000],
      ["reverb", 0, 1],
    ])
      if (!finite(t[k], min, max)) throw Error("Invalid track " + k);
    if (
      !Array.isArray(t.automation) ||
      t.automation.length > 512 ||
      t.automation.some(
        (a) => !finite(a.beat, 0, 256) || !finite(a.value, 0, 1),
      )
    )
      throw Error("Invalid automation.");
    if(t.inserts !== undefined && (!Array.isArray(t.inserts) || t.inserts.length > 12 || t.inserts.some(x=>!x || !["eq","compressor","delay","saturation","chorus","tremolo","filter","width"].includes(x.type) || typeof x.id!=="string" || typeof x.enabled!=="boolean" || !finite(x.wet,0,1) || !x.params || Object.values(x.params).some(v=>!finite(v,0,20000) && !finite(v,-60,0))))) throw Error("Invalid effect chain.");
    for(const fx of t.inserts||[])for(const [key,value] of Object.entries(fx.params)){
      const bounds=effects[fx.type].params[key];if(!bounds||!finite(value,bounds[0],bounds[1]))throw Error("Invalid effect chain parameter.");
    }
    if(t.drumKit!==undefined && !drumKits[t.drumKit])throw Error("Invalid drum kit.");
    if(t.synth !== undefined) {
      const bounds={attack:[.001,1],release:[.02,2],brightness:[200,16000]};
      if(!t.synth || typeof t.synth!=="object" || Array.isArray(t.synth) || Object.entries(t.synth).some(([k,v])=>!bounds[k] || !finite(v,...bounds[k]))) throw Error("Invalid voice parameters.");
    }
    if (!Array.isArray(t.clips) || t.clips.length > 256)
      throw Error("Invalid clips.");
    for (const c of t.clips) {
      if (!validId(c.id) || ids.has(c.id))
        throw Error("Invalid clip ID.");
      ids.add(c.id);
      if (
        !finite(c.start, 0, 256) ||
        !finite(c.length, 0.25, 256) ||
        c.start + c.length > 256.01
      )
        throw Error("Invalid clip bounds.");
      if (!Array.isArray(c.notes) || c.notes.length > 4096)
        throw Error("Invalid MIDI.");
      for (const n of c.notes)
        if (
          !finite(n.pitch, 0, 127) ||
          !Number.isInteger(n.pitch) ||
          !finite(n.start, 0, 256) ||
          !finite(n.duration, 0.001, 256) ||
          !finite(n.velocity, 0.01, 1)
        )
          throw Error("Invalid note.");
      for(const key of ["gain","fadeIn","fadeOut"])if(c[key]!==undefined && !finite(c[key],0,2))throw Error("Invalid audio clip processing.");
      if(c.reverse!==undefined && typeof c.reverse!=="boolean")throw Error("Invalid reverse flag.");
      if (c.offset !== undefined && !finite(c.offset, 0, 360))
        throw Error("Invalid sample offset.");
      if (c.asset && !p.assets?.[c.asset]) throw Error("Missing audio asset.");
    }
  }
  return p;
}
export class ProjectStore extends EventTarget {
  constructor(p) {
    super();
    this.project = p;
    this.undoStack = [];
    this.redoStack = [];
    this.revision = 0;
  }
  commit(label, fn) {
    const before = cloneProject(this.project);
    try {
      fn(this.project);
      validateProject(this.project);
    } catch (error) {
      this.project = before;
      this.changed("Operation rolled back");
      throw error;
    }
    this.undoStack.push({ label, p: before });
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.changed(label);
  }
  changed(label) {
    this.revision++;
    this.dispatchEvent(new CustomEvent("change", { detail: label }));
  }
  undo() {
    if (!this.undoStack.length) return;
    const x = this.undoStack.pop();
    this.redoStack.push({ label: x.label, p: this.project });
    this.project = x.p;
    this.changed("Undo " + x.label);
  }
  redo() {
    if (!this.redoStack.length) return;
    const x = this.redoStack.pop();
    this.undoStack.push({ label: x.label, p: this.project });
    this.project = x.p;
    this.changed("Redo " + x.label);
  }
  replace(p) {
    this.project = validateProject(p);
    this.undoStack = [];
    this.redoStack = [];
    this.changed("Project opened");
  }
}
