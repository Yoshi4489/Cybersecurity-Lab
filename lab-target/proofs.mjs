import { readFileSync } from "node:fs";

let cache = null;
export function proof(key) {
  try {
    cache ??= JSON.parse(readFileSync(process.env.LAB_FLAGS_FILE ?? "/run/reconlab/flags.json", "utf8")).proofs;
    return cache[key] ?? "RLAB{UNKNOWN_PROOF}";
  } catch {
    return "RLAB{START_THE_RANGE_FIRST}";
  }
}

export function sendJson(response, status, value, headers = {}) {
  const body = JSON.stringify(value, null, 2);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Lab-Only": "RECON-LAB",
    ...headers,
  });
  response.end(body);
}

export function sendText(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Lab-Only": "RECON-LAB",
    ...headers,
  });
  response.end(body);
}

export async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 64_000) throw new Error("body too large");
  }
  return body;
}
