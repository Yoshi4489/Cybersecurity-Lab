import { createServer, request } from "node:http";

// Only the generated manifest sets this destination. Requests cannot select a host.
const hostname = process.env.TARGET_HOST;
const port = Number(process.env.TARGET_PORT);
if (!/^[a-z0-9-]+$/.test(hostname ?? "") || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid fixed target");
createServer((client, response) => {
  if (!client.url?.startsWith("/") || client.url.startsWith("//")) { response.writeHead(400); response.end(); return; }
  const upstream = request({ hostname, port, method: client.method, path: client.url,
    headers: { ...client.headers, host: `${hostname}:${port}` }, timeout: 15000 }, (result) => {
    response.writeHead(result.statusCode ?? 502, result.headers); result.pipe(response);
  });
  upstream.on("timeout", () => upstream.destroy());
  upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end("Target unavailable"); });
  client.on("aborted", () => upstream.destroy());
  client.pipe(upstream);
}).listen(8082, "0.0.0.0");
