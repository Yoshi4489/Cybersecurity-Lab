import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readLearningMaterial } from "../controller/learning-material.mjs";
import { loadLabs, serviceNames } from "../scripts/standalone-labctl.mjs";
import { load as loadYaml } from "js-yaml";

test("portal status includes every actual Compose service across both manifest formats", () => {
  for (const lab of loadLabs()) {
    const compose = loadYaml(readFileSync(lab.composePath, "utf8"));
    assert.deepEqual(serviceNames(lab).sort(), Object.keys(compose.services).sort());
    const content = readLearningMaterial().find((item) => item.id === lab.id);
    for (const name of serviceNames(lab).filter((name) => name !== "toolbox")) assert.ok(content.scope.includes(name));
  }
});

test("portal learning content covers every rebuilt lab without exposing runtime or flag keys", () => {
  const labs = readLearningMaterial();
  assert.equal(labs.length, 11);
  for (const lab of labs) {
    for (const field of ["scenario", "basics", "objectivesText", "solution", "takeaway"]) assert.ok(lab[field].length > 100, `${lab.id} ${field}`);
    assert.equal(lab.hints.length, lab.objectives.length);
    for (const objective of lab.objectives) {
      for (const field of ["description", "evidence", "observation"]) assert.ok(objective[field].length > 20, `${lab.id}/${objective.id} ${field}`);
      assert.equal(objective.hints.length, 3);
      assert.equal(objective.checkpoint.choices.length, 3);
      assert.ok(objective.checkpoint.choices[objective.checkpoint.answer]);
      assert.ok(objective.checkpoint.explanation.length > 30);
      assert.doesNotMatch(objective.description, /node scripts\/standalone-labctl.mjs verify/);
    }
    for (const [index, group] of lab.hints.entries()) {
      assert.ok(group.title.includes(lab.objectives[index].id));
      assert.equal(group.hints.length, 3);
    }
    assert.doesNotMatch(JSON.stringify(lab), /flagEnv|flags\.env|\.runtime|RLAB\{[a-f0-9]{32}\}/);
  }
});

const dockerStub = "data:text/javascript," + encodeURIComponent(`
  import childProcess from 'node:child_process';
  import { syncBuiltinESMExports } from 'node:module';
  import { EventEmitter } from 'node:events';
  import { PassThrough } from 'node:stream';
  const originalSpawn = childProcess.spawn;
  const originalSync = childProcess.spawnSync;
  childProcess.spawnSync = (command, ...args) => command === 'docker'
    ? { status: 0, stdout: '', stderr: '' } : originalSync(command, ...args);
  childProcess.spawn = (command, ...args) => {
    if (command !== 'docker') return originalSpawn(command, ...args);
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => {};
    process.nextTick(() => { child.stdout.end('toolbox\\ntriage-node\\n'); child.emit('exit', 0); });
    return child;
  };
  syncBuiltinESMExports();
`);

