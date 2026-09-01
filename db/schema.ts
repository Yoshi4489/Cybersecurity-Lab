import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Account data is keyed by the stable ID from the eventual identity provider.
 * Keep course copy and lab definitions in versioned source files; D1 stores
 * learner-owned records only.
 */
export const learners = sqliteTable("learners", {
  id: text("id").primaryKey(),
  email: text("email"),
  displayName: text("display_name"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const moduleProgress = sqliteTable(
  "module_progress",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    status: text("status").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_module_progress_learner_module").on(table.learnerId, table.moduleId),
    index("idx_module_progress_learner_updated").on(table.learnerId, table.updatedAt),
  ],
);

export const objectiveProgress = sqliteTable(
  "objective_progress",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    objectiveId: text("objective_id").notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_objective_progress_learner_module_objective").on(table.learnerId, table.moduleId, table.objectiveId),
    index("idx_objective_progress_learner_module").on(table.learnerId, table.moduleId),
  ],
);

export const learnerNotes = sqliteTable(
  "learner_notes",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    content: text("content").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_learner_notes_learner_module").on(table.learnerId, table.moduleId),
    index("idx_learner_notes_learner_updated").on(table.learnerId, table.updatedAt),
  ],
);

export const xpEvents = sqliteTable(
  "xp_events",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    points: integer("points").notNull(),
    eventType: text("event_type").notNull(),
    moduleId: text("module_id"),
    objectiveId: text("objective_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_xp_events_learner_source").on(table.learnerId, table.sourceKey),
    index("idx_xp_events_learner_created").on(table.learnerId, table.createdAt),
  ],
);

export const badgeAwards = sqliteTable(
  "badge_awards",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    badgeKey: text("badge_key").notNull(),
    awardedAt: integer("awarded_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_badge_awards_learner_badge").on(table.learnerId, table.badgeKey),
    index("idx_badge_awards_learner_awarded").on(table.learnerId, table.awardedAt),
  ],
);

export const labRuns = sqliteTable(
  "lab_runs",
  {
    id: text("id").primaryKey(),
    learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    status: text("status").notNull(),
    launcher: text("launcher").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("idx_lab_runs_learner_started").on(table.learnerId, table.startedAt)],
);
