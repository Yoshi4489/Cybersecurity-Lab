import hashlib
import io
import os
import tarfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs


DNS_FLAG = os.environ["LAB06_DNS_FLAG"]
NMAP_FLAG = os.environ["LAB06_NMAP_FLAG"]
HTTP_FLAG = os.environ["LAB06_HTTP_FLAG"]
FINAL_FLAG = os.environ["LAB06_FINAL_FLAG"]
TOP_ACTOR = "relay-7"
CORRELATED_EVENT = "EVT-6604"


def add_file(archive, name, content, mode=0o444):
    data = content if isinstance(content, bytes) else content.encode()
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = mode
    info.mtime = 1786582800
    info.uid = 1000
    info.gid = 1000
    info.uname = "analyst"
    info.gname = "analyst"
    archive.addfile(info, io.BytesIO(data))


def make_bundle():
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w") as archive:
        add_file(
            archive,
            "signals-66/manifest.txt",
            f"case=SG-66\nhttp_proof={HTTP_FLAG}\n"
            "analysis=group field 1, then inspect the winning actor's successful event path\n",
        )
        events = "".join(
            [
                "sensor-2 2026-08-13T05:01:00Z GET /health 200\n",
                f"{TOP_ACTOR} 2026-08-13T05:02:04Z GET /session/open 200\n",
                "sensor-9 2026-08-13T05:02:15Z GET /index 200\n",
                f"{TOP_ACTOR} 2026-08-13T05:03:21Z GET /artifact/prepare 202\n",
                f"{TOP_ACTOR} 2026-08-13T05:04:38Z GET /events/{CORRELATED_EVENT} 200\n",
                f"{TOP_ACTOR} 2026-08-13T05:05:44Z GET /session/close 200\n",
                "sensor-2 2026-08-13T05:06:03Z GET /health 200\n",
                "scanner-1 2026-08-13T05:06:19Z GET /events/DECOY-001 403\n",
            ]
        )
        add_file(archive, "signals-66/logs/relay-access.log", events, 0o440)
        add_file(
            archive,
            "signals-66/context/scope.txt",
            "Synthetic capstone SG-66. Authorized range: 172.30.66.0/24. No external targets.\n",
        )
    return stream.getvalue()


BUNDLE = make_bundle()
BUNDLE_SHA256 = hashlib.sha256(BUNDLE).hexdigest()
BUNDLE_PATH = "/run/artifacts/signals-bundle.tar"
with open(BUNDLE_PATH, "wb") as bundle_file:
    bundle_file.write(BUNDLE)
os.chmod(BUNDLE_PATH, 0o400)


class Handler(BaseHTTPRequestHandler):
    server_version = "SignalRelay/6.6"

    def reply(self, status, body, content_type="text/plain; charset=utf-8", headers=None):
        payload = body if isinstance(body, bytes) else body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Lab-Scope", "172.30.66.0/24")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        port = self.server.server_port
        if port == 9090:
            if self.path == "/":
                self.reply(
                    200,
                    "<html><title>Signal Relay Service Map</title><body>SG-66 relay telemetry</body></html>",
                    "text/html; charset=utf-8",
                    {
                        "X-Service-Proof": NMAP_FLAG,
                        "X-Artifact-Path": "/artifact/signals-bundle.tar",
                        "X-Artifact-Port": "8080",
                    },
                )
            else:
                self.reply(404, "not found\n")
            return

        if self.path == "/artifact/signals-bundle.tar":
            with open(BUNDLE_PATH, "rb") as bundle_file:
                self.reply(
                    200,
                    bundle_file.read(),
                    "application/x-tar",
                    {"X-Artifact-Case": "SG-66", "X-Artifact-Read-Only": "true"},
                )
        elif self.path == "/":
            self.reply(200, "Signal artifact vault. Discover the artifact route from mapped services.\n")
        else:
            self.reply(404, "not found\n")

    def do_HEAD(self):
        port = self.server.server_port
        if port == 9090 and self.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", "0")
            self.send_header("X-Lab-Scope", "172.30.66.0/24")
            self.send_header("X-Service-Proof", NMAP_FLAG)
            self.send_header("X-Artifact-Path", "/artifact/signals-bundle.tar")
            self.send_header("X-Artifact-Port", "8080")
            self.end_headers()
            return
        self.send_response(404)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        if self.server.server_port != 8080 or self.path != "/final":
            self.reply(404, "not found\n")
            return
        size = min(int(self.headers.get("Content-Length", "0")), 12288)
        form = parse_qs(self.rfile.read(size).decode(errors="replace"))
        supplied = {
            "dns": form.get("dns", [""])[0],
            "nmap": form.get("nmap", [""])[0],
            "http": form.get("http", [""])[0],
            "ports": form.get("ports", [""])[0],
            "actor": form.get("actor", [""])[0],
            "event": form.get("event", [""])[0],
            "bundle_sha256": form.get("bundle_sha256", [""])[0],
            "case": form.get("case", [""])[0],
        }
        expected = {
            "dns": DNS_FLAG,
            "nmap": NMAP_FLAG,
            "http": HTTP_FLAG,
            "ports": "8080,9090",
            "actor": TOP_ACTOR,
            "event": CORRELATED_EVENT,
            "bundle_sha256": BUNDLE_SHA256,
            "case": "SG-66",
        }
        if supplied != expected:
            self.reply(403, "signal chain rejected\n")
            return
        self.reply(200, f"final_proof={FINAL_FLAG}\n")

    def log_message(self, fmt, *args):
        print(f"signal-relay:{self.server.server_port} {self.address_string()} {fmt % args}", flush=True)


servers = [ThreadingHTTPServer(("0.0.0.0", port), Handler) for port in (8080, 9090)]
threads = [threading.Thread(target=server.serve_forever, daemon=True) for server in servers]
for thread in threads:
    thread.start()
for thread in threads:
    thread.join()
