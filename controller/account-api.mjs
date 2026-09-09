import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { ApiError, openAccounts, token } from "./accounts.mjs";
import { createInstances } from "./instances.mjs";
import { attachAccess } from "./instance-access.mjs";
import { parseCookies, equalSecret } from "./security.mjs";

export function createAccountApi(root, labs, origins, options = {}) {
  const accounts = openAccounts(join(root, ".lab", "accounts.sqlite"));
  const instances = createInstances(accounts, labs, root, options);
  const keyFile = join(root, ".lab", "maintenance-key");
  if (!existsSync(keyFile)) writeFileSync(keyFile, token(), { mode: 0o600, flag: "wx" });
  const maintenanceKey = readFileSync(keyFile, "utf8").trim();
  let access;
  let timer;
  const sessionFor = (request) => accounts.session(parseCookies(request.headers.cookie).rlab_account);
  async function route(request, url, body, send) {
    const path = url.pathname;
    const method = request.method;
    const session = sessionFor(request);
    if (path === "/api/session" && method === "GET") {
      return send(200, { user: session?.user ?? null, csrfToken: session?.csrfToken ?? "", setupRequired: !accounts.db.prepare("SELECT id FROM users LIMIT 1").get() });
    }
    if (method === "POST" && !origins.includes(request.headers.origin)) throw new ApiError(403, "Origin is not allowed.");
    if (path === "/api/maintenance" && method === "POST") {
      if (!equalSecret(request.headers["x-maintenance-key"] ?? "", maintenanceKey)) throw new ApiError(403, "Local maintenance key required.");
      const input = await body();
      const user = accounts.db.prepare("SELECT * FROM users WHERE id=? AND disabled=0").get(input.userId);
      if (!user) throw new ApiError(404, "Account not found.");
      if (input.action === "verify") return send(200, instances.submit(user.id, input.labId, input.objective, input.flag, false));
      if (input.action === "shutdown-instances") {
        await instances.settle();
        for (const run of instances.allActive()) await instances.stop(run);
        return send(200, { ok: true });
      }
      return send(202, await instances.action(user.id, input.labId, input.action));
    }
    if (path === "/api/auth/login" && method === "POST") {
      const input = await body();
      const result = accounts.login(input.username, input.password);
      return send(200, { user: result.user, csrfToken: result.csrfToken }, { "Set-Cookie": `rlab_account=${result.sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` });
    }
    if (!session) throw new ApiError(401, "Your session ended. Sign in to continue.");
    if (method === "POST" && !equalSecret(request.headers["x-csrf-token"] ?? "", session.csrfToken)) throw new ApiError(403, "Session verification failed. Refresh and try again.");
    if (path === "/api/auth/logout" && method === "POST") {
      accounts.db.prepare("DELETE FROM account_sessions WHERE hash=?").run(session.hash);
      return send(200, { ok: true }, { "Set-Cookie": "rlab_account=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
    }
    if (path === "/api/auth/password" && method === "POST") {
      const input = await body();
      accounts.changePassword(session.user.id, input.currentPassword, input.newPassword);
      return send(200, { ok: true }, { "Set-Cookie": "rlab_account=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
    }
    if (session.user.mustChangePassword) throw new ApiError(403, "Change your temporary password first.");
    if (path.startsWith("/api/admin/")) {
      if (session.user.role !== "admin") throw new ApiError(403, "Administrator access required.");
      if (path === "/api/admin/users") {
        if (method === "GET") return send(200, accounts.db.prepare("SELECT * FROM users ORDER BY id").all().map(accounts.publicUser));
        if (method === "POST") { const input = await body(); return send(201, accounts.createUser(input.username)); }
      }
      const userMatch = path.match(/^\/api\/admin\/users\/(\d+)\/(disable|enable|reset-password)$/);
      if (userMatch && method === "POST") {
        const id = Number(userMatch[1]);
        const user = accounts.db.prepare("SELECT * FROM users WHERE id=?").get(id);
        if (!user) throw new ApiError(404, "Account not found.");
        if (user.role === "admin") throw new ApiError(422, "Use account settings to change the administrator password.");
        if (userMatch[2] === "reset-password") return send(200, accounts.resetPassword(id));
        const disabled = userMatch[2] === "disable";
        accounts.db.prepare("UPDATE users SET disabled=? WHERE id=?").run(Number(disabled), id);
        accounts.db.prepare("DELETE FROM account_sessions WHERE user_id=?").run(id);
        if (disabled) for (const run of instances.allActive().filter((run) => run.user_id === id)) {
          // In-flight starts recheck account status before becoming available.
          if (!instances.operations.has(run.id)) await instances.action(id, run.lab_id, "stop");
        }
        accounts.event(session.user.id, `account_${disabled ? "disabled" : "enabled"}:${id}`);
        return send(200, { ok: true });
      }
      if (path === "/api/admin/instances" && method === "GET") return send(200, {
        capacity: instances.maxActive, active: instances.allActive().map((run) => ({ ...instances.status(run.user_id, run.lab_id), labId: run.lab_id, username: accounts.db.prepare("SELECT username FROM users WHERE id=?").get(run.user_id).username })) });
      const stopMatch = path.match(/^\/api\/admin\/instances\/([a-f0-9]{24})\/stop$/);
      if (stopMatch && method === "POST") {
        const run = instances.byId(stopMatch[1]);
        if (!run || run.archived) throw new ApiError(404, "Instance not found.");
        return send(202, await instances.action(run.user_id, run.lab_id, "stop"));
      }
      throw new ApiError(404, "Admin route not found.");
    }
    if (path === "/api/standalone/progress" && method === "GET") return send(200, Object.fromEntries([...labs.keys()].map((id) => [id, instances.status(session.user.id, id)])));
    const match = path.match(/^\/api\/standalone\/([a-z0-9-]+)\/(status|start|stop|reset|extend|objectives\/([a-z0-9-]+)\/(submit|check)|targets\/([a-z0-9-]+)\/launch)$/);
    if (match) {
      const [, labId, action, objectiveId, objectiveAction, targetId] = match;
      if (!labs.has(labId)) throw new ApiError(404, "Unknown lab.");
      if (action === "status" && method === "GET") return send(200, instances.status(session.user.id, labId));
      if (method !== "POST" || action === "status") throw new ApiError(405, "Method not allowed.");
      const input = await body();
      if (objectiveId) {
        if (input.runId !== instances.get(session.user.id, labId)?.id) throw new ApiError(409, "The run changed. Refresh before submitting.");
        if (objectiveAction === "check") return send(200, instances.check(session.user.id, labId, objectiveId, input.answer, input.runId));
        return send(200, { correct: true, progress: instances.submit(session.user.id, labId, objectiveId, input.flag) });
      }
      if (targetId) return send(200, await access.launch(session, instances.get(session.user.id, labId)?.id, targetId));
      return send(202, await instances.action(session.user.id, labId, action));
    }
    if (path === "/api/checkpoints/import" && method === "POST") {
      const first = accounts.db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
      if (session.user.id !== first?.id) throw new ApiError(403, "Only the original owner can import browser progress.");
      if (!accounts.db.prepare("SELECT value FROM account_meta WHERE key='browser_import'").get()) {
        const input = await body();
        if (!Array.isArray(input.keys) || input.keys.length > 200) throw new ApiError(422, "Invalid checkpoint import.");
        for (const key of input.keys) {
          if (typeof key !== "string") continue;
          const [labId, runId, objective] = key.split("/");
          const run = instances.get(session.user.id, labId);
          if (run?.id !== runId || !labs.get(labId)?.objectives.some((item) => item.id === objective)) continue;
          accounts.db.prepare("UPDATE instance_runs SET checks=? WHERE id=?").run(JSON.stringify([...new Set([...JSON.parse(run.checks), objective])]), run.id);
        }
        accounts.db.prepare("INSERT INTO account_meta VALUES('browser_import','done')").run();
      }
      return send(200, { ok: true });
    }
    // The historical shared range remains the original owner's local tool.
    if (session.user.role !== "admin") throw new ApiError(403, "Legacy modules are available to the local administrator.");
    return false;
  }
  return { accounts, instances, sessionFor, route,
    attach(server, port) {
      access = attachAccess(server, accounts, instances, labs, { origins, controllerPort: port, targetPort: Number(process.env.LAB_TARGET_PORT ?? 3031) });
      void instances.reconcile(); timer = setInterval(() => void instances.reconcile(), 10000);
    },
    async close() { clearInterval(timer); access?.close(); await instances.settle(); accounts.db.close(); }
  };
}
