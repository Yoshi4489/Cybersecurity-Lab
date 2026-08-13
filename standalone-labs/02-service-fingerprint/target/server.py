import os
import signal
import socketserver
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


PORT_TOKEN = "ports-quartz-2222-8000-8443-31337"
VERSION_TOKEN = "version-heron-5.7"
HTTP_TOKEN = "metadata-ember-console"


def flag(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


class HttpHandler(BaseHTTPRequestHandler):
    server_version = "SyntheticConsole/3.8"

    def log_message(self, _format, *_args):
        return

    def send_text(self, status: int, body: str, headers=None):
        payload = body.encode("utf-8")
        self.send_response(status)
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_text(200, "ok\n")
            return

        if self.server.server_port == 8000 and parsed.path == "/":
            body = (
                "<html><head><title>Quartz Inventory Console</title></head>"
                "<body><h1>Synthetic service inventory</h1>"
                f"<p>port_token={PORT_TOKEN}</p>"
                f"<p>objective_flag={flag('FLAG_L02_FULL_PORT_MAP')}</p>"
                "</body></html>\n"
            )
            self.send_text(200, body, {"X-Lab-Inventory": "complete"})
            return

        if self.server.server_port == 8443 and parsed.path == "/":
            body = (
                "<html><head><title>Ember Operations Portal</title></head>"
                "<body>Lab-only HTTP metadata endpoint.</body></html>\n"
            )
            self.send_text(
                200,
                body,
                {
                    "X-Lab-Metadata-Token": HTTP_TOKEN,
                    "X-Objective-Flag": flag("FLAG_L02_HTTP_METADATA"),
                },
            )
            return

        if self.server.server_port == 8000 and parsed.path == "/final":
            query = parse_qs(parsed.query)
            valid = (
                query.get("ports") == [PORT_TOKEN]
                and query.get("version") == [VERSION_TOKEN]
                and query.get("metadata") == [HTTP_TOKEN]
            )
            if valid:
                self.send_text(200, f"final_flag={flag('FLAG_L02_FINGERPRINT_PROOF')}\n")
            else:
                self.send_text(403, "port, version, and metadata artifacts are required\n")
            return

        self.send_text(404, "not found\n")


class BannerHandler(socketserver.BaseRequestHandler):
    def handle(self):
        port = self.server.server_address[1]
        if port == 2222:
            payload = "SSH-2.0-SyntheticSSH_9.3 lab-only\r\n"
        else:
            payload = (
                "SYNTH-LEDGER/5.7 ready\r\n"
                f"version_token={VERSION_TOKEN}\r\n"
                f"objective_flag={flag('FLAG_L02_VERSION_LEDGER')}\r\n"
            )
        self.request.sendall(payload.encode("utf-8"))


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


servers = [
    ThreadedTCPServer(("0.0.0.0", 2222), BannerHandler),
    ThreadingHTTPServer(("0.0.0.0", 8000), HttpHandler),
    ThreadingHTTPServer(("0.0.0.0", 8443), HttpHandler),
    ThreadedTCPServer(("0.0.0.0", 31337), BannerHandler),
]

for server in servers:
    threading.Thread(target=server.serve_forever, daemon=True).start()


def stop(_signum, _frame):
    for server in servers:
        server.shutdown()


signal.signal(signal.SIGTERM, stop)
signal.pause()
