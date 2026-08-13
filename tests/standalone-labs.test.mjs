import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const labsRoot = join(root, "standalone-labs");
const controller = join(root, "scripts", "standalone-labctl.mjs");
const idPattern = /^[a-z0-9](?:[a-z0-9-]{0,47}[a-z0-9])?$/;
const flagEnvPattern = /^[A-Z][A-Z0-9_]{1,63}$/;

async function discoverLabs() {
  const entries = await readdir(labsRoot, { withFileTypes: true });
  const labs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "_shared") continue;
    const directory = join(labsRoot, entry.name);
    const manifestPath = join(directory, "lab.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    labs.push({ ...manifest, directory, manifestPath });
  }
  return labs.sort((left, right) => left.id.localeCompare(right.id));
}

const labs = await discoverLabs();

function assertNonEmptyString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.trim().length > 0, `${label} must not be empty`);
}

function ipv4ToInteger(address) {
  const octets = address.split(".").map(Number);
  assert.equal(octets.length, 4, `${address} is not an IPv4 address`);
  for (const octet of octets) assert.ok(Number.isInteger(octet) && octet >= 0 && octet <= 255);
  return octets.reduce((value, octet) => value * 256 + octet, 0);
}

function cidrRange(cidr) {
  const [address, prefixText] = cidr.split("/");
  const prefix = Number(prefixText);
  assert.ok(Number.isInteger(prefix) && prefix >= 8 && prefix <= 30, `${cidr} has an unsafe prefix`);
  const size = 2 ** (32 - prefix);
  const integer = ipv4ToInteger(address);
  const start = Math.floor(integer / size) * size;
  return { start, end: start + size - 1 };
}

