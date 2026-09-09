"""Synthetic local CSRF/request-integrity lab with harmless preferences."""
import hmac
import json
import os
import secrets
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer

TRUSTED_ORIGIN = "http://portal.training.local"
THEMES = {"slate", "amber", "blue"}
CASES = {}
SESSIONS = {}
CONTROLS = {"require_session_cookie": True, "require_csrf_token": True, "bind_token_to_session": True, "validate_origin": True}


def session_cookie(headers):
    jar = SimpleCookie()
    try:
        jar.load(headers.get("Cookie", ""))
        return jar["session"].value if "session" in jar else None
    except Exception:
        return None


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body, cookie=None):
        data = json.dumps(body, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(data)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 65536:
                return None
            value = json.loads(self.rfile.read(length) or b"{}")
            return value if isinstance(value, dict) else None
        except (ValueError, json.JSONDecodeError):
            return None

    def case_for_request(self, body=None):
        sid = session_cookie(self.headers)
        case_id = SESSIONS.get(sid)
        if not case_id or (body is not None and body.get("case_id") != case_id):
            return sid, None
        return sid, CASES[case_id]

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"service": "integrity-review", "state": "ready"})
        if self.path == "/preference":
            _, case = self.case_for_request()
            if not case:
                return self.reply(401, {"reason": "session"})
            return self.reply(200, {"theme": case["theme"]})
        return self.reply(404, {"reason": "not-found"})

    def do_POST(self):
        body = self.read_json()
        if body is None:
            return self.reply(400, {"reason": "invalid-json"})
        if self.path == "/case":
            case_id = secrets.token_urlsafe(18)
            sid = secrets.token_urlsafe(32)
            token = secrets.token_urlsafe(32)
            CASES[case_id] = {"session": sid, "csrf_token": token, "theme": "slate", "finding_token": None, "vulnerable_cross_site": False, "no_token_rejected": False, "wrong_origin_rejected": False, "wrong_binding_rejected": False, "valid_accepted": False}
            SESSIONS[sid] = case_id
            return self.reply(201, {"case_id": case_id, "csrf_token": token, "trusted_origin": TRUSTED_ORIGIN}, f"session={sid}; Path=/; Secure; HttpOnly; SameSite=Lax")
        _, case = self.case_for_request(body)
        if not case:
            return self.reply(401, {"reason": "session"})
        theme = body.get("theme")
        if self.path in ("/vulnerable/preference", "/fixed/preference") and theme not in THEMES:
            return self.reply(422, {"reason": "unsupported-theme"})
        if self.path == "/vulnerable/preference":
            case["theme"] = theme
            if self.headers.get("Origin") != TRUSTED_ORIGIN and not self.headers.get("X-CSRF-Token"):
                case["vulnerable_cross_site"] = True
            return self.reply(200, {"reason": "preference-updated", "theme": theme})
        if self.path == "/fixed/preference":
            supplied = self.headers.get("X-CSRF-Token", "")
            if not hmac.compare_digest(supplied, case["csrf_token"]):
                if not supplied:
                    case["no_token_rejected"] = True
                else:
                    case["wrong_binding_rejected"] = True
                return self.reply(403, {"reason": "csrf-token"})
            if self.headers.get("Origin") != TRUSTED_ORIGIN:
                case["wrong_origin_rejected"] = True
                return self.reply(403, {"reason": "origin"})
            case["theme"] = theme
            case["valid_accepted"] = True
            return self.reply(200, {"reason": "preference-updated", "theme": theme})
        if self.path == "/finding":
            expected = body.get("vulnerable_cross_site_status") == 200 and body.get("fixed_without_token_status") == 403 and body.get("fixed_wrong_origin_status") == 403
            if not expected or not case["vulnerable_cross_site"] or not case["no_token_rejected"] or not case["wrong_origin_rejected"]:
                return self.reply(422, {"reason": "finding-mismatch"})
            case["finding_token"] = secrets.token_urlsafe(18)
            return self.reply(200, {"finding_token": case["finding_token"], "objective_flag": os.environ["FLAG_L13_GAP"]})
        if self.path == "/remediation":
            if not case["finding_token"] or body.get("finding_token") != case["finding_token"]:
                return self.reply(409, {"reason": "complete-finding-first"})
            proof = case["wrong_binding_rejected"] and case["valid_accepted"]
            if body.get("controls") != CONTROLS or not proof:
                return self.reply(422, {"reason": "integrity-not-proven"})
            return self.reply(200, {"reason": "request-integrity-validated", "objective_flag": os.environ["FLAG_L13_INTEGRITY"]})
        return self.reply(404, {"reason": "not-found"})

    def log_message(self, _format, *_args):
        pass


if __name__ == "__main__":
    server = HTTPServer((os.environ.get("LAB_HOST", "0.0.0.0"), int(os.environ.get("LAB_PORT", "8080"))), Handler)
    print(json.dumps({"port": server.server_port}), flush=True)
    server.serve_forever()
