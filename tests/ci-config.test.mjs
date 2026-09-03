import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("CI builds once before running the unit suite", async () => {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const workflow = loadYaml(await readFile(join(root, ".github", "workflows", "standalone-labs.yml"), "utf8"));

  assert.equal(packageJson.scripts["test:unit"], "node --test tests/*.test.mjs");
  assert.doesNotMatch(packageJson.scripts["test:unit"], /\bbuild\b/u);
  assert.equal(packageJson.scripts.test, "npm run build && npm run test:unit");

  const staticRuns = workflow.jobs.static.steps.map((step) => step.run).filter(Boolean);
  assert.deepEqual(staticRuns, ["npm ci", "npm run lint", "npm run build", "npm run test:unit"]);
  assert.ok(!staticRuns.includes("npm test"));

  assert.deepEqual(workflow.on.push.branches, ["main"]);
  assert.ok(Object.hasOwn(workflow.on, "pull_request"));
});
