CREATE TABLE `shift_monthly_settings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `store_id` integer NOT NULL,
  `month` integer NOT NULL,
  `slot_name` text NOT NULL,
  `weekday_required_count` integer NOT NULL,
  `holiday_required_count` integer NOT NULL,
  `busy_required_count` integer NOT NULL,
  `busy_from_day` integer,
  `busy_to_day` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `updated_by` integer,
  FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`updated_by`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `shift_monthly_month_check` CHECK(`month` BETWEEN 1 AND 12),
  CONSTRAINT `shift_monthly_weekday_count_check` CHECK(`weekday_required_count` >= 0),
  CONSTRAINT `shift_monthly_holiday_count_check` CHECK(`holiday_required_count` >= 0),
  CONSTRAINT `shift_monthly_busy_count_check` CHECK(`busy_required_count` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shift_monthly_store_month` ON `shift_monthly_settings` (`store_id`,`month`);
