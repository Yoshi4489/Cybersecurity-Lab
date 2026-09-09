"""Deterministic local session-replay teaching target; no production credentials."""
import json
import os
import secrets
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

NOW = int(os.environ.get("LAB_FAKE_NOW", "1700000000"))
CASES = {}
EXPECTED = {
    "logout_vulnerable": "accepted",
    "logout_hardened": "session-revoked",
    "password_vulnerable": "accepted",
    "password_hardened": "credential-version-stale",
    "refresh_vulnerable_reuse": "accepted",
    "refresh_hardened_reuse": "refresh-replayed-family-revoked",
}
CONTROLS = {
    "revoke_session_on_logout": True,
    "invalidate_sessions_on_password_change": True,
    "rotate_refresh_once": True,
    "revoke_family_on_reuse": True,
}


def opaque(prefix):
    return f"{prefix}.{secrets.token_urlsafe(24)}"


def new_case():
    sessions = {
        "logout": {"access_token": opaque("access-logout"), "refresh_token": opaque("refresh-logout")},
        "password": {"access_token": opaque("access-password"), "refresh_token": opaque("refresh-password")},
        "rotation": {"refresh_token": opaque("refresh-strong"), "weak_refresh_token": opaque("refresh-weak")},
    }
    return {
        "sessions": sessions,
        "logout_revoked": False,
        "password_version": 1,
        "tokens_password_version": 1,
        "strong_refresh": {sessions["rotation"]["refresh_token"]: {"used": False, "family": "family-16"}},
        "family_revoked": False,
        "timeline_token": None,
    }


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        data = json.dumps(body, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 65536:
                return None
            body = json.loads(self.rfile.read(length) or b"{}")
            return body if isinstance(body, dict) else None
        except (ValueError, json.JSONDecodeError):
            return None

    def bearer(self):
        value = self.headers.get("Authorization", "")
        return value[7:] if value.startswith("Bearer ") else ""

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            return self.reply(200, {"service": "session-replay-review", "state": "ready", "now": NOW})
        if parsed.path != "/resource":
            return self.reply(404, {"reason": "not-found"})
        query = parse_qs(parsed.query)
        case = CASES.get(query.get("case_id", [""])[0])
        mode = query.get("mode", [""])[0]
        scenario = query.get("scenario", [""])[0]
        if not case or mode not in ("vulnerable", "hardened") or scenario not in ("logout", "password"):
            return self.reply(404, {"reason": "unknown-case-or-scenario"})
        token = self.bearer()
        if not token:
            return self.reply(401, {"reason": "missing-token"})
        if token != case["sessions"][scenario]["access_token"]:
            return self.reply(401, {"reason": "unknown-token"})
        if mode == "hardened" and scenario == "logout" and case["logout_revoked"]:
            return self.reply(401, {"reason": "session-revoked"})
        if mode == "hardened" and scenario == "password" and case["tokens_password_version"] != case["password_version"]:
            return self.reply(401, {"reason": "credential-version-stale"})
        return self.reply(200, {"reason": "accepted", "subject": "case-analyst", "at": NOW})

    def do_POST(self):
        parsed = urlparse(self.path)
        body = self.read_json()
        if body is None:
            return self.reply(400, {"reason": "invalid-json"})
        if parsed.path == "/case":
            case_id = opaque("case")
            CASES[case_id] = new_case()
            case = CASES[case_id]
            return self.reply(201, {"case_id": case_id, "clock": {"mode": "explicit-fixed", "now": NOW}, "sessions": case["sessions"]})
        case = CASES.get(body.get("case_id"))
        if not case:
            return self.reply(404, {"reason": "unknown-case"})
        if parsed.path == "/event":
            pair = (body.get("scenario"), body.get("action"))
            if pair == ("logout", "logout"):
                case["logout_revoked"] = True
            elif pair == ("password", "password-change"):
                case["password_version"] += 1
            else:
                return self.reply(422, {"reason": "invalid-transition"})
            return self.reply(200, {"reason": "state-transition-recorded", "at": NOW})
        if parsed.path == "/refresh":
            mode = parse_qs(parsed.query).get("mode", [""])[0]
            supplied = body.get("refresh_token")
            if mode == "vulnerable" and supplied == case["sessions"]["rotation"]["weak_refresh_token"]:
                return self.reply(200, {"reason": "accepted", "access_token": opaque("weak-access"), "refresh_token": supplied})
            if mode != "hardened" or supplied not in case["strong_refresh"]:
                return self.reply(401, {"reason": "unknown-refresh-token"})
            record = case["strong_refresh"][supplied]
            if record["used"]:
                case["family_revoked"] = True
                return self.reply(401, {"reason": "refresh-replayed-family-revoked"})
            if case["family_revoked"]:
                return self.reply(401, {"reason": "refresh-family-revoked"})
            record["used"] = True
            successor = opaque("refresh-strong")
            case["strong_refresh"][successor] = {"used": False, "family": record["family"]}
            return self.reply(200, {"reason": "rotated", "access_token": opaque("strong-access"), "refresh_token": successor})
        if parsed.path == "/timeline":
            if body.get("observations") != EXPECTED:
                return self.reply(422, {"reason": "timeline-mismatch", "required_keys": list(EXPECTED)})
            case["timeline_token"] = opaque("timeline")
            return self.reply(200, {"reason": "timeline-confirmed", "timeline_token": case["timeline_token"], "objective_flag": os.environ["FLAG_L16_TIMELINE"]})
        if parsed.path == "/remediation":
            if not case["timeline_token"] or body.get("timeline_token") != case["timeline_token"]:
                return self.reply(409, {"reason": "complete-timeline-first"})
            if body.get("controls") != CONTROLS:
                return self.reply(422, {"reason": "controls-incomplete"})
            return self.reply(200, {"reason": "revocation-and-rotation-validated", "objective_flag": os.environ["FLAG_L16_REMEDIATION"]})
        return self.reply(404, {"reason": "not-found"})

    def log_message(self, _format, *_args):
        pass


if __name__ == "__main__":
    server = HTTPServer((os.environ.get("LAB_HOST", "0.0.0.0"), int(os.environ.get("LAB_PORT", "8080"))), Handler)
    print(json.dumps({"port": server.server_port}), flush=True)
    server.serve_forever()
