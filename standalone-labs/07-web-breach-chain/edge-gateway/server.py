"""Edge gateway for lab 07 (Web Breach Chain).

Exposes two things an attacker meets first:
  * a raw TCP service beacon on 9091 (nmap -sT + banner grab)
  * the vulnerable "ApertureOps" HTTP portal on 8080

Every vulnerability here is a synthetic simulation that emits a proof token.
No real browser, database, or operating-system command is involved. The
per-run RLAB{...} flags arrive as environment variables (injected by
standalone-labctl) and are echoed only when the matching stage is solved.
"""

import base64
import json
import os
import signal
import socketserver
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


# Static breadcrumbs the learner collects at each stage. They are constant so
# the smoke test can assert them; the rotating secrets are the RLAB flags.
RECON_TOKEN = "beacon-argon-19"
SURFACE_TOKEN = "surface-quartz-52"
FOOTHOLD_TOKEN = "foothold-cinder-88"
ANALYST_SESSION_ID = "analyst-session-cinder-88"


def flag(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


def b64url(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


# A realistic-looking analyst session token. It is signed with HS256 in name
# only; the internal API never checks the signature, which is the whole point
# of the alg:none escalation in the next stage.
ANALYST_JWT = ".".join(
    [
        b64url({"alg": "HS256", "typ": "JWT"}),
        b64url({
            "sub": "analyst",
            "role": "analyst",
            "scope": "support",
            "sid": ANALYST_SESSION_ID,
        }),
        "c3ludGhldGljLXNpZ25hdHVyZQ",
    ]
)


class Handler(BaseHTTPRequestHandler):
    server_version = "ApertureOps/2.3"

    def version_string(self):  # clean, fingerprintable banner
        return self.server_version

    def log_message(self, _format, *_args):
        return

    def send_text(self, status: int, body: str, content_type="text/plain; charset=utf-8"):
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_HEAD(self):
        # Support `curl -I` fingerprinting of the portal root.
        if self.server.server_port == 8080 and urlparse(self.path).path in ("/", "/index.html"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", "0")
            self.send_header("X-Powered-By", "ApertureOps Portal")
            self.end_headers()
            return
        self.send_response(404)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health":
            self.send_text(200, "ok\n")
            return

        if self.server.server_port != 8080:
            self.send_text(404, "not found\n")
            return

        if path in ("/", "/index.html"):
            self.send_text(
                200,
                "<!doctype html>\n"
                "<html><head><title>ApertureOps Portal</title></head>\n"
                "<body>\n"
                "  <h1>ApertureOps Operations Portal</h1>\n"
                "  <p>Northstar Shipping | ApertureOps support incident AP-07. Review how a report reaches a staff session.</p>\n"
                "  <!-- TODO(dev): staging helper /api/dev/hello is still reachable, remove before GA -->\n"
                "  <p>Trouble? File a report through <a href=\"/support?msg=hello\">/support</a>.</p>\n"
                "</body></html>\n",
                "text/html; charset=utf-8",
            )
            return

        if path == "/robots.txt":
            self.send_text(200, "User-agent: *\nDisallow: /api/dev\n")
            return

        if path == "/api/dev/hello":
            self.send_text(
                200,
                f"surface_token={SURFACE_TOKEN}\n"
                f"objective_flag={flag('FLAG_L07_SURFACE_MAP')}\n"
                "note=the support form reflects the 'msg' parameter without encoding\n"
                "try=GET /support?msg=<b>test</b>\n"
                "escalate=POST /support/ticket with report=<your payload> to reach the on-call analyst\n",
            )
            return

        if path == "/support":
            query = parse_qs(parsed.query)
            message = query.get("msg", ["(empty)"])[0]
            # Reflected XSS sink: the value is written into the response body
            # verbatim, with no HTML encoding.
            self.send_text(
                200,
                "<!doctype html>\n"
                "<html><head><title>ApertureOps Support</title></head>\n"
                "<body>\n"
                "  <h1>Support preview</h1>\n"
                f"  <div class=\"preview\">{message}</div>\n"
                "  <p>Submit a full report with: POST /support/ticket (form field 'report').\n"
                "     The on-call analyst reviews every report in their signed-in session.</p>\n"
                "</body></html>\n",
                "text/html; charset=utf-8",
            )
            return

        self.send_text(404, "not found\n")

    def do_POST(self):
        parsed = urlparse(self.path)
        if self.server.server_port != 8080 or parsed.path != "/support/ticket":
            self.send_text(404, "not found\n")
            return

        length = min(int(self.headers.get("Content-Length", "0") or "0"), 16384)
        body = self.rfile.read(length).decode("utf-8", errors="replace")
        report = parse_qs(body).get("report", [""])[0].lower()

        # Simulate the analyst bot opening the report inside its authenticated
        # session. A payload that scripts and reads document.cookie exfiltrates
        # the analyst session token to the attacker.
        if "<script" in report and "document.cookie" in report:
            self.send_text(
                200,
                "simulation=The training rule recognized a script reading document.cookie; no browser executed it.\n"
                "analyst reviewed your report in their session\n"
                f"stolen_cookie=session={ANALYST_JWT}\n"
                f"foothold_token={FOOTHOLD_TOKEN}\n"
                f"objective_flag={flag('FLAG_L07_WEB_FOOTHOLD')}\n"
                "next=decode the session JWT, then target ops-internal:8081/admin/console\n",
            )
            return

        self.send_text(200, "ticket queued; the analyst saw nothing worth escalating\n")


class BeaconHandler(socketserver.BaseRequestHandler):
    def handle(self):
        payload = (
            "APERTURE-EDGE/1.2\r\n"
            f"recon_token={RECON_TOKEN}\r\n"
            f"objective_flag={flag('FLAG_L07_RECON_SWEEP')}\r\n"
            "next=http/8080\r\n"
        )
        self.request.sendall(payload.encode("utf-8"))


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


servers = [
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler),
    ThreadedTCPServer(("0.0.0.0", 9091), BeaconHandler),
]

for server in servers:
    threading.Thread(target=server.serve_forever, daemon=True).start()


def stop(_signum, _frame):
    for server in servers:
        server.shutdown()


signal.signal(signal.SIGTERM, stop)
signal.pause()
