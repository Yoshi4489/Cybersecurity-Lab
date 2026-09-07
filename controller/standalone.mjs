import { spawn } from "node:child_process";
import { join } from "node:path";
import { composePrefix, dockerEnvironment, loadLabs, readRun, serviceNames, verifyRun } from "../scripts/standalone-labctl.mjs";

export const standaloneLabs = new Map(loadLabs().map((lab) => [lab.id, lab]));
const operations = new Map();

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, ...options });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-16000); });
    child.stderr.on("data", (chunk) => { errors = (errors + chunk).slice(-4000); });
    child.once("error", (error) => reject(new Error(`Cannot launch local tools: ${error.message}. Check Docker Desktop and run npm run doctor.`)));
    child.once("exit", (code) => code === 0 ? resolve(output) : reject(new Error(errors || "Lab operation failed; check Docker Desktop.")));
  });
}

export function standaloneProgress(lab) {
  const run = readRun(lab);
  return { runId: run?.progress.runId ?? null, completedObjectives: Object.keys(run?.progress.completed ?? {}) };
}

export async function standaloneStatus(lab) {
  const progress = standaloneProgress(lab);
  if (operations.has(lab.id)) return { ...progress, runtime: "busy" };
  const run = readRun(lab);
  if (!run) return { ...progress, runtime: "not-started" };
  try {
    const output = await execute("docker", [...composePrefix(lab, run.paths.flags), "ps", "--status", "running", "--services"], {
      env: dockerEnvironment(run.paths.flags), timeout: 15000,
    });
    const services = new Set(output.trim().split(/\s+/));
    return { ...progress, runtime: serviceNames(lab).every((name) => services.has(name)) ? "running" : "stopped" };
  } catch (error) { return { ...progress, runtime: "unavailable", error: error.message }; }
}

export async function standaloneAction(lab, action, root) {
  if (operations.has(lab.id)) throw new Error("A lab operation is already in progress. Wait, then refresh status.");
  if (!["start", "stop", "reset"].includes(action)) throw new Error("Unknown lab action");
  const operation = execute(process.execPath, [join(root, "scripts", "standalone-labctl.mjs"), action, lab.id], { cwd: root });
  operations.set(lab.id, operation);
  try { await operation; } finally { operations.delete(lab.id); }
  return standaloneStatus(lab);
}

export function submitStandalone(lab, objectiveId, flag) {
  if (operations.has(lab.id)) throw new Error("Wait for the current lab operation before submitting a flag.");
  verifyRun(lab, objectiveId, flag);
  return standaloneProgress(lab);
}
