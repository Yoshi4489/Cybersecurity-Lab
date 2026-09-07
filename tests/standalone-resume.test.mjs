import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Run the real CLI against disposable state. Only the Docker subprocess is mocked.
const dockerStub = "data:text/javascript," + encodeURIComponent(`
  import childProcess from 'node:child_process';
  import { syncBuiltinESMExports } from 'node:module';
  childProcess.spawnSync = (command) => {
    if (command !== 'docker') throw new Error('Unexpected subprocess: ' + command);
    return { status: Number(process.env.TEST_DOCKER_STATUS || 0), stdout: '', stderr: '' };
  };
  syncBuiltinESMExports();
`);

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "cyberlab-resume-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const name of ["standalone-labctl.mjs", "standalone-curriculum.mjs"]) {
    cpSync(new URL(`../scripts/${name}`, import.meta.url), join(directory, "scripts", name));
  }
  // All manifests are needed to validate cross-lab prerequisite references.
  const ids = ["01-network-triage", "02-service-fingerprint", "03-dns-breadcrumbs",
    "04-zone-transfer", "05-linux-evidence", "06-signals-capstone",
    "07-web-breach-chain", "08-cipher-locker", "09-content-discovery"];
  for (const id of ids) cpSync(new URL(`../standalone-labs/${id}/lab.json`, import.meta.url),
    join(directory, "standalone-labs", id, "lab.json"));
  const id = ids[0];
  const runtime = join(directory, "standalone-labs", ".runtime", id);
  const ctl = (action, extra = [], status = "0") => spawnSync(process.execPath,
    ["--import", dockerStub, join(directory, "scripts", "standalone-labctl.mjs"), action, id, ...extra],
    { cwd: directory, encoding: "utf8", windowsHide: true, env: { ...process.env, TEST_DOCKER_STATUS: status } });
  const snapshot = () => ["flags.env", "progress.json"].map((name) => readFileSync(join(runtime, name), "utf8"));
  return { ctl, snapshot, runtime };
}

test("repeated start and stop/start preserve the learner's flags and submissions", (t) => {
  const { ctl, snapshot } = fixture(t);
  assert.equal(ctl("start").status, 0);
  const flag = snapshot()[0].split("\n")[0].split("=")[1];
  assert.equal(ctl("verify", ["network-baseline", flag]).status, 0);
  const saved = snapshot();
  assert.match(ctl("start").stdout, /Resumed/);
  assert.deepEqual(snapshot(), saved);
  assert.equal(ctl("stop").status, 0);
  assert.equal(ctl("start").status, 0);
  assert.deepEqual(snapshot(), saved);
  assert.equal(ctl("start", [], "1").status, 1);
  assert.deepEqual(snapshot(), saved, "a Docker failure must not discard learner state");
});

test("reset alone rotates all flags and clears submissions; failed teardown preserves state", (t) => {
  const { ctl, snapshot } = fixture(t);
  assert.equal(ctl("start").status, 0);
  const flag = snapshot()[0].split("\n")[0].split("=")[1];
  assert.equal(ctl("verify", ["network-baseline", flag]).status, 0);
  const saved = snapshot();
  assert.equal(ctl("reset", [], "1").status, 1);
  assert.deepEqual(snapshot(), saved);
  assert.equal(ctl("reset").status, 0);
  const fresh = snapshot();
  for (const line of saved[0].trim().split("\n")) assert.ok(!fresh[0].includes(line));
  assert.deepEqual(JSON.parse(fresh[1]).completed, {});
  assert.notEqual(JSON.parse(fresh[1]).runId, JSON.parse(saved[1]).runId);
  assert.equal(ctl("verify", ["network-baseline", flag]).status, 1);
});

test("start refuses incomplete runtime state without overwriting the surviving file", (t) => {
  for (const missing of ["flags.env", "progress.json"]) {
    const { ctl, snapshot, runtime } = fixture(t);
    assert.equal(ctl("start").status, 0);
    const saved = snapshot();
    rmSync(join(runtime, missing));
    const result = ctl("start");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Incomplete runtime state/);
    const remaining = missing === "flags.env" ? "progress.json" : "flags.env";
    assert.equal(readFileSync(join(runtime, remaining), "utf8"), saved[remaining === "flags.env" ? 0 : 1]);
  }
});
