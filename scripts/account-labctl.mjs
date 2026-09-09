import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { openAccounts } from "../controller/accounts.mjs";
import { createInstances } from "../controller/instances.mjs";
import { loadLabs } from "./standalone-labctl.mjs";

export async function accountCli(root, args) {
  const accounts = openAccounts(join(root, ".lab", "accounts.sqlite"));
  try {
    const userIndex = args.indexOf("--user");
    const username = userIndex >= 0 ? args[userIndex + 1] : null;
    if (userIndex >= 0) args.splice(userIndex, 2);
    const user = username ? accounts.db.prepare("SELECT * FROM users WHERE username=?").get(username) : accounts.db.prepare("SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
    if (!user || user.disabled) throw new Error("Create the first administrator with npm run admin:create -- admin, or select an enabled --user.");
    const [action, labId, objective, flag, ...extra] = args;
    if (extra.length || (action !== "verify" && (objective || flag))) throw new Error("Unexpected arguments.");
    const labs = new Map(loadLabs().map((lab) => [lab.id, lab]));
    const instances = createInstances(accounts, labs, root);
    if (action === "list") { for (const lab of labs.values()) console.log(`${lab.id}  ${lab.title}`); return; }
    if (!labs.has(labId)) throw new Error("Unknown lab.");
    if (["start", "stop", "reset", "extend", "verify"].includes(action)) {
      // Lifecycle writes go through the controller so browser and CLI share one operation queue.
      const response = await fetch(`http://127.0.0.1:${process.env.LAB_CONTROLLER_PORT ?? 3030}/api/maintenance`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:5173", "X-Maintenance-Key": readFileSync(join(root, ".lab", "maintenance-key"), "utf8").trim() }, body: JSON.stringify({ userId: user.id, labId, action, objective, flag }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      // Maintainer scripts expect lifecycle completion before running their next command.
      const deadline = Date.now() + 10 * 60 * 1000;
      while (Date.now() < deadline) {
        const current = instances.status(user.id, labId);
        if (!["building", "starting", "stopping", "resetting"].includes(current.runtime)) {
          if (current.error) throw new Error(current.error);
          console.log(JSON.stringify(current, null, 2)); return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("Timed out waiting for the instance. Check its status in the portal; the controller will continue cleanup.");
    }
    const run = instances.get(user.id, labId);
    if (action === "status") { console.log(JSON.stringify(instances.status(user.id, labId), null, 2)); return; }
    if (!run) throw new Error("Start this lab in the portal first.");
    if (!["shell", "smoke"].includes(action)) throw new Error("Unknown action.");
    if (run.runtime !== "running" || run.expires_at <= Date.now()) throw new Error("Resume this lab in the portal first.");
    const directory = join(root, ".lab", "instances", run.id);
    const command = ["compose", "--env-file", join(directory, "flags.env"), "-f", join(directory, "compose.yml"), "-p", `reconlab-${run.id}`, "exec"];
    if (action === "smoke") command.push("-T", ...Object.entries(JSON.parse(run.flags)).flatMap(([name, value]) => ["-e", `${name}=${value}`]), "toolbox", "sh", "/opt/lab/smoke.sh");
    else command.push("toolbox", "bash", "-l");
    const result = spawnSync("docker", command, { stdio: "inherit", windowsHide: true });
    process.exitCode = result.status ?? 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { accounts.db.close(); }
}
