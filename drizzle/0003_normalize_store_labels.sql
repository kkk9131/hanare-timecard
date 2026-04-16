UPDATE `stores`
SET
  `name` = '雀庵 離れ',
  `display_name` = '雀庵 離れ'
WHERE `code` = 'hanare'
  AND (`name` IN ('雀庵はなれ', 'はなれ', '離れ') OR `display_name` IN ('雀庵はなれ', 'はなれ', '離れ'));
--> statement-breakpoint

UPDATE `employees`
SET `name` = '離れ 店長'
WHERE `login_id` = 'hanare_mgr'
  AND `name` = 'はなれ 店長';
