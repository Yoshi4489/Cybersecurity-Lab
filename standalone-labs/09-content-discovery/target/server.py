"""Northstar archive incident: discovery, decoded configuration and log evidence."""
import base64
import hashlib
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROBOTS_FLAG = os.environ["FLAG_L09_ROBOTS"]
GITLEAK_FLAG = os.environ["FLAG_L09_GITLEAK"]
BACKUP_FLAG = os.environ["FLAG_L09_BACKUP"]
FINAL_FLAG = os.environ["FLAG_L09_FINAL"]
ROBOTS_TOKEN = "index-quartz-09"
GIT_TOKEN = "repo-ember-33"
BACKUP_TOKEN = "stale-onyx-58"
CASE = "NS-09"
ACTOR = "migration-bot"
EVENT = "EXPORT-904"
LOG = (
    "healthcheck 2026-09-01T10:00:00Z GET /health 200\n"
    "migration-bot 2026-09-01T10:01:00Z GET /session 200\n"
    "scanner 2026-09-01T10:02:00Z GET /exports/DECOY-901 403\n"
    "migration-bot 2026-09-01T10:03:00Z GET /exports/EXPORT-904 200\n"
    "migration-bot 2026-09-01T10:04:00Z GET /logout 200\n"
    "healthcheck 2026-09-01T10:05:00Z GET /health 200\n"
).encode()
LOG_HASH = hashlib.sha256(LOG).hexdigest()
BACKUP = base64.b64encode(json.dumps({
    "case": CASE, "backup_token": BACKUP_TOKEN, "objective_flag": BACKUP_FLAG,
    "artifact": "/evidence/access.log", "sha256": LOG_HASH,
    "question": "Which actor successfully downloaded an /exports/ event?",
    "report": "/final",
    "fields": ["robots", "git", "backup", "case", "actor", "event", "log_sha256"],
}).encode()).decode()
INDEX = """<!doctype html>
<html><head><title>Northstar Archive</title></head><body>
<h1>Northstar Shipping — archive migration</h1>
<p>Incident NS-09: a customer export may have escaped during migration.</p>
<p>You are authorized to assess this archive and report the exposed evidence.</p>
<a href="/help">Customer help</a><a href="/robots.txt">Crawler policy</a>
</body></html>
"""
ROBOTS = "User-agent: *\nDisallow: /server-status\nDisallow: /.git/\n"
STATUS = (
    f"case={CASE}\nrobots_token={ROBOTS_TOKEN}\nobjective_flag={ROBOTS_FLAG}\n"
    "deployment=Working tree was copied during migration. Inspect /.git/config.\n"
)
GIT_CONFIG = (
    '[core]\nrepositoryformatversion = 0\n[remote "origin"]\n'
    'url = https://vcs.range.test/northstar/archive.git\n[deployment]\n'
    'backup = /config.php.bak\nencoding = base64-json\n'
    f'git_token = {GIT_TOKEN}\nobjective_flag = {GITLEAK_FLAG}\n'
)

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body, content_type="text/plain; charset=utf-8"):
        payload = body if isinstance(body, bytes) else body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        path = urlparse(self.path).path
        pages = {
            "/health": "ok\n", "/robots.txt": ROBOTS, "/server-status": STATUS,
            "/.git/config": GIT_CONFIG, "/config.php.bak": BACKUP + "\n",
            "/evidence/access.log": LOG,
            "/help": "Customer support is operating normally. No customer records are served here.\n",
        }
        if path == "/":
            self.reply(200, INDEX, "text/html; charset=utf-8")
        elif path in pages:
            self.reply(200, pages[path])
        else:
            self.reply(404, "not found\n")

    def do_POST(self):
        if urlparse(self.path).path != "/final":
            self.reply(404, "not found\n")
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.reply(400, "invalid content length\n")
            return
        if not 0 <= size <= 8192:
            self.reply(413, "report too large\n")
            return
        form = parse_qs(self.rfile.read(size).decode(errors="replace"))
        expected = {
            "robots": ROBOTS_TOKEN, "git": GIT_TOKEN, "backup": BACKUP_TOKEN,
            "case": CASE, "actor": ACTOR, "event": EVENT, "log_sha256": LOG_HASH,
        }
        if any(form.get(key) != [value] for key, value in expected.items()):
            self.reply(403, "Report incomplete: correlate the successful export with the decoded case and original log hash.\n")
            return
        self.reply(200, f"final_flag={FINAL_FLAG}\n"
                   "finding=Deployment exposed repository metadata, a backup and a customer export log.\n"
                   "remediation=Deploy build output only; deny dotfiles/backups; authorize exports; audit migration access.\n")

    def log_message(self, _format, *_args):
        return

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
