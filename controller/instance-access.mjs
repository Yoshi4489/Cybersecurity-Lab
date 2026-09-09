import Docker from "dockerode";
import { WebSocketServer } from "ws";
import { createServer, request as httpRequest } from "node:http";
import { ApiError, token, digest } from "./accounts.mjs";
import { parseCookies, isLoopbackAddress, isAllowedHost } from "./security.mjs";

export function attachAccess(server, accounts, instances, labs, { origins, controllerPort, targetPort = 3031 }) {
  const docker = new Docker(process.platform === "win32" ? { socketPath: "//./pipe/docker_engine" } : { socketPath: process.env.DOCKER_HOST?.startsWith("unix://") ? process.env.DOCKER_HOST.slice(7) : "/var/run/docker.sock" });
  const sockets = new Map();
  const timers = new Set();
  let closed = false;
  const launches = new Map();
  const grants = new Map();
  const routes = new Map();
  const ws = new WebSocketServer({ noServer: true, maxPayload: 16384, handleProtocols: (protocols) => protocols.has("reconlab.terminal.v1") ? "reconlab.terminal.v1" : false });
  function live(runId, sessionHash) {
    if (closed || typeof runId !== "string" || typeof sessionHash !== "string") return false;
    const run = instances.byId(runId);
    const session = accounts.db.prepare(`SELECT s.user_id FROM account_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.hash=? AND s.expires_at>? AND u.disabled=0 AND u.must_change=0`).get(sessionHash, Date.now());
    return Boolean(run && !run.archived && run.runtime === "running" && run.expires_at > Date.now() && session?.user_id === run.user_id);
  }
  const revoke = (id) => {
    sockets.get(id)?.close(1000, "Instance stopped");
    for (const [key, value] of grants) if (value.runId === id) grants.delete(key);
    for (const [key, value] of launches) if (value.runId === id) launches.delete(key);
    for (const [key, value] of routes) if (value.runId === id) routes.delete(key);
  };
  instances.setRevoker(revoke);
  server.on("upgrade", (request, socket, head) => {
    const reject = () => { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); };
    try {
      if (!isLoopbackAddress(request.socket.remoteAddress) || !isAllowedHost(request.headers.host, String(controllerPort)) || !origins.includes(request.headers.origin)) return reject();
      const match = request.url?.match(/^\/api\/instances\/([a-f0-9]{24})\/terminal$/);
      const session = accounts.session(parseCookies(request.headers.cookie).rlab_account);
      if (!match || !session || !live(match[1], session.hash) || !request.headers["sec-websocket-protocol"]?.split(/,\s*/).includes("reconlab.terminal.v1")) return reject();
      if (sockets.has(match[1])) { socket.end("HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n"); return; }
      ws.handleUpgrade(request, socket, head, (client) => {
        sockets.set(match[1], client);
        void connect(client, match[1], session.hash);
      });
    } catch { reject(); }
  });
  async function connect(client, runId, sessionHash) {
    let stream;
    let terminal;
    const timer = setInterval(() => { if (!live(runId, sessionHash)) client.close(1000, "Session expired"); }, 1000);
    timers.add(timer);
    client.on("error", () => client.close());
    client.on("close", () => { clearInterval(timer); timers.delete(timer); stream?.destroy(); if (sockets.get(runId) === client) sockets.delete(runId); });
    client.on("message", async (data) => {
      try {
        if (!live(runId, sessionHash)) return client.close(1008, "Session expired");
        const message = JSON.parse(data.toString());
        if (message.type === "input" && typeof message.data === "string" && message.data.length <= 8192) stream?.write(message.data);
        else if (message.type === "resize" && Number.isInteger(message.cols) && Number.isInteger(message.rows) && message.cols >= 2 && message.cols <= 500 && message.rows >= 1 && message.rows <= 200) await terminal?.resize({ w: message.cols, h: message.rows });
        else client.close(1008, "Invalid terminal message");
      } catch { client.close(1008, "Invalid terminal message"); }
    });
    try {
      const containers = await docker.listContainers({ filters: JSON.stringify({ label: [`reconlab.run=${runId}`, "com.docker.compose.service=toolbox"] }) });
      if (containers.length !== 1 || !live(runId, sessionHash) || client.readyState !== 1) throw new Error("Toolbox is not ready.");
      terminal = await docker.getContainer(containers[0].Id).exec({ Cmd: ["tmux", "new-session", "-A", "-s", "lab"], User: "10001:10001", Tty: true, AttachStdin: true, AttachStdout: true, AttachStderr: true, Env: ["TERM=xterm-256color"] });
      stream = await terminal.start({ hijack: true, stdin: true });
      if (client.readyState !== 1) return stream.destroy();
      client.send(JSON.stringify({ type: "status", message: "Connected" }));
      stream.on("data", (data) => {
        if (client.bufferedAmount > 1024 * 1024) { stream.destroy(); return client.close(1009, "Terminal output exceeded buffer"); }
        if (client.readyState === 1) client.send(JSON.stringify({ type: "output", data: data.toString("base64") }));
      });
      stream.on("error", () => client.close(1011, "Terminal disconnected"));
      stream.on("end", () => client.close(1000, "Terminal ended"));
    } catch { client.close(1011, "Cannot open toolbox. Check Docker and resume the instance."); }
  }
  async function launch(session, runId, targetId) {
    if (!live(runId, session.hash)) throw new ApiError(403, "This instance is not available to your account.");
    const run = instances.byId(runId);
    const target = labs.get(run.lab_id).browserEntrypoints?.find((entry) => entry.id === targetId);
    if (!target) throw new ApiError(404, "Unknown target.");
    const output = await instances.command(run, ["port", `browser-${target.id}`, "8082"]);
    const match = output.match(/^127\.0\.0\.1:(\d+)$/);
    if (!match) throw new ApiError(503, "Target is not ready.");
    const hostname = `${token().slice(0, 48)}.localhost`;
    const ticket = token();
    routes.set(hostname, { runId, upstream: Number(match[1]) });
    launches.set(digest(ticket), { runId, sessionHash: session.hash, hostname, expires: Date.now() + 30000 });
    return { url: `http://${hostname}:${targetPort}/__launch?ticket=${ticket}` };
  }
  const gateway = createServer((request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const route = routes.get(url.hostname);
      const deny = () => { response.writeHead(403, { "Content-Type": "text/plain", "Cache-Control": "no-store" }); response.end("Open this target again from your signed-in lab workspace."); };
      if (!isLoopbackAddress(request.socket.remoteAddress) || url.port !== String(targetPort) || !route) return deny();
      if (url.pathname === "/__launch") {
        const key = digest(url.searchParams.get("ticket") ?? "");
        const pending = launches.get(key);
        launches.delete(key);
        if (!pending || pending.hostname !== url.hostname || pending.expires < Date.now() || !live(pending.runId, pending.sessionHash)) return deny();
        const grant = token();
        grants.set(digest(grant), pending);
        // Commit a document on the target origin before navigating. A cross-site
        // HTTP redirect chain would withhold the newly issued Strict cookie.
        const nonce = token();
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": `rlab_target=${grant}; HttpOnly; SameSite=Strict; Path=/`, "Referrer-Policy": "no-referrer", "Cache-Control": "no-store", "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'` });
        response.end(`<!doctype html><title>Opening your lab target</title><a href="/">Continue to your target</a><script nonce="${nonce}">location.replace('/')</script>`); return;
      }
      const grant = grants.get(digest(parseCookies(request.headers.cookie).rlab_target ?? ""));
      if (!grant || grant.hostname !== url.hostname || !live(grant.runId, grant.sessionHash)) return deny();
      const headers = { ...request.headers, host: `127.0.0.1:${route.upstream}` };
      delete headers.cookie; delete headers.authorization;
      const upstream = httpRequest({ hostname: "127.0.0.1", port: route.upstream, path: request.url, method: request.method, headers, timeout: 15000 }, (result) => {
        const safeHeaders = { ...result.headers, "Referrer-Policy": "no-referrer", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
        delete safeHeaders["set-cookie"];
        response.writeHead(result.statusCode ?? 502, safeHeaders); result.pipe(response);
      });
      upstream.on("timeout", () => upstream.destroy());
      upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end("Target unavailable. Resume the lab from the portal."); });
      request.on("aborted", () => upstream.destroy());
      request.pipe(upstream);
    } catch { response.writeHead(400); response.end("Invalid request"); }
  });
  gateway.listen(targetPort, "127.0.0.1");
  const cleanup = setInterval(() => {
    for (const [key, value] of launches) if (value.expires <= Date.now() || !live(value.runId, value.sessionHash)) launches.delete(key);
    for (const [key, value] of grants) if (!live(value.runId, value.sessionHash)) grants.delete(key);
    for (const [key, value] of routes) if (!instances.byId(value.runId) || instances.byId(value.runId).runtime !== "running") routes.delete(key);
  }, 10000);
  return { launch, revoke, close() { closed = true; clearInterval(cleanup); for (const timer of timers) clearInterval(timer); timers.clear(); for (const socket of sockets.values()) socket.terminate(); ws.close(); gateway.close(); } };
}
