"""Internal operations API for lab 07 (Web Breach Chain).

This host trusts bearer tokens without verifying their signature, so an
attacker who reaches it with a forged `alg:none` JWT claiming role=admin is
allowed into the admin console. The final route re-checks the whole chain of
tokens the attacker gathered along the way before releasing the root proof.

All escalation here is an application-layer simulation: the container is
read-only, drops every capability, and runs unprivileged, so there is no real
operating-system privilege to gain.
"""

import base64
import json
import os
import signal
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


# Must match the constants baked into edge-gateway so /final can validate the
# tokens the attacker collected across the chain.
RECON_TOKEN = "beacon-argon-19"
SURFACE_TOKEN = "surface-quartz-52"
FOOTHOLD_TOKEN = "foothold-cinder-88"
ADMIN_TOKEN = "root-obsidian-77"
ANALYST_SESSION_ID = "analyst-session-cinder-88"


def flag(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


def b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def decode_unverified(token: str):
    """Decode a JWT WITHOUT verifying its signature (the vulnerability)."""
    parts = token.split(".")
    if len(parts) < 2:
        raise ValueError("not a JWT")
    header = json.loads(b64url_decode(parts[0]))
    payload = json.loads(b64url_decode(parts[1]))
    return header, payload


def is_authorized_admin(token: str) -> bool:
    try:
        jwt_header, jwt_payload = decode_unverified(token)
    except Exception:
        return False
    return (
        str(jwt_header.get("alg", "")).lower() == "none"
        and jwt_payload.get("role") == "admin"
        and jwt_payload.get("sub") == "analyst"
        and jwt_payload.get("sid") == ANALYST_SESSION_ID
    )


class Handler(BaseHTTPRequestHandler):
    server_version = "OpsInternal/1.0"

    def version_string(self):
        return self.server_version

    def log_message(self, _format, *_args):
        return

    def send_text(self, status: int, body: str):
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("WWW-Authenticate", 'Bearer realm="ops-internal"')
        self.end_headers()
        self.wfile.write(payload)

    def bearer_token(self):
        header = self.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            return header[len("Bearer "):].strip()
        return ""

    def authorized_admin(self) -> bool:
        return is_authorized_admin(self.bearer_token())

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/health":
            self.send_text(200, "ok\n")
            return

        if path == "/":
            self.send_text(
                200,
                "ops-internal admin api\n"
                "present Authorization: Bearer <token> with role=admin to reach /admin/console\n",
            )
            return

        if path == "/admin/console":
            if self.authorized_admin():
                self.send_text(
                    200,
                    "admin console unlocked\n"
                    f"admin_token={ADMIN_TOKEN}\n"
                    f"objective_flag={flag('FLAG_L07_PRIV_ESC')}\n"
                    "next=POST /final with recon, surface, foothold and admin tokens\n",
                )
            else:
                self.send_text(401, "authorized analyst admin bearer token required\n")
            return

        self.send_text(404, "not found\n")

    def do_POST(self):
        if urlparse(self.path).path != "/final":
            self.send_text(404, "not found\n")
            return

        if not self.authorized_admin():
            self.send_text(401, "authorized analyst admin bearer token required\n")
            return

        length = min(int(self.headers.get("Content-Length", "0") or "0"), 12288)
        form = parse_qs(self.rfile.read(length).decode("utf-8", errors="replace"))
        supplied = {
            "recon": form.get("recon", [""])[0],
            "surface": form.get("surface", [""])[0],
            "foothold": form.get("foothold", [""])[0],
            "admin": form.get("admin", [""])[0],
        }
        expected = {
            "recon": RECON_TOKEN,
            "surface": SURFACE_TOKEN,
            "foothold": FOOTHOLD_TOKEN,
            "admin": ADMIN_TOKEN,
        }
        if supplied != expected:
            self.send_text(403, "chain incomplete: submit all four tokens\n")
            return
        self.send_text(200, f"final_proof={flag('FLAG_L07_ROOT_PROOF')}\n")


server = ThreadingHTTPServer(("0.0.0.0", 8081), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()


def stop(_signum, _frame):
    server.shutdown()


signal.signal(signal.SIGTERM, stop)
signal.pause()
