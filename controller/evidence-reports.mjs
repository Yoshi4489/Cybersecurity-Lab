import { ApiError } from "./accounts.mjs";

export function evidenceReport(accounts, labs, userId, labId, objectiveId, input, save = false) {
  if (!labs.get(labId)?.objectives.some(item => item.id === objectiveId)) throw new ApiError(404, "Unknown lab objective.");
  const run = accounts.db.prepare("SELECT * FROM instance_runs WHERE user_id=? AND lab_id=? AND archived=0").get(userId, labId);
  if (!run || run.id !== input.runId) throw new ApiError(409, "The run changed. Refresh before saving evidence.");
  if (save && !["running", "stopped"].includes(run.runtime)) throw new ApiError(409, "Wait for the instance operation to finish before saving evidence.");
  const row = accounts.db.prepare("SELECT * FROM evidence_reports WHERE run_id=? AND objective_id=?").get(run.id, objectiveId);
  if (!save) return { runId: run.id, responses: row ? JSON.parse(row.responses) : {}, revision: row?.revision ?? 0 };
  if (!Number.isInteger(input.revision) || input.revision !== (row?.revision ?? 0)) throw new ApiError(409, "Evidence changed in another tab. Copy your draft, then reload the saved report.");
  const fields = ["finding", "evidence", "impact", "confidence", "remediation"];
  if (!input.responses || typeof input.responses !== "object" || Array.isArray(input.responses) ||
      Object.entries(input.responses).some(([key, value]) => !fields.includes(key) || typeof value !== "string" || value.length > 4000)) {
    throw new ApiError(422, "Use only the five evidence fields, with at most 4000 characters per field.");
  }
  const revision = (row?.revision ?? 0) + 1;
  accounts.db.prepare(`INSERT INTO evidence_reports VALUES(?,?,?,?,?)
    ON CONFLICT(run_id,objective_id) DO UPDATE SET responses=excluded.responses,revision=excluded.revision,updated_at=excluded.updated_at`)
    .run(run.id, objectiveId, JSON.stringify(input.responses), revision, Date.now());
  return { runId: run.id, responses: input.responses, revision };
}
