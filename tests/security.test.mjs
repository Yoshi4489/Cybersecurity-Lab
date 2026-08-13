import assert from "node:assert/strict";
import test from "node:test";
import { createFlag, equalSecret, isAllowedHost, isAllowedOrigin, isLoopbackAddress, parseCookies } from "../controller/security.mjs";

test("flags are deterministic per run and rotate between runs", () => {
  const first = createFlag("secret", "ssrf-pivot", "ssrf-proof", "run-a");
  assert.match(first, /^RLAB\{[a-f0-9]{24}\}$/);
  assert.equal(first, createFlag("secret", "ssrf-pivot", "ssrf-proof", "run-a"));
  assert.notEqual(first, createFlag("secret", "ssrf-pivot", "ssrf-proof", "run-b"));
});

test("constant-time equality handles mismatched lengths", () => {
  assert.equal(equalSecret("abc", "abc"), true);
  assert.equal(equalSecret("abc", "abcd"), false);
  assert.equal(equalSecret("abc", "abd"), false);
});

test("controller boundary only accepts loopback host and explicit origins", () => {
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress("192.168.1.10"), false);
  assert.equal(isAllowedHost("127.0.0.1:3030"), true);
  assert.equal(isAllowedHost("0.0.0.0:3030"), false);
  assert.equal(isAllowedOrigin("http://127.0.0.1:5173", ["http://127.0.0.1:5173"]), true);
  assert.equal(isAllowedOrigin("https://attacker.invalid", ["http://127.0.0.1:5173"]), false);
});

test("cookie parser keeps exact session value", () => {
  assert.deepEqual(parseCookies("theme=dark; rlab_session=a%2Fb; empty="), { theme: "dark", rlab_session: "a/b", empty: "" });
});
