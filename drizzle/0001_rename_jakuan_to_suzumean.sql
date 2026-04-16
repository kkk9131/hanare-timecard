UPDATE `stores`
SET `code` = 'suzumean'
WHERE `code` = 'jakuan';
--> statement-breakpoint
UPDATE `employees`
SET
  `login_id` = 'suzumean_mgr',
  `password_hash` = '$2b$10$ZOgKg7QcWH9XeAhkaBzpSOpqr.VrWzf9ldUguBKD6upyRzWcBgZjG'
WHERE `login_id` = 'jakuan_mgr';