function assertAcyclicObjectives(lab) {
  const byId = new Map(lab.objectives.map((objective) => [objective.id, objective]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error(`${lab.id} objective dependency cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  assert.equal(visited.size, lab.objectives.length);
}

function buildContext(service) {
  if (typeof service.build === "string") return service.build;
  return service.build?.context;
}

test("the original portal catalog remains exactly 18 labs", async () => {
  const catalog = JSON.parse(await readFile(join(root, "data", "labs.json"), "utf8"));
  assert.equal(catalog.length, 18);
});

test("six standalone manifests have a complete, safe schema", () => {
  assert.equal(labs.length, 6);
  assert.equal(new Set(labs.map((lab) => lab.id)).size, labs.length);

  const globalFlags = [];
  for (const lab of labs) {
    assert.match(lab.id, idPattern);
    assert.equal(lab.id, lab.directory.split(sep).at(-1));
    assertNonEmptyString(lab.title, `${lab.id}.title`);
    assertNonEmptyString(lab.summary, `${lab.id}.summary`);
    assertNonEmptyString(lab.description, `${lab.id}.description`);
    assert.ok(["beginner", "intermediate", "advanced"].includes(lab.difficulty));
    assert.ok(Number.isInteger(lab.minutes) && lab.minutes > 0 && lab.minutes <= 180);
    assert.match(lab.subnet, /^172\.(?:2[8-9]|3[0-1])\.\d{1,3}\.0\/(?:24|25|26|27|28)$/u);
    assert.equal(lab.composeFile, "docker-compose.yml");
    assert.equal(lab.toolboxService, "toolbox");
    assert.ok(Array.isArray(lab.commandFamilies) && lab.commandFamilies.length > 0);
    assert.equal(new Set(lab.commandFamilies).size, lab.commandFamilies.length);
    for (const family of lab.commandFamilies) assertNonEmptyString(family, `${lab.id}.commandFamilies[]`);
    assert.ok(Array.isArray(lab.services) && lab.services.length >= 1);
    for (const service of lab.services) {
      if (typeof service === "string") assertNonEmptyString(service, `${lab.id}.services[]`);
      else {
        assertNonEmptyString(service.name, `${lab.id}.services[].name`);
        assertNonEmptyString(service.hostname, `${lab.id}.services[].hostname`);
        assertNonEmptyString(service.purpose, `${lab.id}.services[].purpose`);
        assert.ok(Array.isArray(service.ports) && service.ports.length > 0);
        for (const port of service.ports) assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
      }
    }

    assert.ok(Array.isArray(lab.objectives) && lab.objectives.length >= 2);
    assert.equal(new Set(lab.objectives.map((objective) => objective.id)).size, lab.objectives.length);
    const objectiveIds = new Set(lab.objectives.map((objective) => objective.id));
    for (const objective of lab.objectives) {
      assert.match(objective.id, idPattern);
      assertNonEmptyString(objective.title, `${lab.id}/${objective.id}.title`);
      assertNonEmptyString(objective.label, `${lab.id}/${objective.id}.label`);
      assert.ok(Number.isInteger(objective.points) && objective.points > 0);
      assert.match(objective.flagEnv, flagEnvPattern);
      assert.ok(Array.isArray(objective.dependsOn));
      assert.equal(new Set(objective.dependsOn).size, objective.dependsOn.length);
      assert.ok(objective.dependsOn.every((dependency) => objectiveIds.has(dependency)));
      assert.ok(!objective.dependsOn.includes(objective.id));
      globalFlags.push(objective.flagEnv);
    }
    assertAcyclicObjectives(lab);
  }
  assert.equal(new Set(globalFlags).size, globalFlags.length, "flagEnv names must be globally unique");
});

test("standalone subnets are unique and non-overlapping", () => {
  assert.equal(new Set(labs.map((lab) => lab.subnet)).size, labs.length);
  const ranges = labs.map((lab) => ({ id: lab.id, ...cidrRange(lab.subnet) }));
  for (let left = 0; left < ranges.length; left += 1) {
    for (let right = left + 1; right < ranges.length; right += 1) {
      assert.ok(
        ranges[left].end < ranges[right].start || ranges[right].end < ranges[left].start,
        `${ranges[left].id} and ${ranges[right].id} have overlapping subnets`,
      );
    }
  }
});

test("each lab has its expected standalone files and contained build contexts", async () => {
  for (const lab of labs) {
    for (const name of ["README.md", "docker-compose.yml", "lab.json", "smoke.sh"]) {
      assert.ok(existsSync(join(lab.directory, name)), `${lab.id} is missing ${name}`);
    }
    const readme = await readFile(join(lab.directory, "README.md"), "utf8");
    assert.ok(readme.length >= 500, `${lab.id} README is too small to be a useful walkthrough`);

    const compose = loadYaml(await readFile(join(lab.directory, "docker-compose.yml"), "utf8"));
    for (const [serviceName, service] of Object.entries(compose.services)) {
      const context = buildContext(service);
      assertNonEmptyString(context, `${lab.id}/${serviceName}.build.context`);
      const contextPath = resolve(lab.directory, context);
      const pathFromRoot = relative(labsRoot, contextPath);
      assert.ok(pathFromRoot && !pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== "..");
      const dockerfile = typeof service.build === "object" && service.build.dockerfile
        ? service.build.dockerfile
        : "Dockerfile";
      assert.ok(existsSync(join(contextPath, dockerfile)), `${lab.id}/${serviceName} build Dockerfile is missing`);
    }
  }
});

test("Compose topologies keep every target internal and hardened", async () => {
  for (const lab of labs) {
    const compose = loadYaml(await readFile(join(lab.directory, "docker-compose.yml"), "utf8"));
    assert.equal(typeof compose.services, "object");
    assert.ok(compose.services.toolbox, `${lab.id} must define a toolbox`);
    assert.ok(Object.keys(compose.services).length >= 2, `${lab.id} must define at least one target`);
    assert.equal(typeof compose.networks, "object");

    const declaredNetworks = Object.entries(compose.networks);
    assert.ok(declaredNetworks.length >= 1);
    for (const [networkName, network] of declaredNetworks) {
      assert.equal(network.internal, true, `${lab.id}/${networkName} must be internal`);
      assert.notEqual(network.external, true);
    }
    const composeSubnets = declaredNetworks.flatMap(([, network]) =>
      (network.ipam?.config ?? []).map((config) => config.subnet),
    );
    assert.deepEqual(composeSubnets, [lab.subnet], `${lab.id} Compose subnet must match lab.json`);

    const flagNames = lab.objectives.map((objective) => objective.flagEnv);
    const targetEnvironmentNames = new Set();
    for (const [serviceName, service] of Object.entries(compose.services)) {
      assert.equal(service.read_only, true, `${lab.id}/${serviceName} must be read-only`);
      assert.ok(service.cap_drop?.includes("ALL"), `${lab.id}/${serviceName} must drop all capabilities`);
      assert.ok(
        service.security_opt?.includes("no-new-privileges:true"),
        `${lab.id}/${serviceName} must set no-new-privileges`,
      );
      assert.notEqual(service.network_mode, "host");
      assert.notEqual(service.pid, "host");
      const serviceNetworks = Array.isArray(service.networks)
        ? service.networks
        : Object.keys(service.networks ?? {});
      assert.ok(serviceNetworks.length >= 1, `${lab.id}/${serviceName} must join an internal lab network`);
      assert.ok(serviceNetworks.every((name) => Object.hasOwn(compose.networks, name)));

      if (serviceName !== "toolbox") {
        assert.equal(service.ports, undefined, `${lab.id}/${serviceName} must not publish target ports`);
        for (const name of Object.keys(service.environment ?? {})) targetEnvironmentNames.add(name);
      } else {
        const context = buildContext(service).replaceAll("\\", "/");
        assert.match(context, /\.\.\/_shared\/toolbox$/u);
        for (const name of flagNames) {
          assert.ok(!Object.hasOwn(service.environment ?? {}, name), `${lab.id} leaks ${name} to toolbox`);
        }
        for (const published of service.ports ?? []) {
          if (typeof published === "string") assert.match(published, /^127\.0\.0\.1:/u);
          else assert.equal(published.host_ip, "127.0.0.1");
        }
      }
    }
    for (const name of flagNames) {
      assert.ok(targetEnvironmentNames.has(name), `${lab.id} does not inject ${name} into a target`);
    }
  }
});

test("shared toolbox has the required tools and non-root identity", async () => {
  const dockerfile = await readFile(join(labsRoot, "_shared", "toolbox", "Dockerfile"), "utf8");
  const requiredPackages = [
    "nmap",
    "dnsutils",
    "curl",
    "jq",
    "iproute2",
    "netcat-openbsd",
    "bind9-dnsutils",
    "coreutils",
    "findutils",
    "gawk",
    "grep",
    "sed",
    "tar",
    "binutils",
    "file",
    "less",
    "ttyd",
  ];
  for (const packageName of requiredPackages) assert.match(dockerfile, new RegExp(`\\b${packageName}\\b`, "u"));
  assert.match(dockerfile, /useradd[^\n]*--uid 10001/u);
  assert.match(dockerfile, /USER 10001:10001/u);
  assert.ok(existsSync(join(labsRoot, "_shared", "toolbox", "lab-scope")));
  assert.ok(existsSync(join(labsRoot, "_shared", "toolbox", "welcome.txt")));
});

test("controller lists only discovered labs and rejects path/argument injection", () => {
  const listed = spawnSync(process.execPath, [controller, "list"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  assert.equal(listed.status, 0, listed.stderr);
  for (const lab of labs) assert.match(listed.stdout, new RegExp(`\\b${lab.id}\\b`, "u"));

  for (const maliciousId of ["../docker-compose.yml", "--project-directory", "01-network-triage;whoami"]) {
    const rejected = spawnSync(process.execPath, [controller, "status", maliciousId], {
      cwd: root,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, /safe lab-id is required|Unknown lab/u);
  }

  const extraArgument = spawnSync(
    process.execPath,
    [controller, "status", labs[0].id, "--project-name", "attacker"],
    { cwd: root, encoding: "utf8", shell: false, windowsHide: true },
  );
  assert.equal(extraArgument.status, 2);
  assert.match(extraArgument.stderr, /too many arguments|accepts only/u);
});
