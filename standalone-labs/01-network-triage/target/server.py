import os
import signal
import socketserver
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


SEGMENT_TOKEN = "segment-cobalt-41"
SERVICE_TOKEN = "beacon-lantern-27"
OPERATOR_TOKEN = "operator-sable-63"


def flag(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


class Handler(BaseHTTPRequestHandler):
    server_version = "TriageNode/1.4"

    def log_message(self, _format, *_args):
        return

    def send_text(self, status: int, body: str):
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_text(200, "ok\n")
            return

        if self.server.server_port == 8080 and parsed.path == "/":
            self.send_text(200, "triage-node: start with /network\n")
            return

        if self.server.server_port == 8080 and parsed.path == "/network":
            self.send_text(
                200,
                "scope=172.28.1.0/24\n"
                f"segment_token={SEGMENT_TOKEN}\n"
                f"objective_flag={flag('FLAG_L01_NETWORK_BASELINE')}\n",
            )
            return

        if self.server.server_port == 7070 and parsed.path == "/operator":
            self.send_text(
                200,
                f"operator_token={OPERATOR_TOKEN}\n"
                f"objective_flag={flag('FLAG_L01_OPERATOR_CONSOLE')}\n",
            )
            return

        if self.server.server_port == 8080 and parsed.path == "/final":
            query = parse_qs(parsed.query)
            valid = (
                query.get("segment") == [SEGMENT_TOKEN]
                and query.get("beacon") == [SERVICE_TOKEN]
                and query.get("operator") == [OPERATOR_TOKEN]
            )
            if valid:
                self.send_text(200, f"final_flag={flag('FLAG_L01_TRIAGE_PROOF')}\n")
            else:
                self.send_text(403, "three earlier artifact tokens are required\n")
            return

        self.send_text(404, "not found\n")


class BeaconHandler(socketserver.BaseRequestHandler):
    def handle(self):
        payload = (
            "TRIAGE-BEACON/2.1\r\n"
            f"service_token={SERVICE_TOKEN}\r\n"
            f"objective_flag={flag('FLAG_L01_SERVICE_BEACON')}\r\n"
        )
        self.request.sendall(payload.encode("utf-8"))


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


servers = [
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler),
    ThreadingHTTPServer(("0.0.0.0", 7070), Handler),
    ThreadedTCPServer(("0.0.0.0", 9090), BeaconHandler),
]

for server in servers:
    threading.Thread(target=server.serve_forever, daemon=True).start()


def stop(_signum, _frame):
    for server in servers:
        server.shutdown()


signal.signal(signal.SIGTERM, stop)
signal.pause()
