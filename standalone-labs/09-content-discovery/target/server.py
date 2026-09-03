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

INDEX = (
    "<!doctype html>\n"
    "<html><head><title>ops-archive</title></head>\n"
    "<body>\n"
    "  <h1>ops-archive</h1>\n"
    "  <p>Internal archive portal. Nothing to see here.</p>\n"
    "  <!-- TODO before launch: delete config.php.bak left over from the migration -->\n"
    "</body></html>\n"
)

ROBOTS = (
    "User-agent: *\n"
    "Disallow: /server-status\n"
    "Disallow: /.git/\n"
    "# ops: build and status details are exposed at /server-status\n"
)

SERVER_STATUS = (
    "archive-portal status: ok\n"
    "uptime: synthetic\n"
    f"robots_token={ROBOTS_TOKEN}\n"
    f"objective_flag={ROBOTS_FLAG}\n"
)

GIT_CONFIG = (
    "[core]\n"
    "\trepositoryformatversion = 0\n"
    "\tbare = false\n"
    '[remote "origin"]\n'
    "\turl = https://ci-bot@vcs.range.test/ops/archive.git\n"
    "[lab]\n"
    f"\tgit_token = {GIT_TOKEN}\n"
    f"\tobjective_flag = {GITLEAK_FLAG}\n"
)

CONFIG_BAK = (
    "<?php\n"
    "/* leftover migration backup - rotate before launch, tokens are synthetic */\n"
    "$config = [\n"
    "  'db_host' => '127.0.0.1',\n"
    f"  # backup_token={BACKUP_TOKEN}\n"
    f"  # objective_flag={BACKUP_FLAG}\n"
    "];\n"
)

SITEMAP = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    "  <url><loc>http://web-archive:8080/</loc></url>\n"
    "  <url><loc>http://web-archive:8080/config.php</loc></url>\n"
    "</urlset>\n"
)


class Handler(BaseHTTPRequestHandler):
    server_version = "ArchivePortal/1.9"

    def reply(self, status, body, content_type="text/plain; charset=utf-8"):
        payload = body if isinstance(body, bytes) else body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Lab-Scope", "172.31.9.0/24")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self.reply(200, "ok\n")
        elif path == "/":
            self.reply(200, INDEX, "text/html; charset=utf-8")
        elif path == "/robots.txt":
            self.reply(200, ROBOTS)
        elif path == "/server-status":
            self.reply(200, SERVER_STATUS)
        elif path == "/.git/config":
            self.reply(200, GIT_CONFIG)
        elif path == "/config.php.bak":
            self.reply(200, CONFIG_BAK)
        elif path == "/sitemap.xml":
            self.reply(200, SITEMAP, "application/xml; charset=utf-8")
        else:
            self.reply(404, "not found\n")

    def do_POST(self):
        if urlparse(self.path).path != "/final":
            self.reply(404, "not found\n")
            return
        size = min(int(self.headers.get("Content-Length", "0")), 8192)
        form = parse_qs(self.rfile.read(size).decode(errors="replace"))
        supplied = {
            "robots": form.get("robots", [""])[0],
            "git": form.get("git", [""])[0],
            "backup": form.get("backup", [""])[0],
        }
        expected = {
            "robots": ROBOTS_TOKEN,
            "git": GIT_TOKEN,
            "backup": BACKUP_TOKEN,
        }
        if supplied != expected:
            self.reply(403, "discovery chain rejected\n")
            return
        self.reply(200, f"final_flag={FINAL_FLAG}\n")

    def log_message(self, fmt, *args):
        print(f"web-archive {self.address_string()} {fmt % args}", flush=True)


ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
