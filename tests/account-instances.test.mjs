import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openAccounts } from "../controller/accounts.mjs";
import { allocateSubnet, createInstances } from "../controller/instances.mjs";
import { loadLabs } from "../scripts/standalone-labctl.mjs";
import { load } from "js-yaml";

function fixture(t, execute) {
  const root = mkdtempSync(join(tmpdir(), "reconlab-instances-"));
  const accounts = openAccounts(join(root, "accounts.sqlite"));
  const calls = [];
  const instances = createInstances(accounts, new Map(loadLabs().map((lab) => [lab.id, lab])), root, { networks: async () => [], docker: async (args) => { calls.push(args); return execute ? execute(args) : "toolbox\ntraining-desk"; } });
  t.after(() => { accounts.db.close(); rmSync(root, { recursive: true, force: true }); });
  const a = accounts.createUser("alice", "admin"); const b = accounts.createUser("bob");
  return { root, accounts, instances, calls, a, b };
}
test("accounts hash passwords, require change, preserve sessions, and revoke after password changes", (t) => {
  const { accounts, a } = fixture(t);
  assert.equal(a.user.mustChangePassword, true);
  assert.notEqual(accounts.db.prepare("SELECT password_hash FROM users WHERE id=?").get(a.user.id).password_hash, a.temporaryPassword);
  const session = accounts.login("ALICE", a.temporaryPassword);
  assert.equal(accounts.session(session.sessionToken).csrfToken, session.csrfToken);
  assert.equal(accounts.session(session.sessionToken).csrfToken, session.csrfToken);
  accounts.changePassword(a.user.id, a.temporaryPassword, "new-long-password");
  assert.equal(accounts.session(session.sessionToken), null);
  assert.equal(accounts.login("alice", "new-long-password").user.mustChangePassword, false);
  assert.throws(() => accounts.changePassword(a.user.id, "new-long-password", "short"), /12 and 256/);
});
test("login attempts are bounded and disabled accounts cannot authenticate", (t) => {
  const { accounts, b } = fixture(t);
  for (let n = 0; n < 5; n++) assert.throws(() => accounts.login("missing", "wrong"), /incorrect/);
  assert.throws(() => accounts.login("missing", "wrong"), /Too many/);
  const session = accounts.login("bob", b.temporaryPassword);
  accounts.db.prepare("UPDATE users SET disabled=1 WHERE id=?").run(b.user.id);
  assert.equal(accounts.session(session.sessionToken), null);
  assert.throws(() => accounts.login("bob", b.temporaryPassword), /incorrect/);
});
test("subnet allocation excludes host routes, other instances and invalid pools", () => {
  assert.equal(allocateSubnet("10.240.0.0/16", ["10.240.0.0/24", "10.240.1.0/24"]), "10.240.2.0/24");
  assert.throws(() => allocateSubnet("10.240.0.0/24", ["10.240.0.0/16"]), /No free/);
  assert.throws(() => allocateSubnet("8.8.0.0/16", []), /private/);
});
test("two users can run the same lab with distinct flags, projects, subnets and progress", async (t) => {
  const { accounts, instances, a, b, calls } = fixture(t);
  const lab = "00-terminal-basics";
  await Promise.all([instances.action(a.user.id, lab, "start"), instances.action(b.user.id, lab, "start")]); await instances.settle();
  const first = instances.get(a.user.id, lab); const second = instances.get(b.user.id, lab);
  assert.notEqual(first.id, second.id); assert.notEqual(first.subnet, second.subnet); assert.notEqual(first.flags, second.flags);
  assert.equal(instances.status(a.user.id, lab).runtime, "running");
  assert.ok(calls.some((args) => args.includes(`reconlab-${first.id}`)));
  const answer = JSON.parse(readFileSync(new URL("../standalone-labs/00-terminal-basics/tasks.json", import.meta.url), "utf8"))["read-note"].checkpoint.answer;
  assert.throws(() => instances.submit(a.user.id, lab, "read-note", JSON.parse(first.flags).FLAG_L00_NOTE), /check first/);
  instances.check(a.user.id, lab, "read-note", answer, first.id);
  assert.throws(() => instances.submit(a.user.id, lab, "read-note", JSON.parse(second.flags).FLAG_L00_NOTE), /not valid/);
  instances.submit(a.user.id, lab, "read-note", JSON.parse(first.flags).FLAG_L00_NOTE);
  assert.deepEqual(instances.status(a.user.id, lab).completedObjectives, ["read-note"]);
  assert.deepEqual(instances.status(b.user.id, lab).completedObjectives, []);
  await assert.rejects(instances.action(a.user.id, "01-network-triage", "start"), /Stop your active/);
  const c = accounts.createUser("charlie");
  await assert.rejects(instances.action(c.user.id, lab, "start"), /capacity/);
});
test("lease extends once, expires, resumes with progress and resets only the selected run", async (t) => {
  const { instances, accounts, a } = fixture(t); const lab = "00-terminal-basics";
  await instances.action(a.user.id, lab, "start"); await instances.settle();
  const old = instances.get(a.user.id, lab);
  instances.submit(a.user.id, lab, "read-note", JSON.parse(old.flags).FLAG_L00_NOTE, false);
  await instances.action(a.user.id, lab, "extend");
  assert.equal(instances.get(a.user.id, lab).expires_at, old.expires_at + 1800000);
  await assert.rejects(instances.action(a.user.id, lab, "extend"), /cannot be extended/);
  accounts.db.prepare("UPDATE instance_runs SET expires_at=0 WHERE id=?").run(old.id);
  await instances.reconcile(); assert.equal(instances.get(a.user.id, lab).runtime, "stopped");
  await instances.action(a.user.id, lab, "start"); await instances.settle();
  assert.equal(instances.get(a.user.id, lab).flags, old.flags);
  assert.deepEqual(instances.status(a.user.id, lab).completedObjectives, ["read-note"]);
  await instances.action(a.user.id, lab, "reset"); await instances.settle();
  const fresh = instances.get(a.user.id, lab);
  assert.notEqual(fresh.id, old.id); assert.notEqual(fresh.flags, old.flags); assert.equal(fresh.runtime, "running");
  assert.deepEqual(instances.status(a.user.id, lab).completedObjectives, []);
  assert.throws(() => instances.check(a.user.id, lab, "read-note", 0, old.id), /run changed/);
});
test("generated definitions preserve containment and replace fixed addresses for every current lab", async (t) => {
  const { root, instances, a } = fixture(t);
  for (const lab of loadLabs()) {
    const run = await instances.create(a.user.id, lab);
    const compose = load(readFileSync(join(root, ".lab", "instances", run.id, "compose.yml"), "utf8"));
    assert.ok(Object.entries(compose.networks).every(([name, network]) => name.startsWith("browser-") || network.internal));
    for (const [name, service] of Object.entries(compose.services)) {
      if (!name.startsWith("browser-")) assert.ok(Object.keys(service.networks).every((network) => compose.networks[network].internal));
      assert.deepEqual(service.cap_drop, ["ALL"]);
      assert.ok(service.security_opt.includes("no-new-privileges:true"));
      assert.equal(service.labels["reconlab.run"], run.id);
      assert.ok(service.ports.every((port) => port.host_ip === "127.0.0.1"));
    }
    assert.ok(!JSON.stringify(compose).includes(lab.subnet));
  }
});