test("standalone HTTP API shares CLI state, rejects invalid proofs, and keeps mutations local", { timeout: 40000 }, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "cyberlab-portal-"));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.disconnect();
      await exited;
    }
    rmSync(directory, { recursive: true, force: true });
  });
  for (const name of ["server", "security", "runtime", "curriculum", "standalone"]) cpSync(new URL(`../controller/${name}.mjs`, import.meta.url), join(directory, "controller", `${name}.mjs`));
  for (const name of ["standalone-labctl", "standalone-curriculum"]) cpSync(new URL(`../scripts/${name}.mjs`, import.meta.url), join(directory, "scripts", `${name}.mjs`));
  cpSync(new URL("../data/labs.json", import.meta.url), join(directory, "data", "labs.json"));
  for (const lab of readLearningMaterial()) cpSync(new URL(`../standalone-labs/${lab.id}/lab.json`, import.meta.url), join(directory, "standalone-labs", lab.id, "lab.json"));
  const portProbe = createServer();
  portProbe.listen(0, "127.0.0.1"); await once(portProbe, "listening");
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  const env = { ...process.env, LAB_CONTROLLER_PORT: String(port), NODE_OPTIONS: `--import=${dockerStub}` };
  child = spawn(process.execPath, [join(directory, "controller", "server.mjs")], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let errors = "";
  child.stderr.on("data", (chunk) => { errors += chunk; });
  await Promise.race([once(child.stdout, "data"), once(child, "exit").then(() => { throw new Error(errors); })]);
  const base = `http://127.0.0.1:${port}`;
  const origin = "http://127.0.0.1:5173";
  assert.match(await (await fetch(base)).text(), /Open the lab workspace/);
  const sessionResponse = await fetch(`${base}/api/session`, { headers: { Origin: origin } });
  const session = await sessionResponse.json();
  const headers = { Origin: origin, Cookie: sessionResponse.headers.get("set-cookie").split(";")[0], "X-CSRF-Token": session.csrfToken, "Content-Type": "application/json" };
  const id = "01-network-triage";
  const path = `/api/standalone/${id}`;
  const post = (suffix, body = {}, customHeaders = headers) => fetch(`${base}${path}/${suffix}`, { method: "POST", headers: customHeaders, body: JSON.stringify(body) });
  await t.test("new tabs and reconnects reuse the shared cookie and CSRF token", async () => {
    const tabs = await Promise.all(Array.from({ length: 3 }, () => fetch(`${base}/api/session`, { headers: { Origin: origin, Cookie: headers.Cookie } })));
    for (const tab of tabs) {
      assert.equal(tab.status, 200);
      assert.equal(tab.headers.get("set-cookie").split(";")[0], headers.Cookie);
      assert.equal((await tab.json()).csrfToken, session.csrfToken);
    }
    // The first tab's token still authorizes the request; only its proof is invalid.
    assert.equal((await post("objectives/network-baseline/submit", { flag: "invalid" })).status, 422);
    assert.equal((await post("start", {}, { ...headers, "X-CSRF-Token": "wrong-token" })).status, 403);
    const unknown = await fetch(`${base}/api/session`, { headers: { Origin: origin, Cookie: "rlab_session=unknown" } });
    assert.notEqual(unknown.headers.get("set-cookie").split(";")[0], "rlab_session=unknown");
    assert.notEqual((await unknown.json()).csrfToken, session.csrfToken);
    assert.equal((await fetch(`${base}/api/session`, { headers: { Origin: "https://untrusted.example", Cookie: headers.Cookie } })).status, 403);
  });
  assert.equal((await post("start", {}, { Origin: origin })).status, 403);
  assert.equal((await post("start", {}, { ...headers, Origin: "https://untrusted.example" })).status, 403);
  assert.equal((await fetch(`${base}${path}/start`)).status, 405);
  assert.equal((await post("objectives/network-baseline/submit", { flag: "RLAB{not-started}" })).status, 422);
  assert.equal((await post("start")).status, 200);
  const runtime = join(directory, "standalone-labs", ".runtime", id);
  const flags = () => Object.fromEntries(readFileSync(join(runtime, "flags.env"), "utf8").trim().split("\n").map((line) => line.split("=")));
  const originalFlags = flags();
  assert.equal((await post("objectives/no-such-objective/submit", { flag: "x" })).status, 404);
  assert.equal((await post("objectives/network-baseline/submit", { flag: {} })).status, 422);
  assert.equal((await post("objectives/network-baseline/submit", { flag: "RLAB{wrong}" })).status, 422);
  const premature = await post("objectives/service-beacon/submit", { flag: originalFlags.FLAG_L01_SERVICE_BEACON });
  assert.equal(premature.status, 422); assert.match((await premature.json()).error, /dependencies/);
  const verified = await post("objectives/network-baseline/submit", { flag: originalFlags.FLAG_L01_NETWORK_BASELINE });
  assert.equal(verified.status, 200);
  assert.deepEqual((await verified.json()).progress.completedObjectives, ["network-baseline"]);
  const cli = spawnSync(process.execPath, [join(directory, "scripts", "standalone-labctl.mjs"), "verify", id, "service-beacon", originalFlags.FLAG_L01_SERVICE_BEACON], { env, encoding: "utf8", windowsHide: true });
  assert.equal(cli.status, 0, cli.stderr);
  const readProgress = async () => (await (await fetch(`${base}/api/standalone/progress`)).json())[id];
  assert.deepEqual((await readProgress()).completedObjectives, ["network-baseline", "service-beacon"]);
  for (const action of ["start", "stop", "start"]) assert.equal((await post(action)).status, 200);
  assert.deepEqual(flags(), originalFlags);
  assert.equal((await readProgress()).completedObjectives.length, 2);
  const responseText = await (await fetch(`${base}/api/standalone/progress`)).text();
  for (const flag of Object.values(originalFlags)) assert.ok(!responseText.includes(flag));
  assert.equal((await post("reset")).status, 200);
  assert.deepEqual((await readProgress()).completedObjectives, []);
  assert.notDeepEqual(flags(), originalFlags);
  assert.equal((await post("objectives/network-baseline/submit", { flag: originalFlags.FLAG_L01_NETWORK_BASELINE })).status, 422);
});
