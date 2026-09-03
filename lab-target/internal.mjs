import { createServer } from "node:http";
import { proof, sendJson } from "./proofs.mjs";

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://internal:8081");
  if (url.pathname === "/health") return sendJson(response, 200, { ok: true, service: "internal" });
  if (url.pathname === "/") return sendJson(response, 200, { service: "internal-admin", routes: ["/admin/proof"] });
  if (url.pathname === "/admin/proof") return sendJson(response, 200, { zone: "internal-only", proof: proof("ssrf_internal") });
  if (url.pathname === "/admin/capstone/final" && url.searchParams.get("artifact") === "user-3") {
    return sendJson(response, 200, { chainProof: proof("capstone_chain"), receiptPath: "/admin/capstone/report?artifact=user-3" });
  }
  if (url.pathname === "/admin/capstone/report" && url.searchParams.get("artifact") === "user-3") {
    return sendJson(response, 200, { remediationReceipt: proof("capstone_report"), fix: "URL allowlist + network egress policy + object authorization" });
  }
  return sendJson(response, 404, { error: "internal route not found" });
}).listen(8081, "0.0.0.0", () => console.log("internal listening on 8081"));
