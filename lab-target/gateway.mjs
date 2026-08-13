import { createServer } from "node:http";
import { proof, readBody, sendJson, sendText } from "./proofs.mjs";

function html(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "X-Lab-Only": "RECON-LAB", ...headers });
  response.end(body);
}

function parseInput(raw, contentType = "") {
  if (contentType.includes("application/json")) return raw ? JSON.parse(raw) : {};
  return Object.fromEntries(new URLSearchParams(raw));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://gateway:8080");
  try {
    if (url.pathname === "/health") return sendJson(response, 200, { ok: true, service: "gateway" });
    if (url.pathname === "/") {
      return html(response, 200, `<!doctype html><html><head><title>Northstar Fulfillment</title><meta name="build-codename" content="ORANGE-FOLD"></head><body>
        <!-- training-build: ORANGE-FOLD | proof: ${proof("passive_metadata")} -->
        <h1>Northstar Fulfillment Portal</h1><p>Internal training tenant. All data is synthetic.</p>
        <nav><a href="/login">Login</a> · <a href="/search?q=status">Search</a> · <a href="/diagnostics">Diagnostics</a></nav>
      </body></html>`, { "X-Powered-By": "northstar-edge/0.8-lab" });
    }
    if (url.pathname === "/.well-known/security.txt") {
      return sendText(response, 200, `Contact: security@northstar.invalid\nPolicy: lab-only\nScope-Proof: ${proof("roe_scope")}\n`);
    }
    if (url.pathname === "/robots.txt") return sendText(response, 200, "User-agent: *\nDisallow: /backup/\nDisallow: /diagnostics\n");
    if (url.pathname === "/backup/config.old") return sendText(response, 200, `APP_ENV=training\nbackup_proof=${proof("content_backup")}\nDB_HOST=synthetic-db\n`);
    if (url.pathname === "/diagnostics") {
      return sendJson(response, 200, { service: "gateway", mode: "training", outbound: "blocked" }, { "X-Debug-Proof": proof("http_header"), "X-Framework": "northstar-node" });
    }
    if (url.pathname === "/login" && request.method === "GET") {
      return html(response, 200, `<form method="post"><input name="username"><input name="password" type="password"><button>Login</button></form>`);
    }
    if (url.pathname === "/login" && request.method === "POST") {
      const values = parseInput(await readBody(request), request.headers["content-type"]);
      const username = String(values.username ?? "");
      if (/['"]\s*or\s*['"]?1['"]?\s*=\s*['"]?1/i.test(username)) {
        return sendJson(response, 200, { authenticated: true, role: "lab-admin", proof: proof("sqli_login"), note: "simulated query; no database command was executed" });
      }
      if (username === "ops.admin") return sendJson(response, 401, { error: "Password incorrect for existing account", proof: proof("auth_enum") });
      return sendJson(response, 401, { error: "Account does not exist" });
    }
    if (url.pathname === "/api/users") {
      const id = url.searchParams.get("id") ?? "1";
      if (id === "2") return sendJson(response, 200, { id: 2, name: "Synthetic Operator", team: "fulfillment", proof: proof("idor_user") });
      if (id === "3" && url.searchParams.get("key") === "edge-map-72") return sendJson(response, 200, { id: 3, internalRoute: "/admin/capstone/final?artifact=user-3" });
      return sendJson(response, 200, { id: Number(id), name: "Current User", team: "training" });
    }
    if (url.pathname === "/exec") {
      const host = url.searchParams.get("host") ?? "";
      if (/[;&|]/.test(host)) return sendText(response, 200, `PING ${host.split(/[;&|]/)[0]}\nuid=10001(lab-simulator) gid=10001(lab-simulator)\nproof=${proof("cmd_injection")}\n# No operating-system command was executed.\n`);
      return sendText(response, 200, `PING ${host || "127.0.0.1"}\n64 bytes from simulated-host\n`);
    }
    if (url.pathname === "/search") {
      const query = url.searchParams.get("q") ?? "";
      const marker = /<script[\s>]/i.test(query) ? ` data-proof="${proof("xss_reflected")}"` : "";
      return html(response, 200, `<!doctype html><html><body${marker}><h1>Search</h1><div>Results for: ${query}</div><p>This page is intentionally vulnerable inside the isolated lab.</p></body></html>`);
    }
    if (url.pathname === "/transfer") {
      return sendJson(response, 200, { changed: true, to: url.searchParams.get("to"), amount: url.searchParams.get("amount"), proof: proof("csrf_transfer"), warning: "state-changing GET accepted without CSRF token" });
    }
    if (url.pathname === "/fetch") {
      const target = url.searchParams.get("url") ?? "";
      const allowed = /^http:\/\/internal:8081\/(admin\/proof|admin\/capstone\/final\?artifact=user-3)$/.test(target);
      if (!allowed) return sendJson(response, 400, { error: "Training fetcher only accepts the intentionally exposed internal lab routes" });
      const upstream = await fetch(target, { signal: AbortSignal.timeout(3000) });
      const body = await upstream.text();
      response.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") ?? "text/plain", "X-Lab-SSRF": "simulated-and-allowlisted" });
      return response.end(body);
    }
    if (url.pathname === "/files") {
      const name = url.searchParams.get("name") ?? "readme.txt";
      if (name.includes("..")) return sendText(response, 200, `# simulated /etc/lab-secrets\nproof=${proof("traversal_file")}\n`);
      return sendText(response, 200, "Only public training files are listed here.\n");
    }
    if (url.pathname === "/upload" && request.method === "POST") {
      const values = parseInput(await readBody(request), request.headers["content-type"]);
      const filename = String(values.filename ?? "");
      const contentType = String(values.content_type ?? "");
      if (filename.includes(".jpg") && !filename.endsWith(".jpg") && contentType === "image/jpeg") {
        return sendJson(response, 200, { accepted: true, stored: false, proof: proof("upload_bypass"), note: "simulation only; no file was written or executed" });
      }
      return sendJson(response, 422, { accepted: false, error: "extension rejected" });
    }
    if (url.pathname === "/api/profile" && request.method === "POST") {
      const values = parseInput(await readBody(request), request.headers["content-type"]);
      if (values.role === "admin" && values.token === "alg:none") return sendJson(response, 200, { role: "admin", proof: proof("jwt_mass") });
      return sendJson(response, 200, { role: "student" });
    }
    if (url.pathname === "/api/checkout" && request.method === "POST") {
      const values = parseInput(await readBody(request), request.headers["content-type"]);
      const quantity = Number(values.quantity ?? 1);
      const total = quantity * 19;
      return sendJson(response, 200, { sku: values.sku ?? "LAB-1", quantity, total, ...(total < 0 ? { proof: proof("logic_total") } : {}) });
    }
    if (url.pathname === "/capstone/brief") return sendJson(response, 200, { mission: "Find the route that the toolbox cannot reach directly.", firstHop: "recon-node:9090/capstone" });
    return sendJson(response, 404, { error: "route not found", service: "gateway" });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "target error" });
  }
});

server.listen(8080, "0.0.0.0", () => console.log("gateway listening on 8080"));
