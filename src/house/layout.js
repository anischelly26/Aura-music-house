export const rooms = [
  {
    id: "gallery",
    name: "Entry gallery",
    number: "01",
    x: 0,
    z: 20,
    col: 1,
    row: 2,
    eyebrow: "A PLACE FOR YOUR NEXT IDEA",
    description: "Every piece begins with an empty frame.",
    tool: "Project gallery",
    accent: "#c1a176",
    look: [-5, 2, 18],
  },
  {
    id: "idea",
    name: "The idea room",
    number: "02",
    x: -20,
    z: 20,
    col: 0,
    row: 2,
    eyebrow: "BEFORE IT BECOMES A SONG",
    description: "Capture a voice. Play a phrase. Follow a feeling.",
    tool: "Capture an idea",
    accent: "#d3a17a",
    look: [-22, 1.5, 17],
  },
  {
    id: "instrument",
    name: "Instrument gallery",
    number: "03",
    x: -20,
    z: 0,
    col: 0,
    row: 1,
    eyebrow: "SOUND, GIVEN FORM",
    description: "Sit at the piano. Make something only you can make.",
    tool: "Compose at the piano",
    accent: "#d4c3a1",
    look: [-23, 1.2, -3],
  },
  {
    id: "rhythm",
    name: "The rhythm room",
    number: "04",
    x: 20,
    z: 0,
    col: 2,
    row: 1,
    eyebrow: "A PULSE BECOMES A PATTERN",
    description: "Build a rhythm. Let the architecture keep time.",
    tool: "Program the rhythm",
    accent: "#c49a6c",
    look: [21, 1, -2],
  },
  {
    id: "record",
    name: "Recording room",
    number: "05",
    x: 20,
    z: 20,
    col: 2,
    row: 2,
    eyebrow: "SOMETHING HUMAN",
    description: "The sound in front of you, recorded into your project.",
    tool: "Record a take",
    accent: "#9aaa99",
    look: [22, 1.7, 17],
  },
  {
    id: "arrange",
    name: "Arrangement hall",
    number: "06",
    x: -20,
    z: -20,
    col: 0,
    row: 0,
    eyebrow: "GIVE YOUR IDEAS A SHAPE",
    description: "A long view of your song. Every moment is editable.",
    tool: "Edit the arrangement",
    accent: "#b0b7b8",
    look: [-28, 2.2, -21],
  },
  {
    id: "living",
    name: "The living room",
    number: "07",
    x: 0,
    z: 0,
    col: 1,
    row: 1,
    eyebrow: "THE HOUSE COMES TOGETHER",
    description: "Hear the whole piece. Find space for every voice.",
    tool: "Open the mixing console",
    accent: "#c4aa86",
    look: [0, 2, -4],
  },
  {
    id: "master",
    name: "Listening room",
    number: "08",
    x: 0,
    z: -20,
    col: 1,
    row: 0,
    eyebrow: "LISTEN WITH INTENTION",
    description: "An uncolored final listen. Real peak and RMS measurements.",
    tool: "Inspect the final mix",
    accent: "#b5b9a9",
    look: [0, 2, -26],
  },
  {
    id: "terrace",
    name: "Export terrace",
    number: "09",
    x: 20,
    z: -20,
    col: 2,
    row: 0,
    eyebrow: "LET YOUR SOUND LEAVE THE HOUSE",
    description: "Render your piece. Take it into the world.",
    tool: "Export the piece",
    accent: "#c6ab82",
    look: [23, 2, -25],
  },
];
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
