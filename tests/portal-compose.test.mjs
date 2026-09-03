import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { load as loadYaml } from "js-yaml";
import test from "node:test";

const requiredServices = ["gateway", "recon-node", "internal", "toolbox", "toolbox-ingress"];

test("controller waits for the exact shared-range services", async () => {
  const source = await readFile(new URL("../controller/server.mjs", import.meta.url), "utf8");
  assert.match(source, /hasRequiredServices/u);
  assert.match(source, /\["up", "-d", "--build", "--wait", "--wait-timeout", "300", \.\.\.requiredServices\]/u);
  assert.match(source, /const requiredServices = \["gateway", "recon-node", "internal", "toolbox", "toolbox-ingress"\]/u);
});

test("root toolbox uses an available web terminal server", async () => {
  const dockerfile = await readFile(new URL("../toolbox/Dockerfile", import.meta.url), "utf8");
  assert.match(dockerfile, /shellinabox/u);
  assert.doesNotMatch(dockerfile, /\bttyd\b/u);
  assert.match(dockerfile, /CMD \["shellinaboxd"/u);
});

test("toolbox only joins internal target networks; ingress is the loopback-only bridge", async () => {
  const compose = loadYaml(await readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"));
  for (const networkName of compose.services.toolbox.networks) {
    assert.equal(compose.networks[networkName]?.internal, true, `${networkName} must be internal`);
  }
  assert.deepEqual(compose.services["toolbox-ingress"].networks.sort(), ["toolbox_access", "toolbox_ingress"].sort());
  assert.equal(compose.networks.toolbox_access?.internal, true);
  assert.notEqual(compose.networks.toolbox_ingress?.internal, true);
  assert.deepEqual(compose.services["toolbox-ingress"].ports, ["127.0.0.1:7681:8082"]);
});

test("every shared-range service has a Compose healthcheck", async () => {
  const compose = loadYaml(await readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(compose.services).sort(), [...requiredServices].sort());
  for (const serviceName of requiredServices) {
    assert.ok(compose.services[serviceName].healthcheck, `${serviceName} must have a healthcheck`);
  }
});
