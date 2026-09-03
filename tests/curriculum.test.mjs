import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { unmetLabPrerequisites } from "../controller/curriculum.mjs";

const labs = [
  { id: "first", prerequisites: [], objectives: [{ id: "a" }] },
  { id: "second", prerequisites: ["first"], objectives: [{ id: "b" }, { id: "c" }] },
];
const byId = new Map(labs.map((lab) => [lab.id, lab]));

test("lab prerequisites require complete prerequisite labs", () => {
  const progress = { first: { completedObjectives: [] } };
  assert.deepEqual(unmetLabPrerequisites(labs[1], byId, progress), ["first"]);
  progress.first.completedObjectives.push("a");
  assert.deepEqual(unmetLabPrerequisites(labs[1], byId, progress), []);
});

test("objectives follow manifest order", async () => {
  const { unmetObjectivePredecessors } = await import("../controller/curriculum.mjs");
  assert.deepEqual(unmetObjectivePredecessors(labs[1], "c", { completedObjectives: [] }), ["b"]);
  assert.deepEqual(unmetObjectivePredecessors(labs[1], "c", { completedObjectives: ["b"] }), []);
});

test("controller enforces curriculum checks before accepting a flag", async () => {
  const source = await readFile(new URL("../controller/server.mjs", import.meta.url), "utf8");
  assert.match(source, /from "\.\/curriculum\.mjs"/u);
  assert.match(source, /unmetLabPrerequisites\(lab, labById, allProgress\)/u);
  assert.match(source, /unmetObjectivePredecessors\(lab, objectiveId, currentProgress\)/u);
  assert.match(source, /Complete prerequisite labs first/u);
  assert.match(source, /Complete earlier objectives first/u);
});
