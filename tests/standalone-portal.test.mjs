import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { once } from "node:events";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readLearningMaterial } from "../controller/learning-material.mjs";
import { loadLabs, serviceNames } from "../scripts/standalone-labctl.mjs";
import { load as loadYaml } from "js-yaml";
import { createAccountApi } from "../controller/account-api.mjs";

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
  assert.equal(labs.length, loadLabs().length);
  for (const lab of labs) {
    assert.ok(lab.difficultyBand?.length > 3, `${lab.id} difficultyBand`);
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


test("account HTTP API enforces identity, CSRF, checks and per-user progress", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "reconlab-api-"));
  const origin = "http://127.0.0.1:5173";
  const api = createAccountApi(directory, new Map(loadLabs().map(lab => [lab.id, lab])), [origin], {
    networks: async () => [], docker: async () => "toolbox\ntraining-desk"
  });
  const server = createServer(async (request, response) => {
    const send = (status, value, headers = {}) => { response.writeHead(status, { "Content-Type": "application/json", ...headers }); response.end(JSON.stringify(value)); };
    try {
      await api.route(request, new URL(request.url, origin), async () => {
        let body = ""; for await (const chunk of request) body += chunk; return body ? JSON.parse(body) : {};
      }, send);
    } catch (error) { send(error.status ?? 500, { error: error.message }); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await api.close(); rmSync(directory, { recursive: true, force: true }); });
  const base = "http://127.0.0.1:" + server.address().port;
  const a = api.accounts.createUser("alice", "admin");
  const b = api.accounts.createUser("bob");
  const post = (path, body, headers = {}) => fetch(base + path, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body ?? {}) });
  assert.equal((await fetch(base + "/api/standalone/progress")).status, 401);
  async function signIn(created) {
    const login = await post("/api/auth/login", { username: created.user.username, password: created.temporaryPassword });
    const value = await login.json();
    const headers = { Cookie: login.headers.get("set-cookie").split(";")[0], "X-CSRF-Token": value.csrfToken };
    assert.equal((await post("/api/standalone/00-terminal-basics/start", {}, headers)).status, 403);
    assert.equal((await post("/api/auth/password", { currentPassword: created.temporaryPassword, newPassword: "new-long-password" }, headers)).status, 200);
    const second = await post("/api/auth/login", { username: created.user.username, password: "new-long-password" });
    const session = await second.json();
    return { Cookie: second.headers.get("set-cookie").split(";")[0], "X-CSRF-Token": session.csrfToken };
  }
  const first = await signIn(a); const second = await signIn(b);
  const path = "/api/standalone/00-terminal-basics";
  const snapshots = await Promise.all([1,2,3].map(() => fetch(base + "/api/session", { headers: first }).then(r => r.json())));
  assert.ok(snapshots.every(snapshot => snapshot.csrfToken === first["X-CSRF-Token"]));
  assert.equal((await post(path + "/start", {}, { ...first, "X-CSRF-Token": "wrong" })).status, 403);
  assert.equal((await post(path + "/start", {}, { ...first, Origin: "https://untrusted.example" })).status, 403);
  assert.equal((await post(path + "/start", {}, first)).status, 202); await api.instances.settle();
  assert.equal((await post(path + "/start", {}, second)).status, 202); await api.instances.settle();
  const run = api.instances.get(a.user.id, "00-terminal-basics");
  const proof = JSON.parse(run.flags).FLAG_L00_NOTE;
  assert.equal((await post(path + "/objectives/read-note/submit", { runId: run.id, flag: proof }, first)).status, 422);
  const answer = readLearningMaterial()[0].objectives[0].checkpoint.answer;
  assert.equal((await post(path + "/objectives/read-note/check", { runId: run.id, answer }, first)).status, 200);
  assert.equal((await post(path + "/objectives/read-note/submit", { runId: run.id, flag: proof }, first)).status, 200);
  assert.equal((await post(path + "/objectives/read-note/submit", { runId: run.id, flag: proof }, second)).status, 409);
  const progress = await (await fetch(base + "/api/standalone/progress", { headers: second })).json();
  assert.deepEqual(progress["00-terminal-basics"].completedObjectives, []);
  assert.equal(JSON.stringify(progress).includes(proof), false);
  assert.equal((await fetch(base + "/api/admin/users", { headers: second })).status, 403);
  assert.equal((await post("/api/auth/logout", {}, first)).status, 200);
  assert.equal((await fetch(base + "/api/standalone/progress", { headers: first })).status, 401);
});
