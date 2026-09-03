import assert from "node:assert/strict";
import test from "node:test";
import { hasRequiredServices } from "../controller/runtime.mjs";

const required = ["gateway", "recon-node", "internal", "toolbox"];

test("range is ready only when every required service is running", () => {
  assert.equal(hasRequiredServices(required.join("\n"), required), true);
  assert.equal(hasRequiredServices("gateway\nrecon-node\ntoolbox", required), false);
  assert.equal(hasRequiredServices("gateway\nrecon-node\ninternal\ntoolbox\nextra", required), true);
});
