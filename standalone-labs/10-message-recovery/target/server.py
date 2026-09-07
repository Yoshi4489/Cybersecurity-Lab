import base64
import codecs
import hashlib
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


FLAGS = {name: os.environ[f"FLAG_L10_{name.upper()}"] for name in ("base64", "hex", "rot13", "md5", "message")}
WORDS = ["copper-river", "paper-lantern", "quiet-orbit", "blue-compass", "silver-meadow"]
# Deliberately weak, fictional training data, never an account credential.
PASSWORD = WORDS[1]
DIGEST = hashlib.md5(PASSWORD.encode(), usedforsecurity=False).hexdigest()
TOKENS = {stage: hashlib.sha256(FLAGS[stage].encode()).hexdigest()[:16] for stage in ("base64", "hex", "rot13")}


def message(stage, next_path):
    return f"case=NS-M10\nobjective_flag={FLAGS[stage]}\nnext={next_path}\n".encode()


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        payload = (json.dumps(body) + "\n").encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/health":
            return self.reply(200, {"ok": True})
        if url.path == "/":
            return self.reply(200, {"case": "NS-M10", "brief": "Recover a synthetic training handover. Start at /brief. Each decoded next path leads to another exhibit. All flags belong to this local run."})
        if url.path == "/brief":
            content = message("base64", f"/hex?token={TOKENS['base64']}")
            return self.reply(200, {"format": "base64", "payload": base64.b64encode(content).decode()})
        stages = {"/hex": "base64", "/rot13": "hex", "/dictionary": "rot13"}
        if url.path not in stages:
            return self.reply(404, {"error": "Unknown exhibit. Follow the decoded next path."})
        token = parse_qs(url.query).get("token", [""])
        if token != [TOKENS[stages[url.path]]]:
            return self.reply(403, {"error": "Use the exact next path recovered from the preceding exhibit."})
        if url.path == "/hex":
            content = message("hex", f"/rot13?token={TOKENS['hex']}")
            return self.reply(200, {"format": "hex", "payload": content.hex()})
        if url.path == "/rot13":
            content = message("rot13", f"/dictionary?token={TOKENS['rot13']}").decode()
            return self.reply(200, {"format": "rot13", "payload": codecs.encode(content, "rot_13")})
        return self.reply(200, {
            "algorithm": "md5", "digest": DIGEST, "candidates": WORDS,
            "instructions": "Hash each UTF-8 candidate without a trailing newline; compare with digest. This is guessing and comparison, not decryption. Only use this five-word synthetic list.",
            "next": "/unlock", "case_token": TOKENS["rot13"],
        })

    def do_POST(self):
        if urlparse(self.path).path != "/unlock":
            return self.reply(404, {"error": "Unknown route"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 4096:
                return self.reply(400, {"error": "Expected a small JSON object"})
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict) or not all(isinstance(body.get(key), str) for key in ("password", "case_token")):
                return self.reply(400, {"error": "password and case_token must be strings"})
        except (ValueError, UnicodeError):
            return self.reply(400, {"error": "Malformed JSON request"})
        if not hmac.compare_digest(body["case_token"].encode(), TOKENS["rot13"].encode()) or not hmac.compare_digest(body["password"].encode(), PASSWORD.encode()):
            return self.reply(403, {"error": "Evidence did not match the synthetic dictionary record"})
        plaintext = f"case=NS-M10\nmessage=Encoding is not secrecy. Close the training handover.\nobjective_flag={FLAGS['message']}\n".encode()
        key = PASSWORD.encode()
        ciphertext = bytes(value ^ key[index % len(key)] for index, value in enumerate(plaintext))
        self.reply(200, {
            "objective_flag": FLAGS["md5"], "cipher": "repeating-key XOR (insecure teaching example)",
            "ciphertext_hex": ciphertext.hex(), "plaintext_sha256": hashlib.sha256(plaintext).hexdigest(),
            "instructions": "Hex-decode ciphertext, then XOR each byte with the repeating UTF-8 password bytes. Verify SHA-256 of recovered bytes. The decrypted objective_flag is the final flag. This is not modern authenticated encryption.",
        })

    def log_message(self, fmt, *args):
        # Do not log query tokens or request bodies.
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
