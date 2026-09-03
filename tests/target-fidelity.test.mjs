import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const gatewaySource = await readFile(new URL("../lab-target/gateway.mjs", import.meta.url), "utf8");
const internalSource = await readFile(new URL("../lab-target/internal.mjs", import.meta.url), "utf8");

test("content backup provides the authentication and internal-service breadcrumbs", () => {
  assert.match(gatewaySource, /ACCOUNT_CANDIDATE=ops\.admin/u);
  assert.match(gatewaySource, /INTERNAL_SERVICE=http:\/\/internal:8081/u);
});

test("gateway models authenticated CSRF state using request cookies", () => {
  assert.match(gatewaySource, /\/account\/session/u);
  assert.match(gatewaySource, /Set-Cookie/u);
  assert.match(gatewaySource, /hasTrainingSession\(request\.headers\.cookie\)/u);
  assert.match(gatewaySource, /transferCount \+= 1/u);
});

test("gateway distinguishes unsigned JWT and header-based upload paths", () => {
  assert.match(gatewaySource, /decodeJwtUnsafe\(values\.token\)/u);
  assert.match(gatewaySource, /method: "unsigned-jwt"/u);
  assert.match(gatewaySource, /request\.headers\["x-filename"\]/u);
  assert.match(gatewaySource, /acceptsUnsafeUpload\(filename, contentType\)/u);
});

test("internal service exposes a discoverable index and separate capstone receipt", () => {
  assert.match(internalSource, /routes.*\/admin\/proof/u);
  assert.match(internalSource, /receiptPath/u);
  assert.doesNotMatch(internalSource, /remediationReceipt.*capstone_chain/u);
  assert.match(internalSource, /\/admin\/capstone\/report/u);
  assert.match(gatewaySource, /admin\\\/capstone\\\/report/u);
});
