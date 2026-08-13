import { spawnSync } from "node:child_process";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const labsRoot = join(root, "standalone-labs");
const runtimeRoot = join(labsRoot, ".runtime");
const allowedActions = new Set([
  "list",
  "start",
  "stop",
  "reset",
  "status",
  "verify",
  "smoke",
  "shell",
]);
const idPattern = /^[a-z0-9](?:[a-z0-9-]{0,47}[a-z0-9])?$/;
const envPattern = /^[A-Z][A-Z0-9_]{1,63}$/;

function usage(message) {
  if (message) console.error(message);
  console.error(
    "Usage: node scripts/standalone-labctl.mjs <list|start|stop|reset|status|verify|smoke|shell> [lab-id] [objective-id] [flag]",
  );
  process.exitCode = 2;
}

function fail(message, code = 1) {
  console.error(message);
  process.exitCode = code;
  return false;
}

function loadLabs() {
  if (!existsSync(labsRoot)) return [];
  const labs = [];
  for (const entry of readdirSync(labsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "_shared") continue;
    const directory = join(labsRoot, entry.name);
    const manifestPath = join(directory, "lab.json");
    if (!existsSync(manifestPath)) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
      throw new Error(`Cannot read ${manifestPath}: ${error.message}`);
    }
    if (!idPattern.test(manifest.id) || manifest.id !== entry.name) {
      throw new Error(`Unsafe or mismatched lab id in ${manifestPath}`);
    }
    const composeName = manifest.composeFile ?? "docker-compose.yml";
    if (composeName !== "docker-compose.yml") {
      throw new Error(`Unsupported composeFile in ${manifestPath}`);
    }
    if (!Array.isArray(manifest.objectives) || manifest.objectives.length === 0) {
      throw new Error(`No objectives in ${manifestPath}`);
    }
    for (const objective of manifest.objectives) {
      if (!idPattern.test(objective.id) || !envPattern.test(objective.flagEnv)) {
        throw new Error(`Unsafe objective id or flagEnv in ${manifestPath}`);
      }
    }
    labs.push({
      ...manifest,
      directory,
      manifestPath,
      composePath: join(directory, composeName),
      toolboxService: "toolbox",
    });
  }
  labs.sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(labs.map((lab) => lab.id)).size !== labs.length) {
    throw new Error("Duplicate standalone lab id");
  }
  return labs;
}

function selectLab(labs, id) {
  if (!id || !idPattern.test(id)) {
    usage("A safe lab-id is required.");
    return undefined;
  }
  const lab = labs.find((candidate) => candidate.id === id);
  if (!lab) {
    fail(`Unknown lab: ${id}`, 2);
    return undefined;
  }
  return lab;
}

function runtimePaths(lab) {
  const directory = join(runtimeRoot, lab.id);
  return {
    directory,
    flags: join(directory, "flags.env"),
    progress: join(directory, "progress.json"),
  };
}

function atomicWrite(path, content, mode) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temporary, content, { encoding: "utf8", mode });
  renameSync(temporary, path);
  if (process.platform !== "win32") chmodSync(path, mode);
}

function createRun(lab) {
  const paths = runtimePaths(lab);
  const secret = randomBytes(32);
  const runId = randomBytes(12).toString("hex");
  const values = Object.fromEntries(
    lab.objectives.map((objective) => {
      const digest = createHmac("sha256", secret)
        .update(`${lab.id}\0${runId}\0${objective.id}\0${objective.flagEnv}`)
        .digest("hex")
        .slice(0, 32);
      return [objective.flagEnv, `RLAB{${digest}}`];
    }),
  );
  const env = `${Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n")}\n`;
  const progress = {
    version: 1,
    labId: lab.id,
    runId,
    startedAt: new Date().toISOString(),
    completed: {},
  };
  atomicWrite(paths.flags, env, 0o600);
  atomicWrite(paths.progress, `${JSON.stringify(progress, null, 2)}\n`, 0o600);
  return { paths, values, progress };
}

function parseFlags(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    if (!line) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`Malformed flags file: ${path}`);
    const name = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!envPattern.test(name) || !/^RLAB\{[a-f0-9]{32}\}$/u.test(value)) {
      throw new Error(`Unsafe flag entry in ${path}`);
    }
    values[name] = value;
  }
  return values;
}

function readRun(lab) {
  const paths = runtimePaths(lab);
  if (!existsSync(paths.flags) || !existsSync(paths.progress)) return undefined;
  const values = parseFlags(paths.flags);
  const progress = JSON.parse(readFileSync(paths.progress, "utf8"));
  if (progress.labId !== lab.id || typeof progress.completed !== "object") {
    throw new Error(`Runtime state does not belong to ${lab.id}`);
  }
  for (const objective of lab.objectives) {
    if (!values[objective.flagEnv]) throw new Error(`Missing ${objective.flagEnv} in runtime state`);
  }
  return { paths, values, progress };
}

function composePrefix(lab, flagsPath) {
  return [
    "compose",
    "--env-file",
    flagsPath,
    "-f",
    lab.composePath,
    "-p",
    `cyberlab-${lab.id}`,
  ];
}

