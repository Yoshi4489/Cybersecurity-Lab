import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const labs = JSON.parse(await readFile(new URL("../data/labs.json", import.meta.url), "utf8"));

test("catalog contains 18 unique, decision-complete labs", () => {
  assert.equal(labs.length, 18);
  assert.equal(new Set(labs.map((lab) => lab.id)).size, labs.length);
  const ids = new Set(labs.map((lab) => lab.id));
  for (const lab of labs) {
    assert.match(lab.id, /^[a-z0-9-]+$/);
    assert.ok(lab.objectives.length >= 1);
    assert.ok(lab.hints.length >= 2);
    assert.ok(lab.solution.length >= 20);
    assert.ok(lab.prerequisites.every((id) => ids.has(id)));
    assert.ok(!/https?:\/\/(?!127\.0\.0\.1|gateway|internal|recon-node)/.test(lab.target));
    assert.equal(new Set(lab.objectives.map((item) => item.id)).size, lab.objectives.length);
  }
});

test("every proof key is globally unique", () => {
  const keys = labs.flatMap((lab) => lab.objectives.map((objective) => objective.flagKey));
  assert.equal(new Set(keys).size, keys.length);
});

test("learning path is acyclic", () => {
  const byId = new Map(labs.map((lab) => [lab.id, lab]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error(`cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of byId.get(id).prerequisites) visit(prerequisite);
    visiting.delete(id);
    visited.add(id);
  }
  for (const lab of labs) visit(lab.id);
  assert.equal(visited.size, labs.length);
});

test("authentication enumeration follows the backup evidence", () => {
  const auth = labs.find((lab) => lab.id === "auth-enumeration");
  const content = labs.find((lab) => lab.id === "content-discovery");
  assert.ok(auth.prerequisites.includes(content.id));
  assert.match(auth.hints[0].body, /config\.old/u);
  assert.match(content.solution, /ops\.admin/u);
});

test("service alias trail matches the HTTP banner simulator", () => {
  const alias = labs.find((lab) => lab.id === "dns-certificate-trail");
  assert.equal(alias.title, "Service Alias Trail");
  assert.doesNotMatch(`${alias.title} ${alias.subtitle} ${alias.description} ${alias.skills.join(" ")}`, /Certificate|TLS|certificate/u);
  assert.match(alias.target, /recon-node:9090/u);
});
