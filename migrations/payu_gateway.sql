-- Apply once before enabling PayU checkout/refunds.

ALTER TABLE `payments`
  ADD COLUMN `payment_gateway` varchar(30) DEFAULT NULL AFTER `razorpay_signature`,
  ADD COLUMN `payu_txnid` varchar(100) DEFAULT NULL AFTER `payment_gateway`,
  ADD COLUMN `payu_mihpayid` varchar(100) DEFAULT NULL AFTER `payu_txnid`,
  ADD UNIQUE KEY `payments_payu_txnid_unique` (`payu_txnid`);

ALTER TABLE `refunds`
  ADD COLUMN `gateway_response` json DEFAULT NULL AFTER `gateway_refund_id`;

DELETE FROM `system_settings`
WHERE `key` IN ('razorpay_key_id', 'razorpay_secret');
