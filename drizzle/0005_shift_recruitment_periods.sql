CREATE TABLE `shift_recruitment_periods` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `store_id` integer NOT NULL,
  `name` text NOT NULL,
  `target_from` text NOT NULL,
  `target_to` text NOT NULL,
  `submission_from` text NOT NULL,
  `submission_to` text NOT NULL,
  `status` text NOT NULL,
  `created_by` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`created_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `shift_periods_status_check` CHECK(`status` IN ('open','closed'))
);
--> statement-breakpoint
CREATE INDEX `idx_shift_periods_store_target` ON `shift_recruitment_periods` (`store_id`,`target_from`,`target_to`);
--> statement-breakpoint
CREATE INDEX `idx_shift_periods_submission` ON `shift_recruitment_periods` (`submission_from`,`submission_to`);
--> statement-breakpoint
CREATE TABLE `shift_requirement_slots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `period_id` integer NOT NULL,
  `store_id` integer NOT NULL,
  `date` text NOT NULL,
  `slot_name` text NOT NULL,
  `start_time` text NOT NULL,
  `end_time` text NOT NULL,
  `required_count` integer NOT NULL,
  `source` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`period_id`) REFERENCES `shift_recruitment_periods`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `shift_slots_required_check` CHECK(`required_count` >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_shift_slots_period_date` ON `shift_requirement_slots` (`period_id`,`date`);
--> statement-breakpoint
CREATE INDEX `idx_shift_slots_store_date` ON `shift_requirement_slots` (`store_id`,`date`);
--> statement-breakpoint
ALTER TABLE `shift_requests` ADD `period_id` integer REFERENCES `shift_recruitment_periods`(`id`) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `shift_requests` ADD `store_id` integer REFERENCES `stores`(`id`) ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shift_req_period_emp_date` ON `shift_requests` (`period_id`,`employee_id`,`date`);
