ALTER TABLE `correction_requests` ADD COLUMN `store_id` integer REFERENCES `stores`(`id`);
--> statement-breakpoint

UPDATE `correction_requests`
SET `store_id` = (
  SELECT `time_punches`.`store_id`
  FROM `time_punches`
  WHERE `time_punches`.`id` = `correction_requests`.`target_punch_id`
)
WHERE `target_punch_id` IS NOT NULL
  AND `store_id` IS NULL;
--> statement-breakpoint

UPDATE `correction_requests`
SET `store_id` = (
  SELECT `employee_stores`.`store_id`
  FROM `employee_stores`
  WHERE `employee_stores`.`employee_id` = `correction_requests`.`employee_id`
  ORDER BY `employee_stores`.`is_primary` DESC, `employee_stores`.`store_id` ASC
  LIMIT 1
)
WHERE `target_punch_id` IS NULL
  AND `store_id` IS NULL;
--> statement-breakpoint

CREATE INDEX `idx_corrections_store` ON `correction_requests` (`store_id`);
--> statement-breakpoint
