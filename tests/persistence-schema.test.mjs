import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migration = await readFile(new URL("../drizzle/0000_next_goliath.sql", import.meta.url), "utf8");

test("learning persistence keeps learner records separate and indexed", () => {
  for (const table of ["learners", "module_progress", "objective_progress", "learner_notes", "xp_events", "badge_awards", "lab_runs"]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }

  assert.match(migration, /FOREIGN KEY \(`learner_id`\) REFERENCES `learners`\(`id`\).*ON DELETE cascade/);
  assert.match(migration, /CREATE UNIQUE INDEX `uq_objective_progress_learner_module_objective`/);
  assert.match(migration, /CREATE UNIQUE INDEX `uq_xp_events_learner_source`/);
  assert.match(migration, /CREATE INDEX `idx_module_progress_learner_updated`/);
});
