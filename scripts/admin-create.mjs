import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cpSync, existsSync } from "node:fs";
import { openAccounts } from "../controller/accounts.mjs";
import { createInstances, docker } from "../controller/instances.mjs";
import { loadLabs, readRun, composePrefix } from "./standalone-labctl.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const accounts = openAccounts(join(root, ".lab", "accounts.sqlite"));
try {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/.test(process.argv[2] ?? "")) throw new Error("Provide a username of 3–32 letters, digits, underscores or hyphens, starting with a letter or digit.");
  if (accounts.db.prepare("SELECT id FROM users WHERE role='admin'").get()) throw new Error("An administrator already exists. Use the admin area to create learners.");
  const labs = loadLabs();
  // Validate every old record before touching containers or creating the account.
  const runs = labs.map((lab) => ({ lab, run: readRun(lab) })).filter(({ run }) => run);
  const runtime = join(root, "standalone-labs", ".runtime");
  if (existsSync(runtime)) cpSync(runtime, join(root, ".lab", `runtime-backup-${Date.now()}`), { recursive: true });
  for (const { lab, run } of runs) await docker([...composePrefix(lab, run.paths.flags), "down", "--remove-orphans"]);
  const created = accounts.createUser(process.argv[2], "admin");
  const instances = createInstances(accounts, new Map(labs.map((lab) => [lab.id, lab])), root);
  try { for (const { lab, run } of runs) await instances.create(created.user.id, lab, run); }
  catch (error) {
    accounts.db.prepare("DELETE FROM instance_runs WHERE user_id=?").run(created.user.id);
    accounts.db.prepare("DELETE FROM users WHERE id=?").run(created.user.id);
    throw error;
  }
  console.log(`Administrator: ${created.user.username}\nOne-time password: ${created.temporaryPassword}\nSign in at http://127.0.0.1:5173 and change this password.\nImported ${runs.length} existing runs; original files and a backup are preserved.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { accounts.db.close(); }