function docker(lab, flagsPath, args, options = {}) {
  const result = spawnSync("docker", [...composePrefix(lab, flagsPath), ...args], {
    cwd: lab.directory,
    env: { ...process.env },
    shell: false,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true,
    encoding: options.capture ? "utf8" : undefined,
  });
  if (result.error) {
    fail(`Docker Compose could not run: ${result.error.message}`);
    return undefined;
  }
  if (result.status !== 0) {
    if (options.capture && result.stderr) console.error(result.stderr.trim());
    fail(`Docker Compose exited with status ${result.status}.`);
    return undefined;
  }
  return result;
}

function constantTimeEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function printProgress(lab, progress) {
  const complete = Object.keys(progress.completed).length;
  console.log(`Progress: ${complete}/${lab.objectives.length} objectives complete`);
  for (const objective of lab.objectives) {
    const mark = progress.completed[objective.id] ? "x" : " ";
    console.log(`  [${mark}] ${objective.id} - ${objective.title ?? objective.label}`);
  }
}

let labs;
try {
  labs = loadLabs();
} catch (error) {
  fail(error.message);
}

if (labs) {
  const [action = "", labId, objectiveId, suppliedFlag, ...extra] = process.argv.slice(2);
  if (!allowedActions.has(action) || extra.length > 0) {
    usage(action ? `Unknown action or too many arguments: ${action}` : undefined);
  } else if (action === "list") {
    if (labId || objectiveId || suppliedFlag) usage("list does not accept additional arguments.");
    else {
      console.log("Standalone labs:");
      for (const lab of labs) console.log(`  ${lab.id.padEnd(26)} ${lab.title}`);
    }
  } else {
    const lab = selectLab(labs, labId);
    if (lab && action === "start") {
      if (objectiveId || suppliedFlag) usage("start accepts only a lab-id.");
      else {
        const run = createRun(lab);
        if (docker(lab, run.paths.flags, ["up", "-d", "--build", "--wait", "--remove-orphans"])) {
          console.log(`Started ${lab.id} with a fresh set of per-run flags.`);
          console.log(`Open a shell: node scripts/standalone-labctl.mjs shell ${lab.id}`);
        }
      }
    } else if (lab && action === "stop") {
      if (objectiveId || suppliedFlag) usage("stop accepts only a lab-id.");
      else {
        const run = readRun(lab);
        if (!run) console.log(`${lab.id} has no local runtime state.`);
        else if (docker(lab, run.paths.flags, ["down", "--remove-orphans"])) console.log(`Stopped ${lab.id}.`);
      }
    } else if (lab && action === "reset") {
      if (objectiveId || suppliedFlag) usage("reset accepts only a lab-id.");
      else {
        const previous = readRun(lab);
        if (previous && !docker(lab, previous.paths.flags, ["down", "--remove-orphans", "--volumes"])) {
          // docker() already reported the failure.
        } else {
          const run = createRun(lab);
          if (docker(lab, run.paths.flags, ["up", "-d", "--build", "--wait", "--remove-orphans"])) {
            console.log(`Reset ${lab.id}; flags and objective progress were rotated.`);
          }
        }
      }
    } else if (lab && action === "status") {
      if (objectiveId || suppliedFlag) usage("status accepts only a lab-id.");
      else {
        const run = readRun(lab);
        if (!run) console.log(`${lab.id}: not started`);
        else {
          console.log(`${lab.id}: run ${run.progress.runId}`);
          printProgress(lab, run.progress);
          docker(lab, run.paths.flags, ["ps"]);
        }
      }
    } else if (lab && action === "verify") {
      if (!objectiveId || suppliedFlag === undefined) usage("verify requires a lab-id, objective-id, and flag.");
      else {
        const objective = lab.objectives.find((candidate) => candidate.id === objectiveId);
        if (!objective) fail(`Unknown objective for ${lab.id}: ${objectiveId}`, 2);
        else {
          const run = readRun(lab);
          if (!run) fail(`Start ${lab.id} before verifying objectives.`);
          else {
            const dependencies = objective.dependsOn ?? [];
            const missing = dependencies.filter((dependency) => !run.progress.completed[dependency]);
            if (missing.length > 0) fail(`Complete dependencies first: ${missing.join(", ")}`);
            else if (!constantTimeEqual(suppliedFlag, run.values[objective.flagEnv])) fail("Flag is not valid for this run.");
            else {
              run.progress.completed[objective.id] ??= { verifiedAt: new Date().toISOString() };
              atomicWrite(run.paths.progress, `${JSON.stringify(run.progress, null, 2)}\n`, 0o600);
              console.log(`Verified ${lab.id}/${objective.id}.`);
              printProgress(lab, run.progress);
            }
          }
        }
      }
    } else if (lab && action === "smoke") {
      if (objectiveId || suppliedFlag) usage("smoke accepts only a lab-id.");
      else {
        const run = readRun(lab);
        if (!run) fail(`Start ${lab.id} before running its smoke test.`);
        else {
          const injected = Object.entries(run.values).flatMap(([name, value]) => ["-e", `${name}=${value}`]);
          if (docker(lab, run.paths.flags, ["exec", "-T", ...injected, lab.toolboxService, "sh", "/opt/lab/smoke.sh"])) {
            console.log(`Smoke test passed for ${lab.id}.`);
          }
        }
      }
    } else if (lab && action === "shell") {
      if (objectiveId || suppliedFlag) usage("shell accepts only a lab-id.");
      else {
        const run = readRun(lab);
        if (!run) fail(`Start ${lab.id} before opening its toolbox.`);
        else docker(lab, run.paths.flags, ["exec", lab.toolboxService, "bash", "-l"]);
      }
    }
  }
}
