import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate as nextTurn } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { readLearningMaterial } from "../controller/learning-material.mjs";

// Exercise the actual TSX handlers with controlled hooks, storage events and
// deferred HTTP replies. This is not a browser/DOM or visual test.
const sources = new Map();
function loadClient(name, dependencies = {}, globals = {}) {
  if (!sources.has(name)) sources.set(name, ts.transpileModule(
    readFileSync(new URL(`../app/labs/${name}`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText);
  const exports = {};
  runInNewContext(sources.get(name), { exports, ...globals, require(id) {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error(`Unexpected client import: ${id}`);
  } });
  return exports;
}
const persistence = loadClient("checkpoint-storage.ts");
const { createProgressRequests } = loadClient("progress-requests.ts");
const labs = readLearningMaterial().slice(0, 1);
const labId = labs[0].id;
const keyFor = (objective, run = "run-1") => `${labId}/${run}/${objective}`;
const plain = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function browserStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const tabs = [];
  const events = [];
  return {
    values,
    flushEvents() { for (const event of events.splice(0)) event(); },
    tab() {
      const listeners = new Set();
      const storage = {
        get length() { return values.size; },
        key: (index) => [...values.keys()][index] ?? null,
        getItem: (key) => values.get(key) ?? null,
        setItem(key, value) {
          const previous = values.get(key) ?? null;
          values.set(key, value);
          if (previous !== value) for (const other of tabs) if (other.storage !== storage) {
            events.push(() => { for (const listener of other.listeners) listener({ key, newValue: value, storageArea: other.storage }); });
          }
        },
      };
      const tab = { storage, listeners };
      tabs.push(tab);
      return tab;
    },
  };
}

function findAll(tree, predicate, result = []) {
  if (Array.isArray(tree)) { for (const item of tree) findAll(item, predicate, result); }
  else if (tree && typeof tree === "object") {
    if (predicate(tree)) result.push(tree);
    findAll(tree.props?.children, predicate, result);
  }
  return result;
}

function workspace(tab, request) {
  const hooks = [];
  let cursor = 0, dirty = true, effects = [], tree;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: initial };
      return [hooks[index].value, (next) => {
        const value = typeof next === "function" ? next(hooks[index].value) : next;
        if (!Object.is(value, hooks[index].value)) { hooks[index].value = value; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return (hooks[index] ??= { current: initial }); },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!same(hooks[index]?.deps, deps)) hooks[index] = { value: fn, deps };
      return hooks[index].value;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!same(hooks[index]?.deps, deps)) {
        const cleanup = hooks[index]?.cleanup;
        hooks[index] = { deps };
        effects.push(() => { cleanup?.(); hooks[index].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const component = loadClient("workspace.tsx", {
    react, "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": { default: "Link" },
    "../controller-client": { controllerRequest: request }, "./markdown": { Markdown: "Markdown" },
    "./checkpoint": { Checkpoint: "Checkpoint" }, "./terminal": { LabTerminal: "LabTerminal" },
    "./progress-requests": { createProgressRequests }, "./workspace.css": {},
  }, {
    localStorage: tab.storage,
    window: { confirm: () => true, addEventListener: (_, fn) => tab.listeners.add(fn), removeEventListener: (_, fn) => tab.listeners.delete(fn) },
    document: { hidden: false }, setInterval: () => 1, clearInterval: () => {},
  });
  return {
    async settle() {
      for (let iteration = 0; iteration < 20; iteration++) {
        if (dirty) {
          dirty = false; cursor = 0; effects = [];
          tree = component.LabWorkspace({ labs });
          for (const effect of effects) effect();
        }
        await nextTurn();
        if (!dirty) return;
      }
      throw new Error("Client state did not settle");
    },
    button(label) { return findAll(tree, (node) => node.type === "button" && node.props.children === label)[0]; },
    check(index) { return findAll(tree, (node) => node.type === "Checkpoint")[index]; },
    forms() { return findAll(tree, (node) => node.type === "form" && node.props.className === "workspace-flag"); },
    message() { return findAll(tree, (node) => node.props?.role === "status" && node.props?.["aria-live"] === "polite")[0].props.children; },
    close() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

function api() {
  let status = { runId: "run-1", completedObjectives: [], checks: [], runtime: "running" };
  const pending = new Map();
  const calls = [];
  return {
    calls,
    delay(path) { const result = deferred(); pending.set(path, result); return result; },
    async request(path) {
      calls.push(path);
      if (pending.has(path)) { const result = pending.get(path); pending.delete(path); return result.promise; }
      if (path === "/api/session") return { csrfToken: "shared-token" };
      if (path === "/api/standalone/progress") return { [labId]: plain(status) };
      if (path.endsWith("/status")) return plain(status);
      if (path.endsWith("/reset")) { status = { runId: "run-2", completedObjectives: [], runtime: "running" }; return plain(status); }
      if (path.endsWith("/submit")) { status.completedObjectives = ["read-note"]; return { progress: plain(status) }; }
      if (path.endsWith("/check")) { status.checks = [...new Set([...status.checks, path.split("/").at(-2)])]; return { progress: plain(status) }; }
      throw new Error(`Unexpected request: ${path}`);
    },
  };
}
const statusPath = `/api/standalone/${labId}/status`;
async function ready(t, storage = browserStorage()) {
  const backend = api();
  const tab = workspace(storage.tab(), backend.request);
  t.after(() => tab.close());
  await tab.settle();
  return { tab, backend, storage };
}
async function passAndEnterFlag(tab) {
  tab.check(0).props.onPass();
  await tab.settle();
  findAll(tab.forms()[0], (node) => node.type === "input")[0].props.onChange({ target: { value: "TEST_FLAG" } });
  await tab.settle();
}

test("independent legacy checkpoint keys survive simultaneous tab saves for account import", () => {
  const storage = browserStorage();
  persistence.saveCheckpoint(storage.tab().storage, keyFor("read-note"));
  persistence.saveCheckpoint(storage.tab().storage, keyFor("filter-log"));
  assert.equal(Object.keys(persistence.readCheckpoints(storage.tab().storage)).length, 2);
});

test("account import reads v1 and v2 without changing source browser storage", () => {
  const old = JSON.stringify({ [keyFor("read-note")]: true, [keyFor("filter-log")]: false });
  const storage = browserStorage({ [persistence.legacyCheckpointKey]: old });
  const passes = persistence.readCheckpoints(storage.tab().storage);
  assert.equal(passes[keyFor("read-note")], true);
  assert.equal(passes[keyFor("filter-log")], undefined);
  assert.equal(storage.values.get(persistence.legacyCheckpointKey), old);
  persistence.saveCheckpoint(storage.tab().storage, keyFor("read-note"));
  storage.values.set(persistence.legacyCheckpointKey, "{broken json");
  assert.equal(persistence.readCheckpoints(storage.tab().storage)[keyFor("read-note")], true);
});

test("server checkpoint persistence works when browser storage is unavailable", async (t) => {
  const browser = browserStorage();
  const local = browser.tab();
  local.storage.setItem = () => { throw new Error("Storage quota exceeded"); };
  const backend = api();
  const tab = workspace(local, backend.request);
  t.after(() => tab.close());
  await tab.settle();
  tab.check(0).props.onPass(); await tab.settle();
  assert.equal(tab.check(0).props.passed, true);
  assert.ok(backend.calls.some((path) => path.endsWith("/check")));
});

test("a delayed status response cannot undo a verified flag or relock its successor", async (t) => {
  const { tab, backend } = await ready(t);
  await passAndEnterFlag(tab);
  const old = backend.delay(statusPath);
  tab.button("Refresh status").props.onClick();
  await tab.settle();
  tab.forms()[0].props.onSubmit({ preventDefault() {} });
  await tab.settle();
  old.resolve({ runId: "run-1", completedObjectives: [], runtime: "stopped" });
  await tab.settle();
  assert.equal(findAll(tab.forms()[0], (node) => node.type === "input").length, 0);
  assert.equal(findAll(tab.forms()[1], (node) => node.type === "p" && Array.isArray(node.props.children) && node.props.children[0] === "Verify first: ").length, 0);
});

test("a late pre-reset status cannot restore old progress or old understanding checks", async (t) => {
  const { tab, backend } = await ready(t);
  await passAndEnterFlag(tab);
  const old = backend.delay(statusPath);
  tab.button("Refresh status").props.onClick(); await tab.settle();
  tab.button("Reset this lab…").props.onClick(); await tab.settle();
  old.resolve({ runId: "run-1", completedObjectives: ["read-note"], runtime: "running" });
  await tab.settle();
  assert.equal(tab.check(0).props.passed, false);
  assert.ok(tab.check(0).key.includes("run-2"));
  assert.equal(findAll(tab.forms()[0], (node) => node.type === "input").length, 1);
});

test("newer status reads win even when earlier reads finish last", async (t) => {
  const { tab, backend } = await ready(t);
  const old = backend.delay(statusPath);
  tab.button("Refresh status").props.onClick(); await tab.settle();
  const recent = backend.delay(statusPath);
  tab.button("Refresh status").props.onClick(); await tab.settle();
  recent.resolve({ runId: "run-2", completedObjectives: [], runtime: "running" });
  await tab.settle();
  old.resolve({ runId: "run-1", completedObjectives: ["read-note"], runtime: "running" });
  await tab.settle();
  assert.ok(tab.check(0).key.includes("run-2"));
});

test("a reconnect snapshot started before a mutation cannot roll back its progress", async (t) => {
  const { tab, backend } = await ready(t);
  await passAndEnterFlag(tab);
  const old = backend.delay("/api/standalone/progress");
  tab.button("Reconnect").props.onClick(); await tab.settle();
  tab.forms()[0].props.onSubmit({ preventDefault() {} }); await tab.settle();
  old.resolve({ [labId]: { runId: "run-1", completedObjectives: [] } });
  await tab.settle();
  assert.equal(findAll(tab.forms()[0], (node) => node.type === "input").length, 0);
});

test("failed mutations release polling and obsolete read errors do not replace feedback", async (t) => {
  const { tab, backend } = await ready(t);
  const old = backend.delay(statusPath);
  tab.button("Refresh status").props.onClick(); await tab.settle();
  const mutation = backend.delay(`/api/standalone/${labId}/reset`);
  tab.button("Reset this lab…").props.onClick(); await tab.settle();
  const reads = backend.calls.filter((path) => path === statusPath).length;
  tab.button("Refresh status").props.onClick(); await tab.settle();
  assert.equal(backend.calls.filter((path) => path === statusPath).length, reads);
  mutation.reject(new Error("Reset failed")); await tab.settle();
  old.reject(new Error("Obsolete read failed")); await tab.settle();
  assert.equal(tab.message(), "Reset failed");
  assert.ok(backend.calls.filter((path) => path === statusPath).length > reads);
  assert.equal(tab.button("Start / resume lab").props.disabled, false);
});
