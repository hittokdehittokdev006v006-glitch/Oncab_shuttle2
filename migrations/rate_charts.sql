-- Apply once to add route-wide and stop-pair fares.

CREATE TABLE IF NOT EXISTS `rate_charts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `route_id` int unsigned NOT NULL,
  `origin_stop_id` int unsigned DEFAULT NULL,
  `destination_stop_id` int unsigned DEFAULT NULL,
  `fare_amount` decimal(10,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `rate_charts_route_idx` (`route_id`),
  KEY `rate_charts_stop_pair_idx` (`route_id`, `origin_stop_id`, `destination_stop_id`),
  CONSTRAINT `rate_charts_route_fk` FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `rate_charts_origin_stop_fk` FOREIGN KEY (`origin_stop_id`) REFERENCES `stops` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `rate_charts_destination_stop_fk` FOREIGN KEY (`destination_stop_id`) REFERENCES `stops` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `permissions` (`name`, `display_name`, `module`, `action`, `description`, `created_at`, `updated_at`) VALUES
  ('rates.read', 'View Rate Charts', 'rates', 'read', 'View route and stop fares', NOW(), NOW()),
  ('rates.manage', 'Manage Rate Charts', 'rates', 'manage', 'Add, edit, and delete route and stop fares', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `display_name` = VALUES(`display_name`),
  `module` = VALUES(`module`),
  `action` = VALUES(`action`),
  `updated_at` = NOW();

INSERT IGNORE INTO `role_permissions` (`created_at`, `updated_at`, `role_id`, `permission_id`)
SELECT NOW(), NOW(), `roles`.`id`, `permissions`.`id`
FROM `roles`
JOIN `permissions` ON `permissions`.`name` IN ('rates.read', 'rates.manage')
WHERE `roles`.`name` IN ('admin', 'operator');
