import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAccountApi } from "../controller/account-api.mjs";
import { readLearningMaterial } from "../controller/learning-material.mjs";
import { loadLabs } from "../scripts/standalone-labctl.mjs";

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "reconlab-evidence-"));
  const labs = new Map(loadLabs().map(lab => [lab.id, lab]));
  const options = { networks: async () => [], docker: async () => "toolbox\ntraining-desk" };
  let api = createAccountApi(root, labs, ["http://127.0.0.1:5173"], options);
  t.after(async () => { await api.close(); rmSync(root, { recursive: true, force: true }); });
  const user = api.accounts.createUser("alice");
  api.accounts.changePassword(user.user.id, user.temporaryPassword, "new-long-password");
  const session = api.accounts.login("alice", "new-long-password");
  const lab = labs.get("05-linux-evidence");
  const run = await api.instances.create(user.user.id, lab);
  const path = `/api/standalone/${lab.id}/objectives/${lab.objectives[0].id}/evidence`;
  const headers = { cookie: `rlab_account=${session.sessionToken}`, origin: "http://127.0.0.1:5173", "x-csrf-token": session.csrfToken };
  return { get api() { return api; }, lab, run, user, headers, path,
    async reopen() { await api.close(); api = createAccountApi(root, labs, [headers.origin], options); },
    async request(method, body, overrides = {}, target = path) {
      let result;
      try {
        const handled = await api.route({ method, headers: { ...headers, ...overrides } }, new URL(target, headers.origin), async () => body ?? {}, (status, value) => { result = { status, value }; });
        return result ?? { status: handled === false ? 404 : 500 };
      } catch (error) { return { status: error.status ?? 500, value: { error: error.message } }; }
    }
  };
}
test("evidence rejects stale revisions and invalid or oversized fields without overwriting", async t => {
  const f = await fixture(t);
  const payload = { runId: f.run.id, revision: 0, responses: { finding: "original" } };
  assert.equal((await f.request("POST", payload)).status, 200);
  assert.equal((await f.request("POST", payload)).status, 409);
  for (const responses of [null, [], { finding: 7 }, { unknown: "x" }, { finding: "x".repeat(4001) }]) {
    assert.equal((await f.request("POST", { ...payload, revision: 1, responses })).status, 422);
  }
  assert.equal((await f.request("POST", { ...payload, revision: 1, responses: { finding: "x".repeat(4000) } })).status, 200);
  assert.equal((await f.request("POST", { ...payload, revision: 2, responses: {} })).status, 200);
});

test("evidence is account scoped, authenticated, CSRF protected and reset isolated", async t => {
  const f = await fixture(t);
  const payload = { runId: f.run.id, revision: 0, responses: { finding: "private" } };
  assert.equal((await f.request("GET", null, { cookie: "" })).status, 401);
  assert.equal((await f.request("POST", payload, { "x-csrf-token": "wrong" })).status, 403);
  assert.equal((await f.request("POST", payload, { origin: "https://untrusted.example" })).status, 403);
  assert.equal((await f.request("POST", payload, {}, f.path.replace(f.lab.objectives[0].id, "unknown"))).status, 404);
  const other = f.api.accounts.createUser("bobby");
  f.api.accounts.changePassword(other.user.id, other.temporaryPassword, "other-long-password");
  const login = f.api.accounts.login("bobby", "other-long-password");
  assert.equal((await f.request("GET", null, { cookie: `rlab_account=${login.sessionToken}` }, `${f.path}?runId=${f.run.id}`)).status, 409);
  assert.equal((await f.request("POST", payload)).status, 200);
  f.api.accounts.db.prepare("UPDATE instance_runs SET runtime='resetting' WHERE id=?").run(f.run.id);
  assert.equal((await f.request("POST", { ...payload, revision: 1 })).status, 409);
  f.api.accounts.db.prepare("UPDATE instance_runs SET runtime='stopped',archived=1 WHERE id=?").run(f.run.id);
  const fresh = await f.api.instances.create(f.user.user.id, f.lab);
  assert.equal((await f.request("POST", { ...payload, revision: 1 })).status, 409);
  assert.deepEqual((await f.request("GET", null, {}, `${f.path}?runId=${fresh.id}`)).value.responses, {});
  assert.equal(f.api.accounts.db.prepare("SELECT responses FROM evidence_reports WHERE run_id=?").get(f.run.id).responses, JSON.stringify(payload.responses));
});

test("selected investigative conclusions expose the complete formative evidence template", () => {
  const fields = ["findingPrompt", "evidencePrompt", "impactPrompt", "confidencePrompt", "remediationPrompt"];
  const material = new Map(readLearningMaterial().map((lab) => [lab.id, lab]));
  const objectives = {
    "05-linux-evidence": "final",
    "06-signals-capstone": "final",
    "07-web-breach-chain": "root-proof",
    "08-cipher-locker": "final",
    "09-content-discovery": "final",
    "10-message-recovery": "message",
    "11-jwt-validation": "remediation-proof",
  };
  for (const [labId, objectiveId] of Object.entries(objectives)) {
    const objective = material.get(labId).objectives.find((item) => item.id === objectiveId);
    for (const field of fields) assert.ok(objective[field]?.trim().length > 20, `${labId}/${objectiveId}/${field}`);
  }
});

const responses = { finding: "Read-only evidence supports an operational finding.", evidence: "case log, line 7", impact: "No execution demonstrated", confidence: "Medium: one artifact", remediation: "Preserve originals; hash working copies and compare." };

test("formative report round trips across controller reopen without changing flag/check progress", async t => {
  const f = await fixture(t);
  const saved = await f.request("POST", { runId: f.run.id, revision: 0, responses });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.value.responses, responses);
  assert.equal(saved.value.revision, 1);
  await f.reopen();
  const loaded = await f.request("GET", null, {}, `${f.path}?runId=${f.run.id}`);
  assert.equal(loaded.status, 200);
  assert.deepEqual(loaded.value.responses, responses);
  assert.deepEqual(f.api.instances.status(f.user.user.id, f.lab.id).checks, []);
  assert.deepEqual(f.api.instances.status(f.user.user.id, f.lab.id).completedObjectives, []);
  const objective = f.lab.objectives[0];
  f.api.instances.submit(f.user.user.id, f.lab.id, objective.id, JSON.parse(f.run.flags)[objective.flagEnv], false);
  assert.deepEqual(f.api.instances.status(f.user.user.id, f.lab.id).completedObjectives, [objective.id]);
});