test("disabling an account during startup tears down its instance", async (t) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { accounts, instances, a, calls } = fixture(t, async (args) => { if (args.includes("up")) await gate; return ""; });
  await instances.action(a.user.id, "00-terminal-basics", "start");
  accounts.db.prepare("UPDATE users SET disabled=1 WHERE id=?").run(a.user.id);
  release(); await instances.settle();
  assert.equal(instances.status(a.user.id, "00-terminal-basics").runtime, "stopped");
  assert.ok(calls.some((args) => args.includes("down")));
  await assert.rejects(instances.action(a.user.id, "00-terminal-basics", "start"), /disabled/);
});

test("failed reset startup leaves only the fresh run stopped with an actionable error", async (t) => {
  let fail = false;
  const { instances, a } = fixture(t, async (args) => { if (fail && args.includes("up")) throw new Error("test build failure"); return "toolbox\ntraining-desk"; });
  const lab = "00-terminal-basics";
  await instances.action(a.user.id, lab, "start"); await instances.settle();
  const old = instances.get(a.user.id, lab);
  fail = true;
  await instances.action(a.user.id, lab, "reset"); await instances.settle();
  assert.equal(instances.byId(old.id).archived, 1);
  assert.equal(instances.byId(old.id).runtime, "stopped");
  const fresh = instances.get(a.user.id, lab);
  assert.notEqual(fresh.id, old.id);
  assert.equal(fresh.runtime, "stopped");
  assert.match(fresh.error, /startup failed/);
  assert.equal(instances.allActive().length, 0);
});

test("a stale Docker reconciliation read cannot stop a reset generation", async (t) => {
  let release, observed;
  const gate = new Promise((resolve) => { release = resolve; });
  const read = new Promise((resolve) => { observed = resolve; });
  const { instances, a } = fixture(t, async (args) => { if (args.includes("ps")) { observed(); await gate; return ""; } return "toolbox\ntraining-desk"; });
  const lab = "00-terminal-basics";
  await instances.action(a.user.id, lab, "start"); await instances.settle();
  const old = instances.get(a.user.id, lab);
  const reconciliation = instances.reconcile(); await read;
  await instances.action(a.user.id, lab, "reset");
  await Promise.all([...instances.operations.values()]);
  release(); await reconciliation; await instances.settle();
  assert.notEqual(instances.get(a.user.id, lab).id, old.id);
  assert.equal(instances.get(a.user.id, lab).runtime, "running");
  assert.equal(instances.byId(old.id).runtime, "stopped");
});

test("migration preserves the original run id, flags and objective progress", async (t) => {
  const { instances, a } = fixture(t);
  const lab = loadLabs()[0];
  const imported = { progress: { runId: "a".repeat(24), completed: { "read-note": { verifiedAt: "2026-09-01T00:00:00.000Z" } } }, values: Object.fromEntries(lab.objectives.map((objective) => [objective.flagEnv, `RLAB{${"b".repeat(32)}}`])) };
  const run = await instances.create(a.user.id, lab, imported);
  assert.equal(run.id, imported.progress.runId);
  assert.deepEqual(JSON.parse(run.flags), imported.values);
  assert.deepEqual(JSON.parse(run.completed), imported.progress.completed);
  assert.equal(run.runtime, "stopped");
});
