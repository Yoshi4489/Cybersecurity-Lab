export type LearnerIdentity = {
  id: string;
  email?: string | null;
  displayName?: string | null;
};

export type ObjectiveCompletion = {
  moduleId: string;
  objectiveId: string;
  points: number;
};

export type LearningSnapshot = {
  totalXp: number;
  objectives: Array<{ moduleId: string; objectiveId: string; completedAt: number }>;
  notes: Array<{ moduleId: string; content: string; updatedAt: number }>;
  badges: Array<{ badgeKey: string; awardedAt: number }>;
};

type D1QueryResult<T = Record<string, unknown>> = {
  results: T[];
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
};

/** The narrow D1 surface used by this repository; Cloudflare's binding satisfies it. */
export type LearningDatabase = {
  prepare(query: string): D1PreparedStatement;
  batch<T extends D1QueryResult>(statements: D1PreparedStatement[]): Promise<T[]>;
};

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function timestamp() {
  return Date.now();
}

/** All learner-owned D1 operations stay here so request handlers only provide identity and input. */
export async function upsertLearner(db: LearningDatabase, learner: LearnerIdentity) {
  const now = timestamp();
  await db.prepare(
    `INSERT INTO learners (id, email, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`,
  ).bind(learner.id, learner.email ?? null, learner.displayName ?? null, now, now).run();
}

export async function getLearningSnapshot(db: LearningDatabase, learnerId: string): Promise<LearningSnapshot> {
  const [xp, objectives, notes, badges] = await db.batch([
    db.prepare("SELECT COALESCE(SUM(points), 0) AS total_xp FROM xp_events WHERE learner_id = ?").bind(learnerId),
    db.prepare("SELECT module_id, objective_id, completed_at FROM objective_progress WHERE learner_id = ? ORDER BY completed_at ASC").bind(learnerId),
    db.prepare("SELECT module_id, content, updated_at FROM learner_notes WHERE learner_id = ? ORDER BY updated_at DESC").bind(learnerId),
    db.prepare("SELECT badge_key, awarded_at FROM badge_awards WHERE learner_id = ? ORDER BY awarded_at DESC").bind(learnerId),
  ]);

  return {
    totalXp: Number((xp.results[0] as { total_xp?: number } | undefined)?.total_xp ?? 0),
    objectives: (objectives.results as Array<{ module_id: string; objective_id: string; completed_at: number }>).map((record) => ({ moduleId: record.module_id, objectiveId: record.objective_id, completedAt: record.completed_at })),
    notes: (notes.results as Array<{ module_id: string; content: string; updated_at: number }>).map((record) => ({ moduleId: record.module_id, content: record.content, updatedAt: record.updated_at })),
    badges: (badges.results as Array<{ badge_key: string; awarded_at: number }>).map((record) => ({ badgeKey: record.badge_key, awardedAt: record.awarded_at })),
  };
}

export async function recordObjectiveCompletion(db: LearningDatabase, learner: LearnerIdentity, completion: ObjectiveCompletion) {
  const now = timestamp();
  const sourceKey = `objective:${completion.moduleId}:${completion.objectiveId}`;
  await db.batch([
    db.prepare(
      `INSERT INTO learners (id, email, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`,
    ).bind(learner.id, learner.email ?? null, learner.displayName ?? null, now, now),
    db.prepare(
      `INSERT INTO module_progress (id, learner_id, module_id, status, started_at, completed_at, updated_at)
       VALUES (?, ?, ?, 'in_progress', ?, NULL, ?)
       ON CONFLICT(learner_id, module_id) DO UPDATE SET updated_at = excluded.updated_at`,
    ).bind(id("module"), learner.id, completion.moduleId, now, now),
    db.prepare(
      `INSERT INTO objective_progress (id, learner_id, module_id, objective_id, completed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(learner_id, module_id, objective_id) DO NOTHING`,
    ).bind(id("objective"), learner.id, completion.moduleId, completion.objectiveId, now),
    db.prepare(
      `INSERT INTO xp_events (id, learner_id, source_key, points, event_type, module_id, objective_id, created_at)
       VALUES (?, ?, ?, ?, 'objective_completed', ?, ?, ?)
       ON CONFLICT(learner_id, source_key) DO NOTHING`,
    ).bind(id("xp"), learner.id, sourceKey, completion.points, completion.moduleId, completion.objectiveId, now),
  ]);
}

export async function saveLearnerNote(db: LearningDatabase, learner: LearnerIdentity, moduleId: string, content: string) {
  const now = timestamp();
  await upsertLearner(db, learner);
  await db.prepare(
    `INSERT INTO learner_notes (id, learner_id, module_id, content, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(learner_id, module_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
  ).bind(id("note"), learner.id, moduleId, content, now).run();
}

export async function recordLabRun(db: LearningDatabase, learner: LearnerIdentity, moduleId: string, launcher: "local-docker" | "browser") {
  const now = timestamp();
  await upsertLearner(db, learner);
  const runId = id("run");
  await db.prepare(
    "INSERT INTO lab_runs (id, learner_id, module_id, status, launcher, started_at, ended_at) VALUES (?, ?, ?, 'running', ?, ?, NULL)",
  ).bind(runId, learner.id, moduleId, launcher, now).run();
  return runId;
}

export async function finishLabRun(db: LearningDatabase, learnerId: string, runId: string, status: "stopped" | "completed") {
  await db.prepare(
    "UPDATE lab_runs SET status = ?, ended_at = ? WHERE id = ? AND learner_id = ? AND ended_at IS NULL",
  ).bind(status, timestamp(), runId, learnerId).run();
}

export async function awardBadge(db: LearningDatabase, learner: LearnerIdentity, badgeKey: string) {
  const now = timestamp();
  await upsertLearner(db, learner);
  await db.prepare(
    "INSERT INTO badge_awards (id, learner_id, badge_key, awarded_at) VALUES (?, ?, ?, ?) ON CONFLICT(learner_id, badge_key) DO NOTHING",
  ).bind(id("badge"), learner.id, badgeKey, now).run();
}
