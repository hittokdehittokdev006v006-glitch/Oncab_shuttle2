'use strict';

const { Op } = require('sequelize');
const { Refund, Booking, Payment, Passenger } = require('../models');
const { logAction } = require('../middleware/auditLog');
const { initiateRefund, checkRefundStatus } = require('../utils/payu');

const buildPagination = (page, limit) => {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 15));
  return { offset: (p - 1) * l, limit: l, page: p };
};

const REFUND_INCLUDE = [
  { model: Booking, as: 'booking', attributes: ['id', 'booking_reference', 'passenger_name', 'travel_date'] },
  { model: Passenger, as: 'passenger', attributes: ['id', 'name', 'mobile', 'email'] },
  { model: Payment, as: 'payment', attributes: ['id', 'payment_gateway', 'payu_txnid', 'payu_mihpayid', 'amount', 'status'] },
];

// ── List All Refunds ───────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const { page, limit, status, search } = req.query;
    const { offset, limit: lim, page: p } = buildPagination(page, limit);
    const where = {};
    if (status) where.status = status;
    if (search) where[Op.or] = [{ refund_reference: { [Op.like]: `%${search}%` } }];

    const { count, rows } = await Refund.findAndCountAll({ where, include: REFUND_INCLUDE, offset, limit: lim, order: [['created_at', 'DESC']] });
    res.json({ success: true, data: rows, pagination: { total: count, page: p, limit: lim, pages: Math.ceil(count / lim) } });
  } catch (err) {
    next(err);
  }
};

// ── Failed Refunds ─────────────────────────────────────────
exports.failedList = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const { offset, limit: lim, page: p } = buildPagination(page, limit);
    const { count, rows } = await Refund.findAndCountAll({ where: { status: 'failed' }, include: REFUND_INCLUDE, offset, limit: lim, order: [['created_at', 'DESC']] });
    res.json({ success: true, data: rows, pagination: { total: count, page: p, limit: lim, pages: Math.ceil(count / lim) } });
  } catch (err) {
    next(err);
  }
};

// ── Completed/Paid Refunds ─────────────────────────────────
exports.completedList = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const { offset, limit: lim, page: p } = buildPagination(page, limit);
    const { count, rows } = await Refund.findAndCountAll({ where: { status: 'completed' }, include: REFUND_INCLUDE, offset, limit: lim, order: [['processed_at', 'DESC']] });
    res.json({ success: true, data: rows, pagination: { total: count, page: p, limit: lim, pages: Math.ceil(count / lim) } });
  } catch (err) {
    next(err);
  }
};

// ── Process Refund ─────────────────────────────────────────
exports.process = async (req, res, next) => {
  try {
    const refund = await Refund.findByPk(req.params.id, { include: REFUND_INCLUDE });
    if (!refund) return res.status(404).json({ success: false, message: 'Refund not found' });
    if (refund.status === 'completed') return res.status(400).json({ success: false, message: 'Refund already processed' });
    if (refund.status === 'processing') return res.status(409).json({ success: false, message: 'Refund is already processing' });

    const payment = refund.payment || await Payment.findOne({ where: { booking_id: refund.booking_id, status: { [Op.in]: ['captured', 'partial_refund'] } }, order: [['created_at', 'DESC']] });
    if (payment?.payment_gateway === 'payu') {
      if (!payment.payu_mihpayid) {
        return res.status(409).json({ success: false, message: 'PayU payment reference is missing; cannot issue refund' });
      }

      const refundToken = `${refund.refund_reference}-${refund.retry_count || 0}`.slice(0, 50);
      try {
        const result = await initiateRefund({
          mihpayid: payment.payu_mihpayid,
          amount: refund.refund_amount,
          refundToken,
        });
        if (Number(result.status) !== 1) {
          const failure = result.msg || result.message || 'PayU rejected the refund request';
          await refund.update({ status: 'failed', failure_reason: failure, gateway_response: result });
          return res.status(502).json({ success: false, message: failure, data: refund });
        }

        const requestId = result.request_id || result.refund_id || refundToken;
        await refund.update({
          status: 'processing',
          refund_method: 'payu',
          gateway_refund_id: String(requestId),
          gateway_response: result,
          notes: req.body.notes || refund.notes,
          failure_reason: null,
        });
        await logAction({ userId: req.user?.id, userType: req.user?.role?.name, userName: req.user?.name, action: 'initiate_refund', module: 'refunds', entityType: 'Refund', entityId: refund.id, newValues: { status: 'processing', gateway_refund_id: String(requestId) }, ipAddress: req.ip, description: `Initiated PayU refund ${refund.refund_reference}` });
        return res.json({ success: true, message: 'PayU refund initiated; verify its status before marking it complete', data: refund });
      } catch (gatewayError) {
        await refund.update({ status: 'failed', failure_reason: gatewayError.message });
        throw gatewayError;
      }
    }

    const { gateway_refund_id, notes } = req.body;
    await refund.update({ status: 'completed', gateway_refund_id, notes, processed_at: new Date() });

    await logAction({ userId: req.user?.id, userType: req.user?.role?.name, userName: req.user?.name, action: 'process_refund', module: 'refunds', entityType: 'Refund', entityId: refund.id, newValues: { status: 'completed', gateway_refund_id }, ipAddress: req.ip, description: `Processed refund ${refund.refund_reference}` });

    res.json({ success: true, message: 'Refund processed', data: refund });
  } catch (err) {
    next(err);
  }
};

