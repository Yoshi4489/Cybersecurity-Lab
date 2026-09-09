import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { openAccounts } from "../controller/accounts.mjs";
import { loadLabs } from "../scripts/standalone-labctl.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const labIds = loadLabs().map((lab) => lab.id);

function fixture(t, accountMode = true) {
  // Stay below the repository for dependency resolution, never copy live runtime state.
  const directory = mkdtempSync(join(root, "tests", ".cli-entrypoint-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const name of ["scripts", "controller"]) {
    cpSync(join(root, name), join(directory, name), { recursive: true });
  }
  for (const id of labIds) {
    mkdirSync(join(directory, "standalone-labs", id), { recursive: true });
    cpSync(join(root, "standalone-labs", id, "lab.json"), join(directory, "standalone-labs", id, "lab.json"));
  }
  if (accountMode) {
    const accounts = openAccounts(join(directory, ".lab", "accounts.sqlite"));
    try { accounts.createUser("fixture-admin", "admin"); }
    finally { accounts.db.close(); }
  }
  return directory;
}

function run(directory, args) {
  return spawnSync(process.execPath, [join(directory, "scripts", "standalone-labctl.mjs"), ...args], {
    cwd: directory, encoding: "utf8", shell: false, windowsHide: true, timeout: 10000,
  });
}

test("account-backed CLI rejects malformed arguments with usage exit code 2", (t) => {
  const directory = fixture(t);
  for (const args of [
    ["status", "../docker-compose.yml"],
    ["status", "--project-directory"],
    ["status", "01-network-triage;whoami"],
    ["status", labIds[0], "--project-name", "attacker"],
  ]) {
    const result = run(directory, args);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2, `${JSON.stringify(args)}: ${result.stderr}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Unknown lab|too many arguments/u);
  }
});

test("account-backed CLI list completes and lists exactly the discovered labs", (t) => {
  const directory = fixture(t);
  const result = run(directory, ["list"]);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /unsettled top-level await/u);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/u).map((line) => line.split(/\s+/u)[0]), labIds);
  assert.deepEqual(readdirSync(join(directory, ".lab")).filter((name) => !name.startsWith("accounts.sqlite")), []);
});
