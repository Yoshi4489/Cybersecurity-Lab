import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { validateCurriculum } from "../scripts/standalone-curriculum.mjs";

const root = new URL("../standalone-labs/", import.meta.url);
const ids = (await readdir(root)).filter((id) => /^\d\d-/.test(id)).sort();
const labs = await Promise.all(ids.map(async (id) => JSON.parse(await readFile(new URL(`${id}/lab.json`, root), "utf8"))));

test("curriculum references are valid and modes gradually introduce independent investigations", () => {
  validateCurriculum(labs);
  assert.deepEqual(
    labs.slice(0, 12).map((lab) => lab.mode),
    ["guided", "guided", "guided", "guided", "guided", "guided", "capstone", "challenge", "challenge", "capstone", "guided", "guided"],
  );
  assert.ok(labs.slice(12).every((lab) => ["guided", "capstone"].includes(lab.mode)));
  assert.deepEqual(labs[0].prerequisites, []);
});

test("invalid prerequisite and objective graphs fail with actionable errors", () => {
  const unknown = structuredClone(labs);
  unknown[0].prerequisites = ["missing-lab"];
  assert.throws(() => validateCurriculum(unknown), /Unknown prerequisite/);
  const cycle = structuredClone(labs);
  cycle[0].prerequisites = [cycle[1].id];
  assert.throws(() => validateCurriculum(cycle), /Cycle in prerequisite/);
  const objectiveCycle = structuredClone(labs);
  objectiveCycle[0].objectives[0].dependsOn = [objectiveCycle[0].objectives.at(-1).id];
  assert.throws(() => validateCurriculum(objectiveCycle), /Cycle in objective/);
});

test("every objective has discoverable hints, a solution, and a host verification command", async () => {
  for (const lab of labs) {
    const text = await readFile(new URL(`${lab.id}/README.md`, root), "utf8");
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    const core = ["Scenario", "What you need to know", "Start the lab", "Objectives", "Hints", "Solution", "What this taught you", "Stop or reset"];
    // Optional orientation/follow-up sections may surround, but never replace,
    // duplicate or reorder the core lesson sections used below.
    assert.deepEqual(headings.filter((heading) => core.includes(heading)), core, lab.id);
    const objectives = text.split("## Objectives")[1].split("## Hints")[0];
    const hints = text.split("## Hints")[1].split("## Solution")[0];
    const solution = text.split("## Solution")[1].split("## What this taught you")[0];
    const cleanup = text.split("## Stop or reset")[1];
    assert.match(cleanup, /deletes this lab's progress and creates new flags/, lab.id);
    assert.match(cleanup, /submitted progress stay the same/, lab.id);
    for (const block of cleanup.matchAll(/```sh\n([\s\S]*?)```/g)) {
      if (block[1].includes(" reset ")) {
        assert.equal(block[1].trim(), `node scripts/standalone-labctl.mjs reset ${lab.id}`,
          `${lab.id}: destructive reset must not be bundled with routine shutdown`);
      }
    }
    for (const objective of lab.objectives) {
      assert.ok(objectives.includes(objective.id), `${lab.id}: missing objective ${objective.id}`);
      const hintBlock = hints.split(/^### /m).find((part) => part.split("\n")[0].includes(objective.id));
      assert.ok(hintBlock, `${lab.id}: missing hints for ${objective.id}`);
      const reveals = [...hintBlock.matchAll(/<details>\n<summary>Hint ([123]) — [^<]+<\/summary>\n\n([\s\S]*?)\n\n<\/details>/g)];
      assert.deepEqual(reveals.map((match) => match[1]), ["1", "2", "3"], `${lab.id}/${objective.id}: reveal each hint independently`);
      assert.ok(reveals.every((match) => match[2].trim()), `${lab.id}/${objective.id}: empty hint`);
      assert.doesNotMatch(hintBlock, /<details\s+open/, `${lab.id}/${objective.id}: hints should start closed`);
      assert.ok(solution.includes(`verify ${lab.id} ${objective.id} 'RLAB{...}'`), `${lab.id}/${objective.id}: missing submission`);
    }
    // A block mixing host verification with toolbox commands causes beginner copy/paste failures.
    for (const block of solution.matchAll(/```sh\n([\s\S]*?)```/g)) {
      const commands = block[1].trim().split("\n");
      if (commands.some((line) => line.startsWith("node scripts/"))) {
        assert.ok(commands.every((line) => line.startsWith("node scripts/")), lab.id);
      }
    }
  }
});
