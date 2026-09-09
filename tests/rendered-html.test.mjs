import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ts from "typescript";
import { readLearningMaterial } from "../controller/learning-material.mjs";

// Render the real workspace independently of the intentional signed-out gate.
const require = createRequire(import.meta.url);
function loadWorkspaceModule(name) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(`../app/labs/${name}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, { exports, require(id) {
    if (id.endsWith(".css")) return {};
    if (id === "next/link") return { default: (props) => createElement("a", props) };
    if (id === "../controller-client") return { controllerRequest: () => { throw new Error("SSR must not fetch"); } };
    if (id === "./terminal") return { LabTerminal: () => null };
    if (id.startsWith("./")) return loadWorkspaceModule(`${id.slice(2)}.${id === "./progress-requests" ? "ts" : "tsx"}`);
    return require(id);
  } });
  return exports;
}

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker(
    new Request(`http://127.0.0.1:5173${path}`, { headers: { accept: "text/html" } }),
  );
}

test("server-renders the RECON//LAB portal", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>RECON\/\/LAB — Beginner Security Investigations<\/title>/i);
  assert.match(html, /Sign in to your lab/);
  assert.match(html, /Connecting to your local lab/);
  assert.doesNotMatch(html, /Start orientation/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("rebuilt labs render inline scenarios, flag forms, individually closed hints and walkthrough", async () => {
  const response = await render("/labs");
  assert.equal(response.status, 200);
  const gated = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  assert.match(gated, /Sign in to your lab/);
  assert.doesNotMatch(gated, /class="workspace-task"/);
  const { LabWorkspace } = loadWorkspaceModule("workspace.tsx");
  const html = renderToStaticMarkup(createElement(LabWorkspace, { labs: readLearningMaterial() }));
  const visibleText = html.replace(/<!--.*?-->/g, "");
  for (const label of ["Your First Shift: Terminal Practice", "Scenario", "What you need to know", "Start / resume lab", "Submit flag 1", "Hints for this flag", "Reveal full walkthrough", "cat events.log", "Check your understanding", "Starting evidence", "Expected observation"]) assert.ok(visibleText.includes(label), label);
  assert.match(html, /<form\b/);
  assert.match(html, /<pre><code>/);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|\s|>)/);
  assert.doesNotMatch(html, /href="[^"]*(?:README\.md|SOLUTION\.md|file:\/\/)/i);
  assert.doesNotMatch(html, /RLAB\{[a-f0-9]{32}\}/);
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<!--.*?-->/g, "");
  const cards = [...markup.matchAll(/<section class="workspace-section workspace-task"[\s\S]*?<\/section>/g)].map((match) => match[0]);
  assert.equal(cards.length, 2);
  for (const [index, card] of cards.entries()) {
    const labels = ["Question", "Starting evidence", "Expected observation", "Hints for this flag", "Check your understanding", `Submit flag ${index + 1}`];
    const positions = labels.map((label) => card.indexOf(label));
    assert.ok(positions.every((position) => position >= 0));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
    assert.equal((card.match(/<details\b/g) ?? []).length, 3);
    assert.equal((card.match(/type="radio"/g) ?? []).length, 3);
    assert.match(card, /type="submit" disabled=""/);
    assert.doesNotMatch(card, /Reveal full walkthrough/);
  }
});

test("returning learners retain an explicitly labeled legacy entry point", async () => {
  const response = await render("/legacy");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Legacy modules/);
  assert.match(html, /Nothing has been reset or migrated/);
  assert.match(html, /Rules of Engagement/);
  assert.match(html, /href="\/"/);
});

test("starter preview is removed and project metadata is production-specific", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /export \{ default \} from "\.\/labs\/page"/);
  assert.match(layout, /RECON\/\/LAB/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});

test("portal renders the catalog hint body and selected walkthrough", async () => {
  const source = await readFile(new URL("../app/recon-lab.tsx", import.meta.url), "utf8");
  assert.match(source, /hint\.body/u);
  assert.match(source, /selected\.solution/u);
});

test("portal exposes configurable shared-range controls and toolbox", async () => {
  const [source, envExample] = await Promise.all([
    readFile(new URL("../app/recon-lab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);
  assert.match(source, /NEXT_PUBLIC_LAB_CONTROLLER_URL/u);
  assert.match(source, /NEXT_PUBLIC_LAB_TOOLBOX_URL/u);
  assert.match(source, /Open toolbox terminal/u);
  assert.match(source, /target="_blank"/u);
  assert.match(source, /rel="noreferrer"/u);
  assert.match(source, /Start shared range/u);
  assert.match(source, /Stop shared range/u);
  assert.match(source, /Reset shared range/u);
  assert.match(envExample, /NEXT_PUBLIC_LAB_CONTROLLER_URL=http:\/\/127\.0\.0\.1:3030/u);
  assert.match(envExample, /NEXT_PUBLIC_LAB_TOOLBOX_URL=http:\/\/127\.0\.0\.1:7681/u);
});
