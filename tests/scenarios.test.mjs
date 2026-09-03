import assert from "node:assert/strict";
import test from "node:test";
import { acceptsUnsafeUpload, decodeJwtUnsafe, hasTrainingSession } from "../lab-target/scenarios.mjs";

test("CSRF scenario requires the training session cookie", () => {
  assert.equal(hasTrainingSession("northstar_session=student-session"), true);
  assert.equal(hasTrainingSession("theme=dark"), false);
});

test("JWT simulator decodes header and payload segments", () => {
  const token = "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYWRtaW4ifQ.";
  assert.deepEqual(decodeJwtUnsafe(token), {
    header: { alg: "none" },
    payload: { role: "admin" },
  });
});

test("upload scenario accepts only a double-extension JPEG metadata pair", () => {
  assert.equal(acceptsUnsafeUpload("avatar.jpg.php", "image/jpeg"), true);
  assert.equal(acceptsUnsafeUpload("avatar.php", "image/jpeg"), false);
  assert.equal(acceptsUnsafeUpload("avatar.jpg.php", "application/x-httpd-php"), false);
});
