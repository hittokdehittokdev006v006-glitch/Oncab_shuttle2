-- Run once (or rerun safely) to install module permissions and the Accountant role.
-- This migration does not modify admin users or passwords.

START TRANSACTION;

INSERT INTO `permissions` (`name`, `display_name`, `module`, `action`, `description`, `created_at`, `updated_at`) VALUES
  ('dashboard.read', 'View Dashboard', 'dashboard', 'read', NULL, NOW(), NOW()),
  ('passengers.read', 'View Passengers', 'passengers', 'read', NULL, NOW(), NOW()),
  ('passengers.create', 'Create Passengers', 'passengers', 'create', NULL, NOW(), NOW()),
  ('passengers.update', 'Update Passengers', 'passengers', 'update', NULL, NOW(), NOW()),
  ('passengers.delete', 'Deactivate Passengers', 'passengers', 'delete', NULL, NOW(), NOW()),
  ('schedules.read', 'View Scheduled Trips', 'schedules', 'read', NULL, NOW(), NOW()),
  ('schedules.manage', 'Manage Scheduled Trips', 'schedules', 'manage', NULL, NOW(), NOW()),
  ('passes.read', 'View Passes', 'passes', 'read', NULL, NOW(), NOW()),
  ('passes.manage', 'Manage Passes', 'passes', 'manage', NULL, NOW(), NOW()),
  ('coupons.read', 'View Coupons', 'coupons', 'read', NULL, NOW(), NOW()),
  ('coupons.manage', 'Manage Coupons', 'coupons', 'manage', NULL, NOW(), NOW()),
  ('payments.read', 'View Payments', 'payments', 'read', NULL, NOW(), NOW()),
  ('payments.manage', 'Manage Payments', 'payments', 'manage', NULL, NOW(), NOW()),
  ('audit_logs.read', 'View Audit Logs', 'audit_logs', 'read', NULL, NOW(), NOW()),
  ('notifications.read', 'View Notifications', 'notifications', 'read', NULL, NOW(), NOW()),
  ('notifications.manage', 'Manage Notifications', 'notifications', 'manage', NULL, NOW(), NOW()),
  ('refunds.process', 'Process Refunds', 'refunds', 'manage', NULL, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `display_name` = VALUES(`display_name`),
  `module` = VALUES(`module`),
  `action` = VALUES(`action`),
  `updated_at` = NOW();

INSERT INTO `roles` (`name`, `display_name`, `description`, `is_active`, `created_at`, `updated_at`) VALUES
  ('accountant', 'Accountant', 'Finance, booking, passenger and reporting access', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `display_name` = VALUES(`display_name`),
  `description` = VALUES(`description`),
  `is_active` = 1,
  `updated_at` = NOW();

DELETE `role_permissions`
FROM `role_permissions`
JOIN `roles` ON `roles`.`id` = `role_permissions`.`role_id`
WHERE `roles`.`name` = 'accountant';

INSERT INTO `role_permissions` (`created_at`, `updated_at`, `role_id`, `permission_id`)
SELECT NOW(), NOW(), `roles`.`id`, `permissions`.`id`
FROM `roles`
JOIN `permissions` ON `permissions`.`name` IN (
  'dashboard.read',
  'passengers.read',
  'bookings.read',
  'passes.read',
  'coupons.read',
  'payments.read',
  'refunds.read',
  'refunds.process',
  'reports.read',
  'audit_logs.read'
)
WHERE `roles`.`name` = 'accountant';

INSERT IGNORE INTO `role_permissions` (`created_at`, `updated_at`, `role_id`, `permission_id`)
SELECT NOW(), NOW(), `roles`.`id`, `permissions`.`id`
FROM `roles`
JOIN `permissions` ON `permissions`.`name` IN (
  'dashboard.read',
  'passengers.read', 'passengers.create', 'passengers.update', 'passengers.delete',
  'schedules.read', 'schedules.manage',
  'passes.read', 'passes.manage',
  'coupons.read', 'coupons.manage',
  'payments.read', 'payments.manage',
  'audit_logs.read',
  'notifications.read', 'notifications.manage'
)
WHERE `roles`.`name` = 'operator';

COMMIT;
