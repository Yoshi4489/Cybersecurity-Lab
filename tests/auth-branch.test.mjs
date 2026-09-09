import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../standalone-labs/", import.meta.url);
const ids = [
  "11-jwt-validation",
  "12-cookie-session-security",
  "13-csrf-request-integrity",
  "14-object-authorization",
  "15-role-enforcement",
  "16-session-replay",
  "17-authorization-capstone",
];
const labs = await Promise.all(ids.map(async (id) => JSON.parse(await readFile(new URL(`${id}/lab.json`, root), "utf8"))));

test("authorization branch is sequential, distinct, and ends in a capstone", () => {
  assert.deepEqual(labs.map((lab) => lab.id), ids);
  assert.equal(new Set(labs.map((lab) => lab.title)).size, labs.length, "each branch lab needs a distinct learner-facing title");
  for (let index = 1; index < labs.length; index += 1) {
    assert.deepEqual(labs[index].prerequisites, [labs[index - 1].id], `${labs[index].id} should follow the prior branch lab`);
  }
  assert.ok(labs.slice(0, -1).every((lab) => lab.difficultyBand === "intermediate-foundations"));
  assert.equal(labs.at(-1).difficultyBand, "intermediate-capstone");
  assert.equal(labs.at(-1).mode, "capstone");
});

test("authorization branch uses unique subnets and objective flag variables", () => {
  assert.equal(new Set(labs.map((lab) => lab.subnet)).size, labs.length);
  const flags = labs.flatMap((lab) => lab.objectives.map((objective) => objective.flagEnv));
  assert.equal(new Set(flags).size, flags.length);
});
