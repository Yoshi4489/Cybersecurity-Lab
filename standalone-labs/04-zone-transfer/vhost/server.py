import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs


AUTHORITY_FLAG = os.environ["LAB04_AUTHORITY_FLAG"]
AXFR_FLAG = os.environ["LAB04_AXFR_FLAG"]
VHOST_FLAG = os.environ["LAB04_VHOST_FLAG"]
FINAL_FLAG = os.environ["LAB04_FINAL_FLAG"]
EXPECTED_HOST = "ops-archive.range.test"


class Handler(BaseHTTPRequestHandler):
    server_version = "RangeArchive/1.4"

    def _reply(self, status: int, body: str):
        encoded = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("X-Lab-Scope", "synthetic-internal-only")
        self.end_headers()
        self.wfile.write(encoded)

    def _valid_host(self) -> bool:
        return self.headers.get("Host", "").split(":", 1)[0].lower() == EXPECTED_HOST

    def do_GET(self):
        if not self._valid_host():
            self._reply(404, "unknown virtual host\n")
            return
        if self.path == "/proof/blue-team":
            self._reply(
                200,
                f"case=ZT-44\nserial=2026081304\nvhost_proof={VHOST_FLAG}\n"
                "Submit authority, transfer, and vhost proofs to POST /final.\n",
            )
            return
        self._reply(200, "Synthetic operations archive. Follow the DNS-disclosed route.\n")

    def do_POST(self):
        if not self._valid_host() or self.path != "/final":
            self._reply(404, "not found\n")
            return
        length = min(int(self.headers.get("Content-Length", "0")), 8192)
        form = parse_qs(self.rfile.read(length).decode(errors="replace"))
        supplied = {
            "authority": form.get("authority", [""])[0],
            "axfr": form.get("axfr", [""])[0],
            "vhost": form.get("vhost", [""])[0],
            "case": form.get("case", [""])[0],
            "serial": form.get("serial", [""])[0],
        }
        expected = {
            "authority": AUTHORITY_FLAG,
            "axfr": AXFR_FLAG,
            "vhost": VHOST_FLAG,
            "case": "ZT-44",
            "serial": "2026081304",
        }
        if supplied != expected:
            self._reply(403, "proof chain rejected\n")
            return
        self._reply(200, f"final_proof={FINAL_FLAG}\n")

    def log_message(self, fmt, *args):
        print(f"vhost {self.address_string()} {fmt % args}", flush=True)


ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
