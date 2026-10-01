import test from "node:test";
import assert from "node:assert/strict";
import { foundationFromText } from "../src/foundation.js";
import { validateProject, inScale } from "../src/project.js";
test("text recipe transposes the editable starter to F major and a bounded tempo", () => {
  const p = foundationFromText("Hopeful F major at 128 BPM");
  validateProject(p);
  assert.equal(p.bpm, 128);
  assert.equal(p.root, 5);
  assert.equal(p.scale, "Major");
  for (const t of p.tracks.filter((t) => t.instrument !== "drums"))
    for (const c of t.clips)
      for (const n of c.notes) assert.ok(inScale(n.pitch, p));
});
test("piano only and sparse/ambient rules modify real notes and routing", () => {
  assert.deepEqual(
    foundationFromText("piano only").tracks.map((t) => t.instrument),
    ["keys"],
  );
  const p = foundationFromText("minimal ambient at 999 BPM"),
    base = foundationFromText("");
  assert.equal(p.bpm, 240);
  assert.equal(p.tracks.find((t) => t.instrument === "drums").mute, true);
  assert.equal(
    p.tracks.find((t) => t.instrument === "bass").clips[0].notes.length,
    base.tracks.find((t) => t.instrument === "bass").clips[0].notes.length / 2,
  );
});
