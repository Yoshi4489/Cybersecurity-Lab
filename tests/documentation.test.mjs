import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("design record describes the single-user local range", async () => {
  const design = await read("../DESIGN.md");
  assert.match(design, /single-user local range/i);
  assert.match(design, /portal shared range/i);
  assert.match(design, /standalone labs:[\s\S]*independent compose project/i);
  assert.match(design, /multi-user hosting/i);
  assert.match(design, /anti-cheat/i);
  assert.doesNotMatch(design, /playlist|album|now-playing/i);
});

test("threat model documents local flag visibility and containment", async () => {
  const threatModel = await read("../docs/THREAT-MODEL.md");
  assert.match(threatModel, /progress consistency.*not secrecy/i);
  assert.match(threatModel, /source,[\s\S]*runtime env files,[\s\S]*containers,[\s\S]*smoke scripts/i);
  assert.match(threatModel, /standalone targets.*only their own flags/i);
  assert.match(threatModel, /portal.*all-flags.*shared simulator/i);
  assert.match(threatModel, /protect the host and external networks/i);
});

test("readmes link the threat model and describe range lifecycle", async () => {
  const [rootReadme, standaloneReadme] = await Promise.all([
    read("../README.md"),
    read("../standalone-labs/README.md"),
  ]);
  for (const readme of [rootReadme, standaloneReadme]) {
    assert.match(readme, /\[.*threat model.*\]\([^)]*docs\/THREAT-MODEL\.md\)/i);
  }
  assert.match(rootReadme, /18 portal modules share the same local target range/i);
  assert.match(rootReadme, /affect every portal module/i);
  assert.match(rootReadme, /http:\/\/127\.0\.0\.1:7681/i);
});

test("standalone documentation publishes the recommended learning order", async () => {
  const [standaloneReadme, gettingStarted] = await Promise.all([
    read("../standalone-labs/README.md"),
    read("../standalone-labs/GETTING-STARTED.md"),
  ]);
  for (const document of [standaloneReadme, gettingStarted]) {
    assert.match(document, /01\s*→\s*02\s*→\s*03\s*→\s*04\s*→\s*05\s*→\s*06\s*→\s*07\s*→\s*08\s*→\s*09/u);
    assert.match(document, /numeric prefixes?[\s\S]*stable IDs?/i);
    assert.match(document, /06[\s\S]*09[\s\S]*capstones/i);
  }
});

test("setup guides tell learners to run doctor before installation and startup", async () => {
  const [rootReadme, gettingStarted] = await Promise.all([
    read("../README.md"),
    read("../standalone-labs/GETTING-STARTED.md"),
  ]);
  for (const document of [rootReadme, gettingStarted]) {
    const doctor = document.indexOf("npm run doctor");
    assert.ok(doctor >= 0);
    assert.ok(doctor < document.indexOf("npm install"));
    const startup = Math.min(
      ...["npm run lab\n", "npm run labs:start"].map((command) => document.indexOf(command)).filter((index) => index >= 0),
    );
    assert.ok(doctor < startup);
  }
});
