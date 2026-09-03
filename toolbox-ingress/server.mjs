import { createServer, request } from "node:http";
import { connect } from "node:net";

const backendHost = "toolbox";
const backendPort = 7681;

const server = createServer((clientRequest, clientResponse) => {
  const upstream = request({
    hostname: backendHost,
    port: backendPort,
    path: clientRequest.url,
    method: clientRequest.method,
    headers: { ...clientRequest.headers, host: `${backendHost}:${backendPort}` },
  }, (upstreamResponse) => {
    clientResponse.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(clientResponse);
  });
  upstream.on("error", () => {
    if (!clientResponse.headersSent) clientResponse.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    clientResponse.end("Toolbox is unavailable");
  });
  clientRequest.pipe(upstream);
});

server.on("upgrade", (clientRequest, socket, head) => {
  const upstream = connect(backendPort, backendHost, () => {
    const headers = { ...clientRequest.headers, host: `${backendHost}:${backendPort}` };
    const requestHead = [`${clientRequest.method} ${clientRequest.url} HTTP/${clientRequest.httpVersion}`, ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`), "", ""].join("\r\n");
    upstream.write(requestHead);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  const close = () => socket.destroy();
  upstream.on("error", close);
  socket.on("error", () => upstream.destroy());
});

server.listen(8082, "0.0.0.0");
