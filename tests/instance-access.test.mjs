import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openAccounts } from "../controller/accounts.mjs";
import { attachAccess } from "../controller/instance-access.mjs";

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers }, (response) => {
      let body = "";
      response.setEncoding("utf8"); response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, headers: new Headers(response.headers), text: async () => body }));
      response.on("error", reject);
    });
    request.on("error", reject); request.end();
  });
}

test("target tickets are single-use, grants are host-bound, and session revocation denies access", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "reconlab-access-test-"));
  const accounts = openAccounts(join(root, "accounts.sqlite"));
  const created = accounts.createUser("target-test", "admin");
  accounts.changePassword(created.user.id, created.temporaryPassword, "target-test-password");
  const loggedIn = accounts.login("target-test", "target-test-password");
  const session = accounts.session(loggedIn.sessionToken);
  const upstream = createServer((request, response) => {
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers.authorization, undefined);
    response.setHeader("Set-Cookie", "target_secret=never-forward");
    response.end("Synthetic target page");
  });
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const reserve = createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
  const targetPort = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const server = createServer();
  const run = { id: "a".repeat(24), user_id: created.user.id, lab_id: "test-lab", archived: 0, runtime: "running", expires_at: Date.now() + 60000 };
  const instances = { byId: (id) => id === run.id ? run : undefined, setRevoker() {}, command: async (_run, args) => {
    assert.deepEqual(args, ["port", "browser-page", "8082"]);
    return `127.0.0.1:${upstream.address().port}`;
  } };
  const access = attachAccess(server, accounts, instances, new Map([[run.lab_id, { browserEntrypoints: [{ id: "page" }] }]]), { origins: ["http://127.0.0.1:5173"], controllerPort: 3030, targetPort });
  t.after(async () => { access.close(); await new Promise((resolve) => upstream.close(resolve)); accounts.db.close(); rmSync(root, { recursive: true, force: true }); });
  await assert.rejects(access.launch(session, undefined, "page"), /not available/);
  const launched = new URL((await access.launch(session, run.id, "page")).url);
  assert.ok(launched.hostname.split(".")[0].length <= 63);
  const request = (path, cookie) => get(`http://127.0.0.1:${targetPort}${path}`, { Host: launched.host, ...(cookie ? { Cookie: cookie, Authorization: "not-forwarded" } : {}) });
  const ticketPath = launched.pathname + launched.search;
  const ticket = await request(ticketPath);
  assert.equal(ticket.status, 200);
  assert.match(await ticket.text(), /location.replace/);
  assert.match(ticket.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  assert.equal((await request(ticketPath)).status, 403);
  assert.equal((await request("/")).status, 403);
  const cookie = ticket.headers.get("set-cookie").split(";")[0];
  const allowed = await request("/", cookie);
  assert.equal(allowed.status, 200);
  assert.equal(await allowed.text(), "Synthetic target page");
  assert.equal(allowed.headers.get("set-cookie"), null);
  const another = new URL((await access.launch(session, run.id, "page")).url);
  assert.equal((await get(`http://127.0.0.1:${targetPort}/`, { Host: another.host, Cookie: cookie })).status, 403);
  accounts.db.prepare("DELETE FROM account_sessions WHERE hash=?").run(session.hash);
  assert.equal((await request("/", cookie)).status, 403);
});
