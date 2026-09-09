import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { load, dump } from "js-yaml";
import { ApiError, digest } from "./accounts.mjs";
import { equalSecret } from "./security.mjs";
import { parseCidr, cidrsOverlap, extractWindowsRouteCidrs, extractLinuxRouteCidrs } from "../scripts/doctor.mjs";

const exec = promisify(execFile);
export async function docker(args, options = {}) {
  const { stdout } = await exec("docker", args, { windowsHide: true, timeout: 300000, maxBuffer: 4 * 1024 * 1024, ...options });
  return stdout.trim();
}
export const activeStates = ["building", "starting", "running", "stopping", "resetting"];
const prefix = (subnet) => subnet.split(".").slice(0, 3).join(".") + ".";
const address = (value) => [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");
export function allocateSubnet(pool, excluded) {
  const range = parseCidr(pool);
  if (!range || range.prefix < 16 || range.prefix > 24 || !["10.", "172.", "192.168."].some((p) => pool.startsWith(p)) ||
      (pool.startsWith("172.") && (Number(pool.split(".")[1]) < 16 || Number(pool.split(".")[1]) > 31))) throw new ApiError(422, "LAB_INSTANCE_POOL_CIDR must be a private IPv4 /16 through /24.");
  for (let start = range.start; start <= range.end; start += 256) {
    const candidate = `${address(start)}/24`;
    if (!excluded.some((item) => cidrsOverlap(candidate, item))) return candidate;
  }
  throw new ApiError(409, "No free instance subnet. Configure LAB_INSTANCE_POOL_CIDR and run npm run doctor.");
}
export async function occupiedNetworks() {
  const ids = (await docker(["network", "ls", "-q"])).split(/\s+/).filter(Boolean);
  const networks = ids.length ? JSON.parse(await docker(["network", "inspect", ...ids])) : [];
  const routes = process.platform === "win32"
    ? extractWindowsRouteCidrs((await exec("route", ["print", "-4"], { windowsHide: true })).stdout)
    : extractLinuxRouteCidrs((await exec("ip", ["-o", "-4", "route", "show"])).stdout);
  return [...routes, ...networks.flatMap((network) => network.IPAM?.Config?.map((item) => item.Subnet) ?? []).filter(Boolean)];
}
export function materialize(root, lab, run) {
  const directory = join(root, ".lab", "instances", run.id);
  const source = join(directory, "source");
  mkdirSync(directory, { recursive: true });
  if (!existsSync(source)) {
    cpSync(lab.directory, source, { recursive: true });
    const rewrite = (folder) => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) rewrite(path);
        else if (!readFileSync(path).includes(0)) {
          const oldReverse = lab.subnet.split(".").slice(0, 3).reverse().join(".") + ".in-addr.arpa";
          const newReverse = run.subnet.split(".").slice(0, 3).reverse().join(".") + ".in-addr.arpa";
          writeFileSync(path, readFileSync(path, "utf8").split(prefix(lab.subnet)).join(prefix(run.subnet)).split(oldReverse).join(newReverse));
        }
      }
    };
    rewrite(source);
  }
  const compose = load(readFileSync(join(source, "docker-compose.yml"), "utf8"));
  delete compose.name;
  for (const [name, service] of Object.entries(compose.services)) {
    if (name === "toolbox") service.build = { context: join(root, "standalone-labs", "_shared", "toolbox").replaceAll("\\", "/") };
    else service.build.context = resolve(source, service.build.context).replaceAll("\\", "/");
    // Content-specific tags allow Compose to reuse builds across resumes and users.
    service.image = `reconlab-instance-${lab.id}-${name}:${name === "toolbox" ? "terminal-v1" : digest(run.subnet).slice(0, 12)}`;
    service.labels = { "reconlab.managed": "true", "reconlab.owner": String(run.user_id), "reconlab.run": run.id, "reconlab.lab": lab.id };
    if (service.volumes) service.volumes = service.volumes.map((volume) => volume.startsWith("./") ? resolve(source, volume.slice(0, volume.indexOf(":"))).replaceAll("\\", "/") + volume.slice(volume.indexOf(":")) : volume);
    // No unvalidated service port is published. Browser entrypoints are opt-in.
    service.ports = [];
  }
  for (const target of lab.browserEntrypoints ?? []) {
    const network = Object.keys(compose.services[target.service].networks)[0];
    const ingress = `browser-${target.id}`;
    compose.networks[ingress] = {};
    compose.services[ingress] = {
      build: { context: join(root, "standalone-labs", "_shared", "browser-ingress").replaceAll("\\", "/") },
      image: "reconlab-browser-ingress:local-v1",
      environment: { TARGET_HOST: target.service, TARGET_PORT: String(target.containerPort) },
      networks: { [network]: {}, [ingress]: {} },
      ports: [{ target: 8082, host_ip: "127.0.0.1", protocol: "tcp" }],
      cap_drop: ["ALL"], security_opt: ["no-new-privileges:true"], read_only: true,
      pids_limit: 32, mem_limit: "64m", cpus: "0.25",
      depends_on: { [target.service]: { condition: "service_healthy" } },
      labels: { "reconlab.managed": "true", "reconlab.owner": String(run.user_id), "reconlab.run": run.id, "reconlab.lab": lab.id },
    };
  }
  const scope = [`Run: ${run.id}`, `Subnet: ${run.subnet}`, "Authorized services:", ...Object.entries(compose.services).filter(([name]) => !name.startsWith("browser-")).map(([name, service]) => `${name}: ${Object.values(service.networks).map((network) => network.ipv4_address).join(", ")}`)].join("\n");
  writeFileSync(join(directory, "scope.txt"), scope + "\n");
  compose.services.toolbox.volumes ??= [];
  compose.services.toolbox.volumes.push(join(directory, "scope.txt").replaceAll("\\", "/") + ":/opt/cyberlab/instance-scope.txt:ro");
  writeFileSync(join(directory, "compose.yml"), dump(compose, { noRefs: true }));
  writeFileSync(join(directory, "flags.env"), Object.entries(JSON.parse(run.flags)).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
  return directory;
}

