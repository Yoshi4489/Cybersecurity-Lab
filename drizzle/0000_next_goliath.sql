CREATE TABLE `badge_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`badge_key` text NOT NULL,
	`awarded_at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_badge_awards_learner_badge` ON `badge_awards` (`learner_id`,`badge_key`);--> statement-breakpoint
CREATE INDEX `idx_badge_awards_learner_awarded` ON `badge_awards` (`learner_id`,`awarded_at`);--> statement-breakpoint
CREATE TABLE `lab_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`module_id` text NOT NULL,
	`status` text NOT NULL,
	`launcher` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_lab_runs_learner_started` ON `lab_runs` (`learner_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `learner_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`module_id` text NOT NULL,
	`content` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_learner_notes_learner_module` ON `learner_notes` (`learner_id`,`module_id`);--> statement-breakpoint
CREATE INDEX `idx_learner_notes_learner_updated` ON `learner_notes` (`learner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `learners` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`display_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `module_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`module_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_module_progress_learner_module` ON `module_progress` (`learner_id`,`module_id`);--> statement-breakpoint
CREATE INDEX `idx_module_progress_learner_updated` ON `module_progress` (`learner_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `objective_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`module_id` text NOT NULL,
	`objective_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_objective_progress_learner_module_objective` ON `objective_progress` (`learner_id`,`module_id`,`objective_id`);--> statement-breakpoint
CREATE INDEX `idx_objective_progress_learner_module` ON `objective_progress` (`learner_id`,`module_id`);--> statement-breakpoint
CREATE TABLE `xp_events` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`source_key` text NOT NULL,
	`points` integer NOT NULL,
	`event_type` text NOT NULL,
	`module_id` text,
	`objective_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_xp_events_learner_source` ON `xp_events` (`learner_id`,`source_key`);--> statement-breakpoint
CREATE INDEX `idx_xp_events_learner_created` ON `xp_events` (`learner_id`,`created_at`);