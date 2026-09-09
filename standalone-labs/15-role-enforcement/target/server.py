"""Local synthetic role-enforcement target with explicit deny-by-default policy."""
import json
import os
import secrets
from http.server import BaseHTTPRequestHandler, HTTPServer

CASES = {}
OPERATIONS = ["get_primary", "put_primary", "delete_primary", "post_admin_path", "post_ops_alias"]
PERMISSIONS = {
    "viewer": {"get_primary": 200, "put_primary": 403, "delete_primary": 403, "post_admin_path": 403, "post_ops_alias": 403},
    "editor": {"get_primary": 200, "put_primary": 200, "delete_primary": 403, "post_admin_path": 403, "post_ops_alias": 403},
    "admin": {name: 200 for name in OPERATIONS},
}
EXPECTED = {f"{role}:{operation}": status for role, rules in PERMISSIONS.items() for operation, status in rules.items()}
CONTROLS = {"central_policy": True, "enforce_server_side": True, "cover_alternate_paths": True, "deny_by_default": True, "test_positive_and_negative": True}
ROUTES = {
    ("GET", "/fixed/reports/quarterly"): "get_primary",
    ("PUT", "/fixed/reports/quarterly"): "put_primary",
    ("DELETE", "/fixed/reports/quarterly"): "delete_primary",
    ("POST", "/fixed/admin/reports/quarterly/archive"): "post_admin_path",
    ("POST", "/fixed/ops/reports/quarterly/archive"): "post_ops_alias",
}


def evidence_report(finding, evidence, impact, remediation):
    return {"finding": finding, "evidence": evidence, "impact": impact, "confidence": "High — the complete real HTTP role-method-path matrix matched policy.", "remediation": remediation}


def new_case():
    roles = {role: {"user": user, "role": role, "token": secrets.token_urlsafe(18)} for role, user in (("viewer", "Vera"), ("editor", "Eli"), ("admin", "Ada"))}
    return {"roles": roles, "tokens": {identity["token"]: role for role, identity in roles.items()}, "matrix_token": None}


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
            value = json.loads(self.rfile.read(length) or b"{}")
            return value if isinstance(value, dict) else None
        except (ValueError, json.JSONDecodeError):
            return None

    def identity(self):
        token = self.headers.get("X-Lab-Token", "")
        for case in CASES.values():
            if token in case["tokens"]:
                return case["tokens"][token]
        return None

    def authorize(self, method, body=None):
        role = self.identity()
        if role is None:
            return self.reply(401, {"reason": "authentication-required"})
        if self.path.startswith("/vulnerable/"):
            known = self.path in ("/vulnerable/reports/quarterly", "/vulnerable/admin/reports/quarterly/archive")
            return self.reply(200 if known else 404, {"reason": "client-menu-policy" if known else "not-found", "actor_role": role})
        operation = ROUTES.get((method, self.path))
        if operation is None:
            return self.reply(403, {"reason": "deny-by-default", "actor_role": role})
        status = PERMISSIONS[role][operation]
        return self.reply(status, {"reason": "allowed" if status == 200 else "role-denied", "actor_role": role, "operation": operation})

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"service": "role-enforcement", "state": "ready"})
        return self.authorize("GET")

    def do_PUT(self):
        return self.authorize("PUT", self.read_json())

    def do_DELETE(self):
        return self.authorize("DELETE")

    def do_PATCH(self):
        return self.authorize("PATCH", self.read_json())

    def do_POST(self):
        body = self.read_json()
        if body is None:
            return self.reply(400, {"reason": "invalid-json"})
        if self.path == "/case":
            case_id = secrets.token_urlsafe(20)
            CASES[case_id] = new_case()
            return self.reply(201, {"case_id": case_id, "roles": CASES[case_id]["roles"], "policy": PERMISSIONS, "scope": "Only this local synthetic service"})
        if self.path.startswith("/fixed/") or self.path.startswith("/vulnerable/"):
            return self.authorize("POST", body)
        case = CASES.get(body.get("case_id"))
        if not case:
            return self.reply(404, {"reason": "unknown-case"})
        if self.path == "/reports/matrix":
            if body.get("results") != EXPECTED:
                return self.reply(422, {"reason": "matrix-mismatch", "required": list(EXPECTED)})
            case["matrix_token"] = secrets.token_urlsafe(16)
            evidence = evidence_report("Client-side role hiding allowed privileged methods and alternate paths; the fixed server policy enforced the full matrix.", "Fifteen role-method-path requests matched policy, while viewer DELETE and archive POST succeeded only on vulnerable routes.", "Missing server checks could let lower roles alter, delete, or archive reports.", "Centralize server-side authorization, cover aliases, deny unlisted combinations, and retain matrix regression tests.")
            return self.reply(200, {"evidence_report": evidence, "matrix_token": case["matrix_token"], "objective_flag": os.environ["FLAG_L15_MATRIX"]})
        if self.path == "/reports/remediation":
            if not case["matrix_token"] or body.get("matrix_token") != case["matrix_token"]:
                return self.reply(409, {"reason": "complete-matrix-first"})
            if body.get("controls") != CONTROLS:
                return self.reply(422, {"reason": "controls-incomplete"})
            evidence = evidence_report("Deny-by-default server-side authorization covers every tested role, method, and alternate path.", "Allowed viewer reads, editor writes, and admin operations returned 200; all disallowed and unlisted requests returned 403.", "Least privilege is enforced without blocking each role's intended work.", "Keep one central server-side policy, normalize route aliases, deny missing rules, and test positive and negative cases.")
            return self.reply(200, {"evidence_report": evidence, "objective_flag": os.environ["FLAG_L15_REMEDIATION"]})
        return self.reply(404, {"reason": "not-found"})

    def log_message(self, _format, *_args):
        pass


if __name__ == "__main__":
    server = HTTPServer((os.environ.get("LAB_HOST", "0.0.0.0"), int(os.environ.get("LAB_PORT", "8080"))), Handler)
    print(json.dumps({"port": server.server_port}), flush=True)
    server.serve_forever()
