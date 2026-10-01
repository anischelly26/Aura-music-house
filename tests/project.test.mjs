import test from "node:test";
import assert from "node:assert/strict";
import { newProject, validateProject, ProjectStore } from "../src/project.js";
import { projectBeats, automationValue, encodeWav } from "../src/audio.js";
test("demo is a valid 8 bar arrangement with real MIDI across five tracks", () => {
  const p = newProject();
  assert.equal(validateProject(p), p);
  assert.equal(projectBeats(p), 32);
  assert.equal(p.tracks.length, 5);
  assert.ok(p.tracks.every((t) => t.clips.some((c) => c.notes.length > 0)));
});
test("rejects nonfinite tempo, malformed note and duplicate clip IDs", () => {
  for (const edit of [
    (p) => (p.bpm = Infinity),
    (p) => (p.tracks[0].clips[0].notes[0].pitch = 300),
    (p) => (p.tracks[0].clips[1].id = p.tracks[0].clips[0].id),
  ]) {
    const p = newProject();
    edit(p);
    assert.throws(() => validateProject(p));
  }
});
test("undo restores the previous project and redo reapplies it", () => {
  const s = new ProjectStore(newProject());
  s.commit("Tempo", (p) => (p.bpm = 140));
  s.undo();
  assert.equal(s.project.bpm, 112);
  s.redo();
  assert.equal(s.project.bpm, 140);
  s.undo();
  s.commit("Tempo", (p) => (p.bpm = 90));
  assert.equal(s.redoStack.length, 0);
});
test("automation interpolates and holds outside bounds", () => {
  const pts = [
    { beat: 4, value: 0.2 },
    { beat: 8, value: 0.8 },
  ];
  assert.equal(automationValue([], 3), 1);
  assert.equal(automationValue(pts, 0), 0.2);
  assert.equal(automationValue(pts, 6), 0.5);
  assert.equal(automationValue(pts, 12), 0.8);
});
test("WAV is stereo interleaved PCM16 with a correct header and clamped peaks", () => {
  const b = {
    length: 3,
    numberOfChannels: 2,
    sampleRate: 44100,
    getChannelData: (i) =>
      i === 0
        ? Float32Array.from([0, 0.5, 2])
        : Float32Array.from([0, -0.5, -2]),
  };
  const a = encodeWav(b),
    v = new DataView(a);
  assert.equal(a.byteLength, 56);
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getUint32(40, true), 12);
  assert.equal(v.getInt16(52, true), 32767);
  assert.equal(v.getInt16(54, true), -32768);
});