exports.verifyPayU = async (req, res, next) => {
  try {
    const refund = await Refund.findByPk(req.params.id, { include: REFUND_INCLUDE });
    if (!refund) return res.status(404).json({ success: false, message: 'Refund not found' });
    if (refund.status !== 'processing' || refund.refund_method !== 'payu' || !refund.gateway_refund_id) {
      return res.status(409).json({ success: false, message: 'No pending PayU refund to verify' });
    }

    const result = await checkRefundStatus(refund.gateway_refund_id);
    const details = result.transaction_details && Object.values(result.transaction_details)[0];
    const actionStatus = String(details?.status || details?.action_status || '').toLowerCase();
    let status = refund.status;
    const updates = { gateway_response: result };

    if (['success', 'successful', 'completed'].includes(actionStatus)) {
      status = 'completed';
      updates.status = status;
      updates.processed_at = new Date();
      updates.failure_reason = null;
    } else if (['failure', 'failed', 'failure_initiated'].includes(actionStatus)) {
      status = 'failed';
      updates.status = status;
      updates.failure_reason = details?.error_message || details?.msg || 'PayU refund failed';
    }

    await refund.update(updates);
    if (status === 'completed') {
      const payment = refund.payment || await Payment.findByPk(refund.payment_id);
      if (payment) {
        const booking = await Booking.findByPk(refund.booking_id);
        const refundedAmount = await Refund.sum('refund_amount', { where: { payment_id: payment.id, status: 'completed' } });
        const isFullRefund = Number(refundedAmount || 0) >= Number(payment.amount);
        await payment.update({ status: isFullRefund ? 'refunded' : 'partial_refund' });
        if (booking) await booking.update({ payment_status: isFullRefund ? 'refunded' : 'partial_refund' });
      }
    }

    res.json({ success: true, message: `PayU refund status: ${status}`, data: refund });
  } catch (err) {
    next(err);
  }
};

// ── Retry Failed Refund ────────────────────────────────────
exports.retry = async (req, res, next) => {
  try {
    const refund = await Refund.findByPk(req.params.id);
    if (!refund) return res.status(404).json({ success: false, message: 'Refund not found' });
    if (refund.status !== 'failed') return res.status(400).json({ success: false, message: 'Only failed refunds can be retried' });
    await refund.update({ status: 'pending', retry_count: refund.retry_count + 1, failure_reason: null });
    res.json({ success: true, message: 'Refund queued for retry', data: refund });
  } catch (err) {
    next(err);
  }
};

// ── Mark Refund Failed ─────────────────────────────────────
exports.markFailed = async (req, res, next) => {
  try {
    const refund = await Refund.findByPk(req.params.id);
    if (!refund) return res.status(404).json({ success: false, message: 'Refund not found' });
    const { failure_reason } = req.body;
    await refund.update({ status: 'failed', failure_reason });
    res.json({ success: true, message: 'Refund marked as failed', data: refund });
  } catch (err) {
    next(err);
  }
};
