import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadLabs } from "../scripts/standalone-labctl.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
// Lab 07 has its own remediation owner and regression suite.
const ids = readdirSync(resolve(root, "standalone-labs")).filter((id) => /^(?:0[0-6]|0[89]|10)-/.test(id)).sort();
const bandFor = (id) => {
  const number = Number(id.slice(0, 2));
  return number < 2 ? "beginner" : number === 2 ? "beginner-plus" : number < 6 ? "intermediate-foundations" : number < 10 ? "intermediate-capstone" : "intermediate-crypto-foundations";
};

test("curriculum manifests preserve compatible tiers and explicit bands through the real loader", () => {
  const loaded = new Map(loadLabs().map((lab) => [lab.id, lab]));
  assert.equal(ids.length, 10);
  for (const id of ids) {
    const manifest = JSON.parse(read(`standalone-labs/${id}/lab.json`));
    const band = bandFor(id);
    assert.equal(manifest.difficultyBand, band, id);
    assert.equal(manifest.difficulty, band === "beginner" ? "beginner" : "intermediate", id);
    assert.equal(loaded.get(id).difficultyBand, band, `${id}: loader must preserve metadata`);
    assert.ok(read(`standalone-labs/${id}/README.md`).includes(`**Difficulty band:** ${band}`), id);
  }
});

function commandBlocks(text) {
  return [...text.matchAll(/^```(sh|bash|shell|powershell|text)\n([\s\S]*?)^```/gm)]
    .filter((block) => block[1] !== "text" || /^(?:npm|node|docker)\b/m.test(block[2]));
}
function assertCommandLocations(text, file) {
  const blocks = commandBlocks(text);
  assert.ok(blocks.length > 0, `${file}: expected runnable examples`);
  const environmentEnd = text.indexOf("### PORTAL");
  assert.ok(environmentEnd >= 0 && environmentEnd < blocks[0].index, `${file}: environment block must precede commands`);
  for (const heading of ["HOST", "TOOLBOX", "PORTAL"]) assert.match(text, new RegExp(`^### ${heading}$`, "m"), file);
  for (const block of blocks) {
    const label = text.slice(0, block.index).trimEnd().split("\n").at(-1);
    const environment = label.match(/^\*\*(HOST|TOOLBOX) — .+\*\*$/)?.[1];
    assert.ok(environment, `${file}: missing adjacent label for ${block[2].split("\n")[0]}`);
    const host = /^(?:npm(?:\.cmd)? |node (?:scripts\/|-v)|docker |cd C:)/m.test(block[2]);
    assert.equal(environment, host ? "HOST" : "TOOLBOX", `${file}: incorrect location for ${block[2].split("\n")[0]}`);
    if (host) assert.doesNotMatch(block[2], /^(?:nmap|curl|dig|nc|pwd|base64|jq|python3|find|sha256sum)\b/m, `${file}: mixed environments`);
    if (/\breset\b/.test(block[2]) && host) {
      assert.equal(block[2].trim().split("\n").length, 1, `${file}: reset needs a separate destructive block`);
    }
  }
}

test("documentation labels actual lifecycle and investigation command blocks by environment", () => {
  for (const file of [...ids.map((id) => `standalone-labs/${id}/README.md`), "standalone-labs/GETTING-STARTED.md", "README.md", "ABOUT.md"]) {
    assertCommandLocations(read(file), file);
  }
});
