import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setImmediate as tick } from "node:timers/promises";
import test from "node:test";
import ts from "typescript";

function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap(item => nodes(item, type));
  if (!tree || typeof tree !== "object") return [];
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}
function mount(request) {
  const hooks = []; let cursor = 0, effects = [], dirty = true, tree;
  const react = {
    useState(initial) { const i = cursor++; hooks[i] ??= { value: initial }; return [hooks[i].value, value => { hooks[i].value = typeof value === "function" ? value(hooks[i].value) : value; dirty = true; }]; },
    useRef(value) { return hooks[cursor++] ??= { current: value }; },
    useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((value, j) => value !== hooks[i].deps[j])) { hooks[i]?.cleanup?.(); hooks[i] = { deps }; effects.push(() => { hooks[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL("../app/labs/workspace.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, { exports, require(id) { if (id === "react") return react; if (id === "react/jsx-runtime") return { jsx, jsxs: jsx }; if (id === "../controller-client") return { controllerRequest: request }; return {}; } });
  const props = { labId: "05-linux-evidence", objective: { id: "test", findingPrompt: "State finding", evidencePrompt: "Cite source", impactPrompt: "Explain impact", confidencePrompt: "Explain confidence", remediationPrompt: "Validate remediation" }, runId: "run-1", csrf: "csrf", disabled: false };
  return { props, get tree() { return tree; },
    async settle() { for (let n = 0; n < 20; n++) { if (dirty) { dirty = false; cursor = 0; effects = []; assert.equal(typeof exports.EvidenceReport, "function", "formative evidence form is available"); tree = exports.EvidenceReport(props); for (const effect of effects) effect(); } await tick(); if (!dirty) return; } },
    close() { for (const hook of hooks) hook?.cleanup?.(); }
  };
}

test("five optional formative prompts render, reload, and save independently with CSRF and revision", async t => {
  const calls = [];
  const ui = mount(async (path, options) => { calls.push({ path, options }); return options ? { runId: "run-1", responses: JSON.parse(options.body).responses, revision: 3 } : { runId: "run-1", responses: { finding: "saved finding" }, revision: 2 }; });
  t.after(() => ui.close()); await ui.settle();
  assert.equal(nodes(ui.tree, "textarea").length, 5);
  assert.equal(nodes(ui.tree, "textarea")[0].props.value, "saved finding");
  for (const field of nodes(ui.tree, "textarea")) { assert.equal(field.props.maxLength, 4000); assert.ok(!field.props.required); }
  assert.match(JSON.stringify(ui.tree), /Formative.*not auto-graded/);
  nodes(ui.tree, "textarea")[0].props.onChange({ target: { value: "new finding" } }); await ui.settle();
  nodes(ui.tree, "form")[0].props.onSubmit({ preventDefault() {} }); await ui.settle();
  assert.equal(calls[1].options.headers["X-CSRF-Token"], "csrf");
  assert.deepEqual(JSON.parse(calls[1].options.body), { runId: "run-1", revision: 2, responses: { finding: "new finding" } });
  assert.match(JSON.stringify(ui.tree), /Saved/);
});
