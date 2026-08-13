import { createServer } from "node:http";
import { proof, sendJson, sendText } from "./proofs.mjs";

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://recon-node:9090");
  if (url.pathname === "/health") return sendJson(response, 200, { ok: true, service: "recon-node" });
  if (url.pathname === "/banner") return sendText(response, 200, "northstar-admin-banner/1.4\n", { "X-Recon-Proof": proof("dns_alias") });
  if (url.pathname === "/service-proof") return sendText(response, 200, `service=inventory-metrics\nport=9090\nproof=${proof("active_service")}\n`);
  if (url.pathname === "/capstone") return sendJson(response, 200, { artifact: "edge-map-72", next: "gateway:8080/api/users?id=3&key=edge-map-72" });
  return sendJson(response, 404, { error: "unknown recon route", hint: "try /banner" });
}).listen(9090, "0.0.0.0", () => console.log("recon-node listening on 9090"));
