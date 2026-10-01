import test from "node:test";
import assert from "node:assert/strict";
import { rooms, roomRoute, roomAt, projectSeed } from "../src/house/layout.js";
test("all 81 room journeys use connected portals in a single house", () => {
  for (const a of rooms)
    for (const b of rooms) {
      const path = roomRoute(a.id, b.id);
      assert.equal(path[0].id, a.id);
      assert.equal(path.at(-1).id, b.id);
      assert.equal(roomAt(b.x, b.z).id, b.id);
      for (let i = 1; i < path.length; i++)
        assert.equal(
          Math.abs(path[i].col - path[i - 1].col) +
            Math.abs(path[i].row - path[i - 1].row),
          1,
        );
    }
});
test("a project has a stable visual identity across saves", () => {
  assert.equal(
    projectSeed({ id: "one", root: 2, scale: "Minor" }),
    projectSeed({ id: "one", root: 2, scale: "Minor" }),
  );
  assert.notEqual(
    projectSeed({ id: "one", root: 2, scale: "Minor" }),
    projectSeed({ id: "two", root: 2, scale: "Minor" }),
  );
});
