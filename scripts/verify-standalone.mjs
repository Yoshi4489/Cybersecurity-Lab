import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const labsRoot = join(root, "standalone-labs");
const ids = readdirSync(labsRoot).filter((id) => /^\d\d-[a-z0-9-]+$/.test(id)).sort();
const selected = process.argv.slice(2);
if (selected.some((id) => !ids.includes(id))) throw new Error("Use an existing lab ID");
const output = join(root, "outputs", "standalone-verification");
mkdirSync(output, { recursive: true });
const results = [];

for (const id of selected.length ? selected : ids) {
  const manifest = JSON.parse(readFileSync(join(labsRoot, id, "lab.json"), "utf8"));
  const runtime = join(labsRoot, ".runtime", id);
  const log = [];
  const check = (command, args, expected = 0) => {
    const result = spawnSync(command, args, {
      cwd: root, encoding: "utf8", windowsHide: true,
      timeout: 900_000, maxBuffer: 20 * 1024 * 1024,
    });
    log.push(result.stdout || "", result.stderr || "");
    if (result.error || result.status !== expected) {
      throw new Error(result.error?.message || `${command} ${args[0]} exited ${result.status}; expected ${expected}`);
    }
    return result.stdout;
  };
  const ctl = (action, extra = [], expected = 0) =>
    check(process.execPath, ["scripts/standalone-labctl.mjs", action, id, ...extra], expected);
  const flags = () => Object.fromEntries(readFileSync(join(runtime, "flags.env"), "utf8")
    .trim().split(/\r?\n/).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  const record = { id, passed: false };
  console.log(`Verifying ${id}: start, configuration, smoke, flags, reset, cleanup`);
  try {
    ctl("start");
    const prefix = ["compose", "--env-file", join(runtime, "flags.env"),
      "-f", join(labsRoot, id, "docker-compose.yml"), "-p", `cyberlab-${id}`];
    check("docker", [...prefix, "config", "--quiet"]);
    const toolboxEnv = check("docker", [...prefix, "exec", "-T", "toolbox", "env"]);
    const original = flags();
    for (const [key, value] of Object.entries(original)) {
      if (toolboxEnv.includes(key + "=") || toolboxEnv.includes(value)) throw new Error("Expected flag leaked into toolbox environment");
    }
    ctl("smoke");
    const first = manifest.objectives[0];
    const last = manifest.objectives.at(-1);
    ctl("verify", [last.id, original[last.flagEnv]], 1);
    ctl("verify", [first.id, "RLAB{invalid}"], 1);
    for (const objective of manifest.objectives) ctl("verify", [objective.id, original[objective.flagEnv]]);
    ctl("reset");
    const fresh = flags();
    if (Object.entries(original).some(([key, value]) => fresh[key] === value)) throw new Error("Reset did not rotate every flag");
    const progress = JSON.parse(readFileSync(join(runtime, "progress.json"), "utf8"));
    if (Object.keys(progress.completed).length) throw new Error("Reset retained objective progress");
    ctl("verify", [first.id, original[first.flagEnv]], 1);
    ctl("smoke");
    record.passed = true;
  } catch (error) {
    record.error = error.message;
    process.exitCode = 1;
  } finally {
    try { ctl("stop"); } catch (error) { record.passed = false; record.cleanupError = error.message; process.exitCode = 1; }
  }
  // Test flags are local synthetic values; keep all output in the ignored artifacts directory.
  writeFileSync(join(output, `${id}.log`), log.join("\n"));
  results.push(record);
  writeFileSync(join(output, "results.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(`${id}: ${record.passed ? "PASS" : "FAIL - " + record.error}; log: outputs/standalone-verification/${id}.log`);
}
