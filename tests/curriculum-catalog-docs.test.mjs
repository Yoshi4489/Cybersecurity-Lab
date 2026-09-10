import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const labRoot = new URL("../standalone-labs/", import.meta.url);
const ids = (await readdir(labRoot)).filter((id) => /^\d\d-/.test(id)).sort();
const manifests = await Promise.all(ids.map(async (id) => JSON.parse(await readFile(new URL(`${id}/lab.json`, labRoot), "utf8"))));

const files = {
  root: await readFile(new URL("README.md", root), "utf8"),
  about: await readFile(new URL("ABOUT.md", root), "utf8"),
  agent: await readFile(new URL("AGENT.md", root), "utf8"),
  design: await readFile(new URL("DESIGN.md", root), "utf8"),
  standalone: await readFile(new URL("standalone-labs/README.md", root), "utf8"),
};

test("current curriculum documentation names every discovered lab", () => {
  assert.equal(manifests.length, 18);
  for (const lab of manifests) {
    assert.ok(files.standalone.includes(`(${lab.id}/README.md)`), `${lab.id} missing from standalone index`);
    if (Number(lab.id.slice(0, 2)) >= 11) {
      assert.ok(files.standalone.includes(lab.title), `${lab.title} missing from standalone index`);
    }
  }
});

test("top-level documentation publishes the 00–17 current range and 18-lab total", () => {
  assert.match(files.root, /current curriculum has \*\*18 labs\*\*/);
  assert.match(files.about, /eighteen small investigations/);
  assert.match(files.agent, /Labs 00–17/);
  assert.match(files.agent, /`standalone-labs\/00-\*` through `17-\*`/);
  assert.match(files.design, /eighteen investigations/);
});
