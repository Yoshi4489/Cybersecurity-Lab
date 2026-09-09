import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFile = promisify(execFileCallback);
const minimumNodeVersion = [22, 13, 0];
const ports = [3030, 5173, 7681, 8080];
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseVersion(value) {
  const match = String(value).match(/\bv?(\d+)\.(\d+)\.(\d+)/u);
  return match ? match.slice(1).map(Number) : null;
}

export function meetsMinimum(version, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if (version[index] !== minimum[index]) return version[index] > minimum[index];
  }
  return true;
}

export function parseCidr(value) {
  const match = String(value).trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d|[12]\d|3[0-2])$/u);
  if (!match) return null;

  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((octet) => octet > 255)) return null;

  const address = octets.reduce((result, octet) => ((result * 256) + octet), 0);
  const size = 2 ** (32 - prefix);
  const start = Math.floor(address / size) * size;
  return { start, end: start + size - 1, prefix };
}

export function cidrsOverlap(left, right) {
  const leftRange = parseCidr(left);
  const rightRange = parseCidr(right);
  return Boolean(leftRange && rightRange && leftRange.start <= rightRange.end && rightRange.start <= leftRange.end);
}

export function extractCidrs(value) {
  return [...String(value).matchAll(/\bsubnet:\s*["']?((?:\d{1,3}\.){3}\d{1,3}\/\d{1,2})/gu)]
    .map((match) => match[1])
    .filter((cidr) => parseCidr(cidr));
}

export function findCidrOverlaps(declaredCidrs, existingCidrs) {
  return declaredCidrs.flatMap((declared) => existingCidrs
    .filter((existing) => cidrsOverlap(declared, existing))
    .map((existing) => ({ declared, existing })));
}

export function extractWindowsRouteCidrs(value) {
  return String(value).split(/\r?\n/u).flatMap((line) => {
    const match = line.match(/^\s*((?:\d{1,3}\.){3}\d{1,3})\s+((?:\d{1,3}\.){3}\d{1,3})\s+/u);
    if (!match) return [];
    const [address, mask] = match.slice(1);
    const maskValue = mask.split(".").map(Number).reduce((result, octet) => (result * 256) + octet, 0);
    const bits = maskValue.toString(2).padStart(32, "0");
    if (!/^(1*0*)$/u.test(bits)) return [];
    const prefix = bits.indexOf("0") === -1 ? 32 : bits.indexOf("0");
    if (prefix === 0) return [];
    return [`${address}/${prefix}`];
  }).filter((cidr) => parseCidr(cidr));
}

async function runCommand(command, args) {
  const { stdout, stderr } = await execFile(command, args, { windowsHide: true });
  return `${stdout}${stderr}`.trim();
}

async function canBind(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => server.close(() => resolve(true)));
  });
}

async function declaredStandaloneCidrs() {
  const labsRoot = path.join(repositoryRoot, "standalone-labs");
  const entries = await fs.readdir(labsRoot, { withFileTypes: true });
  const composeFiles = entries.filter((entry) => entry.isDirectory() && /^\d{2}-/u.test(entry.name))
    .map((entry) => path.join(labsRoot, entry.name, "docker-compose.yml"));
  const contents = await Promise.all(composeFiles.map((file) => fs.readFile(file, "utf8")));
  return [...new Set(contents.flatMap(extractCidrs))];
}

async function dockerNetworkCidrs() {
  const ids = (await runCommand("docker", ["network", "ls", "--quiet"]))
    .split(/\r?\n/u).filter(Boolean);
  if (ids.length === 0) return [];
  const networks = JSON.parse(await runCommand("docker", ["network", "inspect", ...ids]));
  return [...new Set(networks.flatMap((network) => network.IPAM?.Config ?? [])
    .map((config) => config.Subnet)
    .filter((cidr) => parseCidr(cidr)))];
}

export function extractLinuxRouteCidrs(value) {
  return String(value).split(/\r?\n/u).flatMap((line) => {
    const destination = line.trim().split(/\s+/u)[0];
    if (destination === "default" || destination === "0.0.0.0/0") return [];
    return [destination.includes("/") ? destination : `${destination}/32`];
  }).filter((cidr) => parseCidr(cidr));
}

async function hostRouteCidrs() {
  if (process.platform === "win32") {
    return extractWindowsRouteCidrs(await runCommand("route", ["print", "-4"]));
  }
  return extractLinuxRouteCidrs(await runCommand("ip", ["-o", "-4", "route", "show"]));
}

function report(name, passed, detail = "") {
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  return passed;
}

async function checkCommand(name, command, args) {
  try {
    const output = await runCommand(command, args);
    return report(name, true, output.split(/\r?\n/u)[0]);
  } catch (error) {
    return report(name, false, error.message);
  }
}

export async function runDoctor() {
  const results = [];
  const nodeVersion = parseVersion(process.version);
  results.push(report("Node.js >= 22.13", Boolean(nodeVersion && meetsMinimum(nodeVersion, minimumNodeVersion)), process.version));
  results.push(await checkCommand("Docker executable/version", "docker", ["--version"]));
  results.push(await checkCommand("Docker Compose version", "docker", ["compose", "version"]));
  results.push(await checkCommand("Docker Engine", "docker", ["info"]));

  for (const port of ports) {
    results.push(report(`127.0.0.1:${port} is available`, await canBind(port)));
  }

  try {
    const [declared, dockerNetworks, routes] = await Promise.all([
      declaredStandaloneCidrs(),
      dockerNetworkCidrs(),
      hostRouteCidrs(),
    ]);
    const instancePool = process.env.LAB_INSTANCE_POOL_CIDR ?? "10.240.0.0/16";
    const collisions = findCidrOverlaps(declared, [...dockerNetworks, ...routes]);
    const pool = parseCidr(instancePool);
    const available = pool && pool.prefix >= 16 && pool.prefix <= 24 && Array.from({ length: 2 ** (24 - pool.prefix) }, (_, index) => {
      const start = pool.start + index * 256;
      return [24, 16, 8, 0].map((shift) => Math.floor(start / 2 ** shift) % 256).join(".") + "/24";
    }).some((subnet) => ![...dockerNetworks, ...routes].some((route) => cidrsOverlap(subnet, route)));
    results.push(report("Instance address pool has an available /24", Boolean(available), instancePool));
    results.push(report(
      "Standalone lab subnets do not overlap Docker networks or host routes",
      collisions.length === 0,
      collisions.length === 0 ? `${declared.length} declared subnet(s) checked` : collisions.map(({ declared: lab, existing }) => `${lab} overlaps ${existing}`).join("; "),
    ));
  } catch (error) {
    results.push(report("Standalone lab subnets do not overlap Docker networks or host routes", false, error.message));
  }

  return results.every(Boolean) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runDoctor();
}
