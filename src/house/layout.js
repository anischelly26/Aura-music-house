export const rooms = [
  {
    id: "gallery",
    name: "Entry",
    number: "01",
    x: 0,
    z: 20,
    col: 1,
    row: 2,
    eyebrow: "EVERY PIECE BEGINS HERE",
    description: "Your projects hang here. Start one, or return to one.",
    tool: "Open your projects",
    accent: "#ffd9a8",
    look: [-5, 2, 18],
  },
  {
    id: "idea",
    name: "AURA lab",
    number: "02",
    x: -20,
    z: 20,
    col: 0,
    row: 2,
    eyebrow: "ASK. SKETCH. BEGIN.",
    description: "Describe a feeling and AURA drafts an editable beginning.",
    tool: "Describe a feeling",
    accent: "#ffe6c4",
    look: [-22, 1.5, 17],
  },
  {
    id: "instrument",
    name: "Synth room",
    number: "03",
    x: -20,
    z: 0,
    col: 0,
    row: 1,
    eyebrow: "SOUND, GIVEN FORM",
    description: "Oscillators, filters and eighty-eight keys.",
    tool: "Open the piano roll",
    accent: "#ffcf9a",
    look: [-23, 1.2, -3],
  },
  {
    id: "rhythm",
    name: "Drum room",
    number: "04",
    x: 20,
    z: 0,
    col: 2,
    row: 1,
    eyebrow: "A PULSE BECOMES A PATTERN",
    description: "Hit it, step it, swing it.",
    tool: "Open the step editor",
    accent: "#ffb37a",
    look: [21, 1, -2],
  },
  {
    id: "record",
    name: "Vocal room",
    number: "05",
    x: 20,
    z: 20,
    col: 2,
    row: 2,
    eyebrow: "SOMETHING HUMAN",
    description: "A booth, a microphone, a take.",
    tool: "Record a take",
    accent: "#ffe0b8",
    look: [22, 1.7, 17],
  },
  {
    id: "arrange",
    name: "Sampling room",
    number: "06",
    x: -20,
    z: -20,
    col: 0,
    row: 0,
    eyebrow: "FOUND SOUND",
    description: "Records, tape and the long view of your song.",
    tool: "Open the arrangement",
    accent: "#ffd2a0",
    look: [-28, 2.2, -21],
  },
  {
    id: "living",
    name: "Living room",
    number: "07",
    x: 0,
    z: 0,
    col: 1,
    row: 1,
    eyebrow: "WHERE IDEAS BECOME TRACKS",
    description: "The table is the timeline. The wall is the arrangement.",
    tool: "Open the precise editor",
    accent: "#ffd4a3",
    look: [0, 2, -4],
  },
  {
    id: "master",
    name: "Mixing room",
    number: "08",
    x: 0,
    z: -20,
    col: 1,
    row: 0,
    eyebrow: "SPACE FOR EVERY VOICE",
    description: "A desk, two monitors and honest meters.",
    tool: "Open the reference tools",
    accent: "#ffdcb4",
    look: [0, 2, -26],
  },
  {
    id: "terrace",
    name: "Terrace",
    number: "09",
    x: 20,
    z: -20,
    col: 2,
    row: 0,
    eyebrow: "LET IT LEAVE THE HOUSE",
    description: "Render the piece. Take it into the world.",
    tool: "Export the piece",
    accent: "#ffe2c0",
    look: [23, 2, -25],
  },
];
/** The sunken lounge at the heart of the living room. Two treads lead down on the north and east sides. */
export const pit = { minX: -3.7, maxX: 3.7, minZ: -1, maxZ: 6, depth: 0.45, tread: 0.36, treads: 2 };
/** Where a room shortcut sets you down: [x, z, lookX, lookY, lookZ]. */
export const views = {
  gallery: [0, 24, 0, 1.9, 10],
  idea: [-16, 25, -21, 1.5, 18],
  instrument: [-15.5, 4.2, -22, 1.2, -2],
  rhythm: [15.5, 5, 21, 0.9, -1],
  record: [16, 25.5, 20, 1.4, 16],
  arrange: [-14.5, -14.5, -24, 1.6, -22],
  living: [5.6, 7.4, -1, 0.9, -1.5],
  master: [0, -16.8, 0, 1.2, -24],
  terrace: [15, -15, 24, 1.6, -24],
};
export const roomById = (id) => rooms.find((r) => r.id === id);
export const roomAt = (x, z) =>
  rooms.find(
    (r) =>
      r.col === (x < -9 ? 0 : x > 9 ? 2 : 1) &&
      r.row === (z < -9 ? 0 : z > 9 ? 2 : 1),
  ) || rooms[0];
/** Route through room centers and open portals, never through partition walls. */
export function roomRoute(fromId, toId) {
  const from = roomById(fromId),
    to = roomById(toId);
  if (!from || !to) return [];
  const queue = [[from]],
    visited = new Set([from.id]);
  while (queue.length) {
    const path = queue.shift(),
      last = path.at(-1);
    if (last.id === to.id) return path;
    for (const r of rooms)
      if (
        !visited.has(r.id) &&
        Math.abs(r.col - last.col) + Math.abs(r.row - last.row) === 1
      ) {
        visited.add(r.id);
        queue.push([...path, r]);
      }
  }
  return [];
}
export function projectSeed(project) {
  let hash = 2166136261;
  for (const char of project.id + "|" + project.root + "|" + project.scale)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export function seeded(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
