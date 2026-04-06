CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` integer,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer,
	`before_json` text,
	`after_json` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_time` ON `audit_logs` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_actor` ON `audit_logs` (`actor_id`);--> statement-breakpoint
CREATE TABLE `correction_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`target_punch_id` integer,
	`target_date` text NOT NULL,
	`requested_value` integer,
	`requested_type` text,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`reviewer_id` integer,
	`reviewed_at` integer,
	`review_comment` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_punch_id`) REFERENCES `time_punches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "correction_requests_status_check" CHECK("correction_requests"."status" IN ('pending','approved','rejected'))
);
--> statement-breakpoint
CREATE INDEX `idx_corrections_status` ON `correction_requests` (`status`);--> statement-breakpoint
CREATE INDEX `idx_corrections_emp` ON `correction_requests` (`employee_id`);--> statement-breakpoint
CREATE TABLE `employee_stores` (
	`employee_id` integer NOT NULL,
	`store_id` integer NOT NULL,
	`is_primary` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`employee_id`, `store_id`),
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_emp_stores_store` ON `employee_stores` (`store_id`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kana` text NOT NULL,
	`role` text NOT NULL,
	`login_id` text,
	`password_hash` text,
	`pin_hash` text NOT NULL,
	`hourly_wage` integer DEFAULT 0 NOT NULL,
	`hire_date` text NOT NULL,
	`retire_date` text,
	`pin_fail_count` integer DEFAULT 0 NOT NULL,
	`lock_until` integer,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "employees_role_check" CHECK("employees"."role" IN ('staff','manager','admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_login_id_unique` ON `employees` (`login_id`);--> statement-breakpoint
CREATE INDEX `idx_employees_kana` ON `employees` (`kana`);--> statement-breakpoint
CREATE INDEX `idx_employees_retire` ON `employees` (`retire_date`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` integer NOT NULL,
	`role` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_expires` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `shift_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`preference` text NOT NULL,
	`note` text,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shift_requests_pref_check" CHECK("shift_requests"."preference" IN ('available','preferred','unavailable'))
);
--> statement-breakpoint
CREATE INDEX `idx_shift_req_date` ON `shift_requests` (`date`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`store_id` integer NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`status` text NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shifts_status_check" CHECK("shifts"."status" IN ('draft','published'))
);
--> statement-breakpoint
CREATE INDEX `idx_shifts_store_date` ON `shifts` (`store_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_shifts_emp_date` ON `shifts` (`employee_id`,`date`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`opening_time` text NOT NULL,
	`closing_time` text NOT NULL,
	`closed_days` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stores_code_unique` ON `stores` (`code`);--> statement-breakpoint
CREATE TABLE `time_punches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`store_id` integer NOT NULL,
	`punch_type` text NOT NULL,
	`punched_at` integer NOT NULL,
	`source` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "time_punches_type_check" CHECK("time_punches"."punch_type" IN ('clock_in','clock_out','break_start','break_end')),
	CONSTRAINT "time_punches_source_check" CHECK("time_punches"."source" IN ('kiosk','admin','correction'))
);
--> statement-breakpoint
CREATE INDEX `idx_punches_emp_time` ON `time_punches` (`employee_id`,`punched_at`);--> statement-breakpoint
CREATE INDEX `idx_punches_store_time` ON `time_punches` (`store_id`,`punched_at`);--> statement-breakpoint
CREATE TABLE `work_days` (
	`employee_id` integer NOT NULL,
	`store_id` integer NOT NULL,
	`date` text NOT NULL,
	`worked_minutes` integer NOT NULL,
	`break_minutes` integer NOT NULL,
	`overtime_minutes` integer NOT NULL,
	`night_minutes` integer NOT NULL,
	`computed_at` integer NOT NULL,
	PRIMARY KEY(`employee_id`, `store_id`, `date`),
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
