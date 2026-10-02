-- Apply once to enable live Location dashboard GPS metadata and permissions.

ALTER TABLE `driver_details`
  ADD COLUMN `location_speed_kmh` decimal(7,2) DEFAULT NULL AFTER `longitude`,
  ADD COLUMN `location_heading` decimal(6,2) DEFAULT NULL AFTER `location_speed_kmh`,
  ADD COLUMN `location_trip_id` int unsigned DEFAULT NULL AFTER `location_heading`;

INSERT INTO `permissions` (`name`, `display_name`, `module`, `action`, `description`, `created_at`, `updated_at`)
VALUES ('locations.read', 'View Live Locations', 'locations', 'read', 'View live bus locations and route status', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `display_name` = VALUES(`display_name`),
  `module` = VALUES(`module`),
  `action` = VALUES(`action`),
  `updated_at` = NOW();

INSERT IGNORE INTO `role_permissions` (`created_at`, `updated_at`, `role_id`, `permission_id`)
SELECT NOW(), NOW(), `roles`.`id`, `permissions`.`id`
FROM `roles`
JOIN `permissions` ON `permissions`.`name` = 'locations.read'
WHERE `roles`.`name` = 'operator';