export function createInstances(accounts, labs, root, options = {}) {
  const { db, event } = accounts;
  const execute = options.docker ?? docker;
  const networks = options.networks ?? occupiedNetworks;
  const maxActive = Number(process.env.LAB_MAX_ACTIVE_INSTANCES ?? 2);
  if (!Number.isInteger(maxActive) || maxActive < 1 || maxActive > 32) throw new Error("LAB_MAX_ACTIVE_INSTANCES must be 1–32");
  const operations = new Map();
  let queue = Promise.resolve();
  let revoke = () => {};
  const get = (user, lab) => db.prepare("SELECT * FROM instance_runs WHERE user_id=? AND lab_id=? AND archived=0").get(user, lab);
  const byId = (id) => db.prepare("SELECT * FROM instance_runs WHERE id=?").get(id);
  const allActive = () => db.prepare("SELECT * FROM instance_runs WHERE runtime IN ('building','starting','running','stopping','resetting')").all();
  function command(run, args) {
    const directory = join(root, ".lab", "instances", run.id);
    return execute(["compose", "--env-file", join(directory, "flags.env"), "-f", join(directory, "compose.yml"), "-p", `reconlab-${run.id}`, ...args],
      { env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !Object.hasOwn(JSON.parse(run.flags), key))) });
  }
  async function create(user, lab, imported) {
    const excluded = [...(await networks()), ...db.prepare("SELECT subnet FROM instance_runs").all().map((row) => row.subnet)];
    const subnet = allocateSubnet(process.env.LAB_INSTANCE_POOL_CIDR ?? "10.240.0.0/16", excluded);
    const id = imported?.progress.runId ?? randomBytes(12).toString("hex");
    if (!/^[a-f0-9]{24}$/.test(id)) throw new Error("Invalid imported run id");
    const flags = imported?.values ?? Object.fromEntries(lab.objectives.map((objective) => [objective.flagEnv, `RLAB{${randomBytes(16).toString("hex")}}`]));
    db.prepare("INSERT INTO instance_runs(id,user_id,lab_id,subnet,flags,completed,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(id, user, lab.id, subnet, JSON.stringify(flags), JSON.stringify(imported?.progress.completed ?? {}), Date.now());
    materialize(root, lab, byId(id));
    return byId(id);
  }
  function status(user, labId) {
    const run = get(user, labId);
    return run ? { runId: run.id, instanceId: run.id, completedObjectives: Object.keys(JSON.parse(run.completed)), checks: JSON.parse(run.checks),
      runtime: run.runtime, expiresAt: run.expires_at, canExtend: run.runtime === "running" && !run.extended && run.expires_at > Date.now(),
      terminalAvailable: run.runtime === "running" && run.expires_at > Date.now(), subnet: run.subnet,
      targets: (labs.get(labId).browserEntrypoints ?? []).map(({ id, label }) => ({ id, label })),
      error: run.error, operationMessage: operations.has(run.id) ? `${run.runtime} instance` : null }
      : { runId: null, instanceId: null, completedObjectives: [], checks: [], runtime: "not-started", targets: [] };
  }
  function setState(id, state, error = null) { db.prepare("UPDATE instance_runs SET runtime=?,error=? WHERE id=?").run(state, error, id); }
  function launch(run, work) {
    const task = work().catch(async () => {
      if (byId(run.id)?.archived) return;
      // Failed teardown keeps the capacity reservation until reconciliation can prove cleanup.
      try { await command(run, ["down", "--remove-orphans"]); setState(run.id, "stopped", "Instance operation failed. Check Docker, then resume."); }
      catch { setState(run.id, "stopping", "Docker is unavailable. Cleanup will retry automatically."); }
    }).finally(() => operations.delete(run.id));
    operations.set(run.id, task);
  }
  async function stop(run, volumes = false) {
    revoke(run.id);
    setState(run.id, "stopping");
    await command(run, ["down", "--remove-orphans", ...(volumes ? ["--volumes"] : [])]);
    db.prepare("UPDATE instance_runs SET runtime='stopped',expires_at=NULL,error=NULL WHERE id=?").run(run.id);
    event(run.user_id, "instance_stopped", run.id);
  }
  function action(user, labId, actionName) {
    const request = queue.catch(() => {}).then(async () => {
      const lab = labs.get(labId);
      if (!lab) throw new ApiError(404, "Unknown lab.");
      if (actionName !== "stop" && db.prepare("SELECT disabled FROM users WHERE id=?").get(user)?.disabled !== 0) throw new ApiError(403, "This account is disabled.");
      let run = get(user, labId);
      if (run && operations.has(run.id)) throw new ApiError(409, "An instance operation is already in progress.");
      if (actionName === "extend") {
        if (!run || run.runtime !== "running" || run.extended || run.expires_at <= Date.now()) throw new ApiError(409, "This lease cannot be extended.");
        db.prepare("UPDATE instance_runs SET expires_at=expires_at+1800000,extended=1 WHERE id=?").run(run.id);
        event(user, "instance_extended", run.id);
      } else if (actionName === "stop") {
        if (run) { setState(run.id, "stopping"); launch(run, () => stop(run)); }
      } else if (["start", "reset"].includes(actionName)) {
        if (actionName === "start" && run?.runtime === "running") return status(user, labId);
        const active = allActive().filter((row) => row.id !== run?.id);
        if (active.some((row) => row.user_id === user)) throw new ApiError(409, "Stop your active lab before starting another.");
        if (active.length >= maxActive) throw new ApiError(409, "Host capacity is full. Stop an instance or try later.");
        if (!run) run = await create(user, lab);
        const existing = run;
        setState(run.id, actionName === "reset" ? "resetting" : "building");
        launch(run, async () => {
          if (actionName === "reset") {
            await stop(existing, true);
            // Keep the same unique address allocation, with a new generation and fresh flags.
            const freshId = randomBytes(12).toString("hex");
            db.exec("BEGIN IMMEDIATE");
            try {
              db.prepare("UPDATE instance_runs SET archived=1,subnet=? WHERE id=?").run(`archived:${existing.id}`, existing.id);
              db.prepare("INSERT INTO instance_runs(id,user_id,lab_id,subnet,flags,created_at,runtime) VALUES(?,?,?,?,?,?,'building')")
                .run(freshId, user, labId, existing.subnet, JSON.stringify(Object.fromEntries(lab.objectives.map((o) => [o.flagEnv, `RLAB{${randomBytes(16).toString("hex")}}`]))), Date.now());
              db.exec("COMMIT");
            } catch (error) { db.exec("ROLLBACK"); throw error; }
            run = byId(freshId);
            operations.set(run.id, operations.get(existing.id));
          }
          try {
            materialize(root, lab, run);
            await command(run, ["up", "-d", "--build", "--wait", "--wait-timeout", "120"]);
            if (db.prepare("SELECT disabled FROM users WHERE id=?").get(user)?.disabled !== 0) { await stop(run); return; }
            db.prepare("UPDATE instance_runs SET runtime='running',expires_at=?,extended=0,error=NULL WHERE id=?").run(Date.now() + 3600000, run.id);
            event(user, "instance_started", run.id);
          } catch (error) {
            console.error(`Instance startup failed (${labId}): ${String(error.stderr || error.message).replace(/RLAB\{[^}]*\}/g, "[redacted flag]").slice(-6000)}`);
            try { await stop(run); setState(run.id, "stopped", "Instance startup failed. Check Docker, then resume."); } catch { setState(run.id, "stopping", "Cleanup pending; Docker is unavailable."); }
            throw error;
          } finally { if (run.id !== existing.id) operations.delete(run.id); }
        });
      } else throw new ApiError(404, "Unknown lifecycle action.");
      return status(user, labId);
    });
    queue = request.catch(() => {});
    return request;
  }
  function submit(user, labId, objectiveId, supplied, requireCheck = true) {
    const run = get(user, labId);
    const objective = labs.get(labId)?.objectives.find((o) => o.id === objectiveId);
    if (!objective) throw new ApiError(404, "Unknown objective.");
    if (!run) throw new ApiError(422, "Start this lab first.");
    if (operations.has(run.id)) throw new ApiError(409, "Wait for the instance operation to finish.");
    const completed = JSON.parse(run.completed);
    if ((objective.dependsOn ?? []).some((id) => !completed[id])) throw new ApiError(422, "Complete dependencies first.");
    if (requireCheck && !JSON.parse(run.checks).includes(objectiveId)) throw new ApiError(422, "Pass the understanding check first.");
    if (typeof supplied !== "string" || supplied.length > 200 || !equalSecret(supplied.trim(), JSON.parse(run.flags)[objective.flagEnv])) throw new ApiError(422, "Flag is not valid for this run.");
    completed[objectiveId] ??= { verifiedAt: new Date().toISOString() };
    db.prepare("UPDATE instance_runs SET completed=? WHERE id=?").run(JSON.stringify(completed), run.id);
    event(user, "objective_verified", run.id);
    return status(user, labId);
  }
  function check(user, labId, objectiveId, answer, runId) {
    const run = get(user, labId);
    if (!run || run.id !== runId || operations.has(run.id)) throw new ApiError(409, "The run changed. Refresh and try again.");
    const task = JSON.parse(readFileSync(join(labs.get(labId).directory, "tasks.json"), "utf8"))[objectiveId];
    if (!task) throw new ApiError(404, "Unknown objective.");
    const correct = answer === task.checkpoint.answer;
    if (correct) db.prepare("UPDATE instance_runs SET checks=? WHERE id=?").run(JSON.stringify([...new Set([...JSON.parse(run.checks), objectiveId])]), run.id);
    return { correct, explanation: task.checkpoint.explanation, progress: status(user, labId) };
  }
  let reconciliation = null;
  function reconcile() {
    if (reconciliation) return reconciliation;
    reconciliation = reconcileRuns().finally(() => { reconciliation = null; });
    return reconciliation;
  }
  async function reconcileRuns() {
    try {
      for (const run of allActive()) {
        if (operations.has(run.id)) continue;
        try {
          if (run.runtime !== "running" || !run.expires_at || run.expires_at <= Date.now()) {
            launch(run, () => stop(run)); await operations.get(run.id);
          }
          else {
            const names = new Set((await command(run, ["ps", "--status", "running", "--services"])).split(/\s+/));
            // The Docker read can finish after a foreground reset/stop/start.
            const current = byId(run.id);
            if (operations.has(run.id) || current.archived || current.runtime !== "running") continue;
            const compose = load(readFileSync(join(root, ".lab", "instances", run.id, "compose.yml"), "utf8"));
            if (!Object.keys(compose.services).every((name) => names.has(name))) { launch(run, () => stop(run)); await operations.get(run.id); }
          }
        } catch {
          if (!operations.has(run.id) && !byId(run.id)?.archived && byId(run.id)?.runtime === run.runtime) {
            setState(run.id, "stopping", "Docker unavailable; cleanup will retry."); revoke(run.id);
          }
        }
      }
    } catch { /* Leave durable reservations intact for the next reconciliation. */ }
  }
  return { get, byId, allActive, command, create, status, action, submit, check, reconcile, stop, operations, maxActive,
    setRevoker(fn) { revoke = fn; }, async settle() { await queue; await reconciliation; await Promise.allSettled([...operations.values()]); } };
}
