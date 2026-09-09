import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, cpSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { openAccounts } from "../controller/accounts.mjs";
import { createInstances } from "../controller/instances.mjs";
import { loadLabs } from "./standalone-labctl.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "reconlab-browser-check-"));
cpSync(join(project, "data"), join(root, "data"), { recursive: true });
cpSync(join(project, "standalone-labs", "_shared"), join(root, "standalone-labs", "_shared"), { recursive: true });
for (const name of ["app", "controller", "scripts", "standalone-labs", "public", "package.json", "vite.config.ts", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) cpSync(join(project, name), join(root, name), { recursive: true, filter: (path) => !path.includes(".runtime") });
symlinkSync(join(project, "node_modules"), join(root, "node_modules"), "junction");
const accounts = openAccounts(join(root, ".lab", "accounts.sqlite"));
const created = accounts.createUser("browser-admin", "admin");
const learner = accounts.createUser("browser-learner");
const instances = createInstances(accounts, new Map(loadLabs().map((lab) => [lab.id, lab])), root);
const env = { ...process.env, LAB_PROJECT_ROOT: root, LAB_CONTROLLER_PORT: "3032", LAB_TARGET_PORT: "3033", LAB_INSTANCE_POOL_CIDR: "10.241.0.0/16", LAB_ALLOWED_ORIGINS: "http://127.0.0.1:5174", NEXT_PUBLIC_LAB_CONTROLLER_URL: "http://127.0.0.1:3032" };
const children = [];
let browser;
function start(args) {
  const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  children.push(child);
  child.stderr.on("data", (data) => process.stderr.write(data)); child.stdout.on("data", (data) => process.stdout.write(data));
  return child;
}
async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* Starting */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not start: ${url}`);
}
async function signIn(page, account) {
  await page.goto("http://127.0.0.1:5174");
  await page.getByLabel("Username", { exact: true }).fill(account.user.username);
  await page.getByLabel("Password", { exact: true }).fill(account.temporaryPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Current or temporary password").fill(account.temporaryPassword);
  await page.getByLabel("New password").fill("browser-test-password");
  await page.getByRole("button", { name: "Save password" }).click();
  await page.getByLabel("Password", { exact: true }).fill("browser-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "Your instance" }).waitFor();
}
async function running(user, lab) {
  for (let i = 0; i < 600; i++) {
    const run = instances.get(user, lab);
    if (run?.runtime === "running") return run;
    if (run?.error) throw new Error(run.error);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Instance startup timed out");
}
try {
  start([join(project, "controller", "server.mjs")]);
  start([join(project, "node_modules", "vinext", "dist", "cli.js"), "dev", "--hostname", "127.0.0.1", "--port", "5174"]);
  await waitFor("http://127.0.0.1:3032/api/session");
  await waitFor("http://127.0.0.1:5174");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext(); context.setDefaultTimeout(30000); const page = await context.newPage();
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, created);
  await page.getByRole("button", { name: "Start / resume lab", exact: true }).click();
  const run = await running(created.user.id, "00-terminal-basics");
  await page.getByText("Connected. Commands run inside your lab toolbox.", { exact: true }).waitFor({ timeout: 30000 });
  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.type("printf 'BROWSER_%s\\n' 'TERMINAL_OK'");
  await page.locator(".xterm-helper-textarea").press("Enter");
  await expect(page.locator(".xterm-accessibility-tree")).toContainText("BROWSER_TERMINAL_OK");
  await page.getByRole("button", { name: "Reconnect terminal", exact: true }).click();
  await page.getByText("Connected. Commands run inside your lab toolbox.", { exact: true }).waitFor({ timeout: 15000 });
  const task = page.locator(".workspace-task").first();
  if (process.env.LAB_BROWSER_SCREENSHOTS === "1") {
    const screenshots = join(project, ".lab", "qa"); mkdirSync(screenshots, { recursive: true });
    await page.screenshot({ path: join(screenshots, "workspace.png") });
    await task.screenshot({ path: join(screenshots, "task-card.png") });
  }
  await task.getByRole("radio").first().check();
  await task.getByRole("button", { name: "Check answer" }).click();
  await task.getByRole("textbox").fill(JSON.parse(run.flags).FLAG_L00_NOTE);
  await task.getByRole("button", { name: "Submit flag 1", exact: true }).click();
  await task.getByText("Flag verified and saved for this run.", { exact: true }).or(task.getByText("Correct — objective verified and saved.", { exact: true })).waitFor();
  await page.getByRole("button", { name: "Extend 30 minutes", exact: true }).click();
  await expect.poll(() => instances.get(created.user.id, "00-terminal-basics").extended).toBe(1);
  const otherContext = await browser.newContext(); otherContext.setDefaultTimeout(30000); const otherPage = await otherContext.newPage();
  await signIn(otherPage, learner);
  await otherPage.getByRole("button", { name: "Start / resume lab", exact: true }).click();
  const otherRun = await running(learner.user.id, "00-terminal-basics");
  assert.notEqual(otherRun.id, run.id); assert.notEqual(otherRun.flags, run.flags);
  assert.deepEqual(JSON.parse(otherRun.completed), {});
  await page.getByRole("button", { name: "Administration", exact: true }).click();
  await page.getByText("Active instances · 2/2", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Return to labs", exact: true }).click();
  await page.getByRole("button", { name: "Stop lab", exact: true }).click();
  for (let i = 0; i < 60 && instances.get(created.user.id, "00-terminal-basics").runtime !== "stopped"; i++) await page.waitForTimeout(500);
  assert.deepEqual(Object.keys(JSON.parse(instances.get(created.user.id, "00-terminal-basics").completed)), ["read-note"]);
  const webLab = loadLabs().find((lab) => lab.id === "07-web-breach-chain");
  await page.getByRole("navigation", { name: "Current curriculum" }).getByRole("button", { name: new RegExp(webLab.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await page.getByRole("button", { name: "Start / resume lab", exact: true }).click();
  await running(created.user.id, webLab.id);
  const popup = page.waitForEvent("popup");
  const launched = page.waitForResponse((response) => response.url().includes(`/targets/${webLab.browserEntrypoints[0].id}/launch`));
  await page.getByRole("button", { name: `Open ${webLab.browserEntrypoints[0].label}`, exact: true }).click();
  const launchResponse = await launched;
  assert.equal(launchResponse.status(), 200, await launchResponse.text());
  const target = await popup;
  await target.waitForURL(/\.localhost:3033\/$/);
  await target.waitForLoadState("domcontentloaded");
  assert.ok(new URL(target.url()).hostname.split(".")[0].length <= 63);
  assert.ok((await target.locator("body").innerText()).length > 20);
  assert.doesNotMatch(await target.locator("body").innerText(), /Open this target again/);
  const unauthorized = await otherContext.newPage();
  assert.equal((await unauthorized.goto(target.url())).status(), 403);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Sign in to your lab" }).waitFor();
  assert.equal((await target.reload()).status(), 403);
  assert.deepEqual(errors, []);
  console.log("PASS browser: login, password change, terminal/reconnect, checks, flags, extension, two accounts, administration, stop, private target access and logout revocation");
} finally {
  await browser?.close();
  for (const child of children) child.kill();
  // Controller operations must finish before scoped teardown.
  await new Promise(resolve => setTimeout(resolve, 1500));
  for (const run of accounts.db.prepare("SELECT * FROM instance_runs").all()) await instances.command(run, ["down", "--volumes", "--remove-orphans"]);
  accounts.db.close();
  unlinkSync(join(root, "node_modules"));
  rmSync(root, { recursive: true, force: true });
}
