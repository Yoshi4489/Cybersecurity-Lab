import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { cidrsOverlap, extractCidrs, extractLinuxRouteCidrs, extractWindowsRouteCidrs, findCidrOverlaps, meetsMinimum, parseCidr, parseVersion } from "../scripts/doctor.mjs";

test("parseVersion extracts semantic version components", () => {
  assert.deepEqual(parseVersion("v22.13.0"), [22, 13, 0]);
});

test("meetsMinimum compares version components in order", () => {
  assert.equal(meetsMinimum([22, 13, 0], [22, 13, 0]), true);
  assert.equal(meetsMinimum([22, 12, 9], [22, 13, 0]), false);
  assert.equal(meetsMinimum([24, 0, 0], [22, 13, 0]), true);
});

test("parseCidr normalizes an IPv4 network to its address range", () => {
  assert.deepEqual(parseCidr("172.28.1.23/24"), { start: 2887516416, end: 2887516671, prefix: 24 });
});

test("cidrsOverlap identifies intersecting and disjoint IPv4 ranges", () => {
  assert.equal(cidrsOverlap("172.28.1.0/24", "172.28.1.128/25"), true);
  assert.equal(cidrsOverlap("172.28.1.0/24", "172.28.2.0/24"), false);
});

test("extractCidrs reads declared Compose subnets", () => {
  assert.deepEqual(extractCidrs("networks:\n  range:\n    ipam:\n      config:\n        - subnet: 172.28.1.0/24\n"), ["172.28.1.0/24"]);
});

test("findCidrOverlaps reports only declared ranges that collide", () => {
  assert.deepEqual(
    findCidrOverlaps(["172.28.1.0/24", "172.31.8.0/24"], ["172.28.0.0/16", "10.0.0.0/8"]),
    [{ declared: "172.28.1.0/24", existing: "172.28.0.0/16" }],
  );
});

test("extractWindowsRouteCidrs ignores the default route", () => {
  assert.deepEqual(
    extractWindowsRouteCidrs("  0.0.0.0          0.0.0.0      192.168.1.1    192.168.1.10     25\n  172.28.0.0    255.255.0.0         On-link     172.28.0.1    266"),
    ["172.28.0.0/16"],
  );
});

test("extractLinuxRouteCidrs ignores default route spellings", () => {
  assert.deepEqual(
    extractLinuxRouteCidrs("default via 192.168.1.1 dev eth0\n0.0.0.0/0 via 192.168.1.1 dev eth0\n172.28.0.0/16 dev docker0 proto kernel scope link"),
    ["172.28.0.0/16"],
  );
});

test("package exposes the doctor command", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts.doctor, "node scripts/doctor.mjs");
});
