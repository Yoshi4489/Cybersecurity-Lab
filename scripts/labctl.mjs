import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = join(root, ".lab");
const pidsFile = join(stateDir, "pids.json");
const action = process.argv[2] ?? "status";

function isAlive(pid) {
  if (!Number.isInteger(pid)) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readPids() {
  if (!existsSync(pidsFile)) return {};
  try { return JSON.parse(readFileSync(pidsFile, "utf8")); } catch { return {}; }
}

function stopTree(pid) {
  if (!isAlive(pid)) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else {
    try { process.kill(-pid, "SIGTERM"); } catch { process.kill(pid, "SIGTERM"); }
  }
}

function startDetached(command, args, logName) {
  const log = openSync(join(stateDir, logName), "a");
  const child = spawn(command, args, {
    cwd: root,
    detached: true,
    windowsHide: true,
    shell: false,
    stdio: ["ignore", log, log],
    env: { ...process.env },
  });
  child.unref();
  closeSync(log);
  return child.pid;
}

if (action === "start") {
  mkdirSync(stateDir, { recursive: true });
  const current = readPids();
  const controller = isAlive(current.controller)
    ? current.controller
    : startDetached(process.execPath, [join(root, "controller", "server.mjs")], "controller.log");
  const portal = isAlive(current.portal)
    ? current.portal
    : startDetached(
        process.execPath,
        [join(root, "node_modules", "vinext", "dist", "cli.js"), "dev", "--hostname", "127.0.0.1", "--port", "5173"],
        "portal.log",
      );
  writeFileSync(pidsFile, JSON.stringify({ controller, portal, startedAt: new Date().toISOString() }, null, 2));
  console.log("RECON//LAB is starting locally.");
  console.log("Portal:     http://127.0.0.1:5173");
  console.log("Current curriculum starts at Lab 00. Legacy modules: http://127.0.0.1:5173/legacy");
  console.log("Controller API (not the portal): http://127.0.0.1:3030/health");
  console.log("Use Start / resume lab in the portal to build and launch the isolated targets.");
} else if (action === "stop") {
  const current = readPids();
  const accountFile = join(stateDir, "accounts.sqlite");
  if (existsSync(accountFile) && isAlive(current.controller)) {
    const { openAccounts } = await import("../controller/accounts.mjs");
    const accounts = openAccounts(accountFile);
    const admin = accounts.db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
    accounts.db.close();
    if (admin) {
      const response = await fetch(`http://127.0.0.1:${process.env.LAB_CONTROLLER_PORT ?? 3030}/api/maintenance`, { method: "POST", headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json", "X-Maintenance-Key": readFileSync(join(stateDir, "maintenance-key"), "utf8").trim() }, body: JSON.stringify({ userId: admin.id, action: "shutdown-instances" }) });
      if (!response.ok) throw new Error("Could not stop account instances. Keep the controller running and stop them from the admin area.");
    }
  }
  stopTree(current.portal);
  stopTree(current.controller);
  spawnSync("docker", ["compose", "-f", join(root, "docker-compose.yml"), "down", "--remove-orphans"], {
    cwd: root,
    windowsHide: true,
    stdio: "inherit",
    env: { ...process.env, COMPOSE_PROJECT_NAME: "reconlab" },
  });
  writeFileSync(pidsFile, JSON.stringify({ stoppedAt: new Date().toISOString() }, null, 2));
  console.log("RECON//LAB portal, controller, and legacy shared range are stopped.");
  console.log("Account instances were stopped through the controller when available. Pre-account CLI containers remain independent; stop them with: node scripts/standalone-labctl.mjs stop <lab-id>");
} else if (action === "status") {
  const current = readPids();
  console.log(`Portal: ${isAlive(current.portal) ? "running" : "stopped"}`);
  console.log(`Controller: ${isAlive(current.controller) ? "running" : "stopped"}`);
  console.log(`State directory: ${stateDir}`);
} else {
  console.error("Usage: node scripts/labctl.mjs <start|stop|status>");
  process.exitCode = 2;
}
