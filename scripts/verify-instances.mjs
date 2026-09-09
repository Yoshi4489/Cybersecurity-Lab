import { mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { openAccounts } from "../controller/accounts.mjs";
import { createInstances } from "../controller/instances.mjs";
import { loadLabs } from "./standalone-labctl.mjs";
import assert from "node:assert/strict";

const project = fileURLToPath(new URL("../", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "reconlab-docker-check-"));
cpSync(join(project, "standalone-labs", "_shared"), join(root, "standalone-labs", "_shared"), { recursive: true });
const accounts = openAccounts(join(root, ".lab", "accounts.sqlite"));
const labs = loadLabs();
const instances = createInstances(accounts, new Map(labs.map((lab) => [lab.id, lab])), root);
const first = accounts.createUser("verify-one", "admin").user.id;
const second = accounts.createUser("verify-two").user.id;
async function smoke(run) {
  await instances.command(run, ["exec", "-T", ...Object.entries(JSON.parse(run.flags)).flatMap(([key, value]) => ["-e", `${key}=${value}`]), "toolbox", "sh", "/opt/lab/smoke.sh"]);
}
try {
  for (const lab of labs.filter((lab) => !process.argv[2] || lab.id >= process.argv[2])) {
    console.log(`Building and starting ${lab.id}`);
    await instances.action(first, lab.id, "start"); await instances.settle();
    let run = instances.get(first, lab.id);
    assert.equal(run.runtime, "running", run.error);
    await smoke(run);
    if (lab.id === "00-terminal-basics") {
      await instances.action(second, lab.id, "start"); await instances.settle();
      const other = instances.get(second, lab.id);
      assert.equal(other.runtime, "running", other.error);
      assert.notEqual(other.flags, run.flags); assert.notEqual(other.subnet, run.subnet);
      await smoke(other);
      const tmux = await instances.command(run, ["exec", "-T", "toolbox", "tmux", "-V"]);
      assert.match(tmux, /tmux/);
      await instances.stop(other, true);
    }
    const objective = lab.objectives[0];
    instances.submit(first, lab.id, objective.id, JSON.parse(run.flags)[objective.flagEnv], false);
    await instances.stop(run);
    await instances.action(first, lab.id, "start"); await instances.settle();
    assert.equal(instances.get(first, lab.id).flags, run.flags);
    assert.equal(instances.get(first, lab.id).runtime, "running", instances.get(first, lab.id).error);
    assert.ok(instances.status(first, lab.id).completedObjectives.includes(objective.id));
    await smoke(run);
    await instances.action(first, lab.id, "reset"); await instances.settle();
    const fresh = instances.get(first, lab.id);
    assert.equal(fresh.runtime, "running", fresh.error);
    assert.notEqual(fresh.id, run.id);
    assert.notEqual(fresh.flags, run.flags);
    await smoke(fresh);
    await instances.stop(fresh, true);
    console.log(`PASS ${lab.id}: smoke, flags, stop/resume, reset, cleanup`);
  }
} finally {
  await instances.settle();
  let clean = true;
  for (const run of accounts.db.prepare("SELECT * FROM instance_runs").all()) {
    try { await instances.command(run, ["down", "--volumes", "--remove-orphans"]); } catch { clean = false; }
  }
  accounts.db.close();
  if (clean && resolve(root).startsWith(resolve(tmpdir()) + sep)) rmSync(root, { recursive: true, force: true });
  else console.log(`Verification state retained for cleanup: ${root}`);
}
