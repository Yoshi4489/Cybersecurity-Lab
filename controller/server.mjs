import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createFlag, equalSecret, isAllowedHost, isAllowedOrigin, isLoopbackAddress, parseCookies } from "./security.mjs";

const controllerDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(controllerDir, "..");
const stateDir = join(root, ".lab");
const composeFile = join(root, "docker-compose.yml");
const flagsFile = join(stateDir, "flags.json");
const secretFile = join(stateDir, "secret");
const databaseFile = join(stateDir, "reconlab.sqlite");
const port = String(process.env.LAB_CONTROLLER_PORT ?? "3030");
const allowedOrigins = (process.env.LAB_ALLOWED_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173")
  .split(",").map((value) => value.trim()).filter(Boolean);
const sessions = new Map();
let runtimeState = "stopped";
let operation = Promise.resolve();

await mkdir(stateDir, { recursive: true });
const labs = JSON.parse(await readFile(join(root, "data", "labs.json"), "utf8"));
const labById = new Map(labs.map((lab) => [lab.id, lab]));
const db = new DatabaseSync(databaseFile);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS progress (
    lab_id TEXT PRIMARY KEY,
    completed_objectives TEXT NOT NULL DEFAULT '[]',
    unlocked_hints TEXT NOT NULL DEFAULT '[]',
    score INTEGER NOT NULL DEFAULT 100,
    solution_unlocked INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notes (
    lab_id TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    lab_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_lab_created ON events(lab_id, created_at);
  PRAGMA optimize;
`);

function json(response, status, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(body);
}

function corsHeaders(origin) {
  return origin && isAllowedOrigin(origin, allowedOrigins)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin" }
    : {};
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 64_000) throw new Error("request body too large");
  }
  return body ? JSON.parse(body) : {};
}

function runDocker(args, timeoutMs = 300_000) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("docker", ["compose", "-f", composeFile, ...args], {
      cwd: root,
      windowsHide: true,
      shell: false,
      env: { ...process.env, COMPOSE_PROJECT_NAME: "reconlab" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Docker operation timed out"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise(stdout.trim());
      else reject(new Error((stderr || stdout || `docker exited ${code}`).trim().slice(-1200)));
    });
  });
}

async function loadOrCreateSecret() {
  if (existsSync(secretFile)) return (await readFile(secretFile, "utf8")).trim();
  const secret = randomBytes(32).toString("hex");
  await writeFile(secretFile, secret, { encoding: "utf8", mode: 0o600 });
  return secret;
}

async function createRunProofs() {
  const secret = await loadOrCreateSecret();
  const runId = randomUUID();
  const proofs = {};
  for (const lab of labs) {
    for (const objective of lab.objectives) {
      proofs[objective.flagKey] = createFlag(secret, lab.id, objective.id, runId);
    }
  }
  await writeFile(flagsFile, JSON.stringify({ runId, createdAt: new Date().toISOString(), proofs }, null, 2));
  return { runId, proofs };
}

async function currentProofs() {
  if (!existsSync(flagsFile)) return createRunProofs();
  return JSON.parse(await readFile(flagsFile, "utf8"));
}

function progressFor(labId) {
  const row = db.prepare("SELECT * FROM progress WHERE lab_id = ?").get(labId);
  if (!row) return { completedObjectives: [], hints: [], score: 100, solutionUnlocked: false };
  return {
    completedObjectives: JSON.parse(row.completed_objectives),
    hints: JSON.parse(row.unlocked_hints),
    score: row.score,
    solutionUnlocked: Boolean(row.solution_unlocked),
  };
}

function saveProgress(labId, progress) {
  db.prepare(`
    INSERT INTO progress (lab_id, completed_objectives, unlocked_hints, score, solution_unlocked, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(lab_id) DO UPDATE SET
      completed_objectives = excluded.completed_objectives,
      unlocked_hints = excluded.unlocked_hints,
      score = excluded.score,
      solution_unlocked = excluded.solution_unlocked,
      updated_at = excluded.updated_at
  `).run(
    labId,
    JSON.stringify(progress.completedObjectives),
    JSON.stringify(progress.hints),
    progress.score,
    progress.solutionUnlocked ? 1 : 0,
    new Date().toISOString(),
  );
}

function recordEvent(labId, eventType, detail) {
  db.prepare("INSERT INTO events (lab_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)")
    .run(labId, eventType, detail, new Date().toISOString());
}

async function determineRuntime() {
  if (runtimeState === "starting" || runtimeState === "resetting") return runtimeState;
  try {
    const services = await runDocker(["ps", "--status", "running", "--services"], 15_000);
    runtimeState = services.split(/\r?\n/).filter(Boolean).length >= 3 ? "running" : "stopped";
  } catch { runtimeState = "stopped"; }
  return runtimeState;
}

async function mutateRuntime(action, labId) {
  operation = operation.catch(() => undefined).then(async () => {
    if (action === "start") {
      runtimeState = "starting";
      await currentProofs();
      await runDocker(["up", "-d", "--build", "gateway", "recon-node", "internal", "toolbox"]);
      runtimeState = "running";
    } else if (action === "stop") {
      await runDocker(["down", "--remove-orphans"]);
      runtimeState = "stopped";
    } else {
      runtimeState = "resetting";
      await runDocker(["down", "--volumes", "--remove-orphans"]);
      await createRunProofs();
      await runDocker(["up", "-d", "--build", "gateway", "recon-node", "internal", "toolbox"]);
      runtimeState = "running";
    }
    recordEvent(labId, `lab_${action}`, runtimeState);
  }).catch((error) => {
    runtimeState = "stopped";
    throw error;
  });
  return operation;
}

function authorizeMutation(request, response, cors) {
  const origin = request.headers.origin ?? "";
  if (!isAllowedOrigin(origin, allowedOrigins)) {
    json(response, 403, { error: "Origin is not allowed" }, cors);
    return false;
  }
  const sessionId = parseCookies(request.headers.cookie).rlab_session;
  const session = sessions.get(sessionId);
  if (!session || !equalSecret(request.headers["x-csrf-token"] ?? "", session.csrfToken)) {
    json(response, 403, { error: "Invalid session or CSRF token" }, cors);
    return false;
  }
  return true;
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin ?? "";
  const cors = corsHeaders(origin);
  if (!isLoopbackAddress(request.socket.remoteAddress) || !isAllowedHost(request.headers.host, port)) {
    json(response, 403, { error: "Controller is loopback-only" }, cors);
    return;
  }
  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin, allowedOrigins)) return json(response, 403, { error: "Origin is not allowed" });
    response.writeHead(204, { ...cors, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,X-CSRF-Token" });
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  try {
    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, { ok: true, runtime: await determineRuntime() }, cors);
    }
    if (request.method === "GET" && url.pathname === "/api/session") {
      if (origin && !isAllowedOrigin(origin, allowedOrigins)) return json(response, 403, { error: "Origin is not allowed" });
      const sessionId = randomBytes(24).toString("hex");
      const csrfToken = randomBytes(24).toString("hex");
      sessions.set(sessionId, { csrfToken, createdAt: Date.now() });
      return json(response, 200, { csrfToken, runtime: await determineRuntime() }, {
        ...cors,
        "Set-Cookie": `rlab_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,
      });
    }
    if (request.method === "GET" && url.pathname === "/api/progress") {
      const result = Object.fromEntries(labs.map((lab) => [lab.id, progressFor(lab.id)]));
      return json(response, 200, result, cors);
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/notes/")) {
      const labId = url.pathname.split("/").at(-1);
      if (!labById.has(labId)) return json(response, 404, { error: "Unknown lab" }, cors);
      const row = db.prepare("SELECT body FROM notes WHERE lab_id = ?").get(labId);
      return json(response, 200, { body: row?.body ?? "" }, cors);
    }

    if (request.method !== "POST") return json(response, 404, { error: "Not found" }, cors);
    if (!authorizeMutation(request, response, cors)) return;

    const lifecycleMatch = url.pathname.match(/^\/api\/labs\/([a-z0-9-]+)\/(start|stop|reset)$/);
    if (lifecycleMatch) {
      const [, labId, action] = lifecycleMatch;
      if (!labById.has(labId)) return json(response, 404, { error: "Unknown lab id" }, cors);
      await mutateRuntime(action, labId);
      return json(response, 200, { runtime: runtimeState, message: `${labId}: ${action} complete` }, cors);
    }

    const submitMatch = url.pathname.match(/^\/api\/labs\/([a-z0-9-]+)\/objectives\/([a-z0-9-]+)\/submit$/);
    if (submitMatch) {
      const [, labId, objectiveId] = submitMatch;
      const lab = labById.get(labId);
      const objective = lab?.objectives.find((item) => item.id === objectiveId);
      if (!objective) return json(response, 404, { error: "Unknown objective" }, cors);
      const body = await readJson(request);
      const run = await currentProofs();
      const expected = run.proofs[objective.flagKey];
      if (!equalSecret(body.flag ?? "", expected)) {
        recordEvent(labId, "flag_rejected", objectiveId);
        return json(response, 422, { correct: false, error: "Flag ยังไม่ถูกต้อง" }, cors);
      }
      const progress = progressFor(labId);
      if (!progress.completedObjectives.includes(objectiveId)) progress.completedObjectives.push(objectiveId);
      saveProgress(labId, progress);
      recordEvent(labId, "objective_complete", objectiveId);
      return json(response, 200, { correct: true, progress }, cors);
    }

    const hintMatch = url.pathname.match(/^\/api\/labs\/([a-z0-9-]+)\/hints\/([a-z0-9-]+)\/unlock$/);
    if (hintMatch) {
      const [, labId, hintId] = hintMatch;
      const lab = labById.get(labId);
      const hint = lab?.hints.find((item) => item.id === hintId);
      if (!hint) return json(response, 404, { error: "Unknown hint" }, cors);
      const progress = progressFor(labId);
      if (!progress.hints.includes(hintId)) {
        progress.hints.push(hintId);
        progress.score = Math.max(0, progress.score - hint.penalty);
        saveProgress(labId, progress);
        recordEvent(labId, "hint_unlocked", hintId);
      }
      return json(response, 200, { progress }, cors);
    }

    const solutionMatch = url.pathname.match(/^\/api\/labs\/([a-z0-9-]+)\/solution\/unlock$/);
    if (solutionMatch) {
      const labId = solutionMatch[1];
      if (!labById.has(labId)) return json(response, 404, { error: "Unknown lab" }, cors);
      const progress = progressFor(labId);
      if (!progress.solutionUnlocked) {
        progress.solutionUnlocked = true;
        progress.score = Math.min(progress.score, 25);
        saveProgress(labId, progress);
        recordEvent(labId, "solution_unlocked", "full");
      }
      return json(response, 200, { progress }, cors);
    }

    if (url.pathname === "/api/notes") {
      const body = await readJson(request);
      if (!labById.has(body.labId) || typeof body.body !== "string" || body.body.length > 20_000) {
        return json(response, 400, { error: "Invalid note" }, cors);
      }
      db.prepare(`INSERT INTO notes (lab_id, body, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(lab_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`)
        .run(body.labId, body.body, new Date().toISOString());
      return json(response, 200, { saved: true }, cors);
    }

    return json(response, 404, { error: "Not found" }, cors);
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : "Internal controller error" }, cors);
  }
});

server.listen(Number(port), "127.0.0.1", () => {
  console.log(`RECON//LAB controller: http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
