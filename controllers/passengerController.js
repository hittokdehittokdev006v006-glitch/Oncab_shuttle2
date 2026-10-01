'use strict';

const { Op, QueryTypes } = require('sequelize');
const { CustomerUser, Driver } = require('../models');
const sequelize = require('../config/database');

const buildPagination = (page, limit) => {
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
  return { offset: (currentPage - 1) * pageSize, limit: pageSize, page: currentPage };
};

const customerWhere = (search) => {
  const where = { mobile: { [Op.ne]: null } };
  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { mobile: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
    ];
  }
  return where;
};

const addBookingStats = async (users) => {
  const mobiles = [...new Set(users.map((user) => user.mobile).filter(Boolean))];
  const stats = mobiles.length ? await sequelize.query(
    `SELECT passenger_mobile, COUNT(*) AS total_bookings,
      SUM(CASE WHEN payment_status = 'paid' THEN final_amount ELSE 0 END) AS total_spent
     FROM bookings WHERE passenger_mobile IN (:mobiles) GROUP BY passenger_mobile`,
    { replacements: { mobiles }, type: QueryTypes.SELECT }
  ) : [];
  const statsByMobile = new Map(stats.map((row) => [row.passenger_mobile, row]));

  return users.map((user) => {
    const bookingStats = statsByMobile.get(user.mobile);
    return {
      ...user.toJSON(),
      city: null,
      total_bookings: Number(bookingStats?.total_bookings || 0),
      total_spent: Number(bookingStats?.total_spent || 0),
    };
  });
};

exports.list = async (req, res, next) => {
  try {
    const { offset, limit, page } = buildPagination(req.query.page, req.query.limit);
    const where = customerWhere(req.query.search);
    const drivers = await Driver.findAll({ attributes: ['id'], raw: true });
    const driverIds = drivers.map((driver) => String(driver.id));
    if (driverIds.length) where.id = { [Op.notIn]: driverIds };

    const { count, rows } = await CustomerUser.findAndCountAll({ where, offset, limit, order: [['created_at', 'DESC']] });
    const data = await addBookingStats(rows);
    res.json({ success: true, data, pagination: { total: count, page, limit, pages: Math.ceil(count / limit) } });
  } catch (err) { next(err); }
};

exports.show = async (req, res, next) => {
  try {
    const user = await CustomerUser.findByPk(req.params.id);
    if (!user || !user.mobile || await Driver.findByPk(user.id)) return res.status(404).json({ success: false, message: 'Passenger not found' });
    const [data] = await addBookingStats([user]);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { name, mobile, email, city_id, sex } = req.body;
    if (!String(name || '').trim() || !String(mobile || '').trim()) {
      return res.status(400).json({ success: false, message: 'Name and mobile are required' });
    }
    const normalizedMobile = String(mobile).trim();
    if (await CustomerUser.findOne({ where: { mobile: normalizedMobile } })) {
      return res.status(409).json({ success: false, message: 'A user with this mobile number already exists' });
    }
    const user = await CustomerUser.create({
      name: String(name).trim(), mobile: normalizedMobile, email: email || null,
      city_id: city_id || null, sex: sex || null, block_status: 'Unblock', status: 'Active',
    });
    res.status(201).json({ success: true, message: 'Passenger created', data: { ...user.toJSON(), city: null, total_bookings: 0, total_spent: 0 } });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const user = await CustomerUser.findByPk(req.params.id);
    if (!user || !user.mobile || await Driver.findByPk(user.id)) return res.status(404).json({ success: false, message: 'Passenger not found' });
    const payload = {};
    for (const field of ['name', 'mobile', 'email', 'sex']) {
      if (req.body[field] !== undefined) payload[field] = req.body[field];
    }
    if (req.body.city_id !== undefined) payload.city_id = req.body.city_id || null;
    if (payload.mobile) {
      payload.mobile = String(payload.mobile).trim();
      const duplicate = await CustomerUser.findOne({ where: { mobile: payload.mobile, id: { [Op.ne]: user.id } } });
      if (duplicate) return res.status(409).json({ success: false, message: 'A user with this mobile number already exists' });
    }
    await user.update(payload);
    const [data] = await addBookingStats([user]);
    res.json({ success: true, message: 'Passenger updated', data });
  } catch (err) { next(err); }
};

exports.destroy = async (req, res, next) => {
  try {
    const user = await CustomerUser.findByPk(req.params.id);
    if (!user || !user.mobile || await Driver.findByPk(user.id)) return res.status(404).json({ success: false, message: 'Passenger not found' });
    await user.update({ status: 'Inactive', block_status: 'Block' });
    res.json({ success: true, message: 'Passenger deactivated' });
  } catch (err) { next(err); }
};

exports.toggleBlock = async (req, res, next) => {
  try {
    const user = await CustomerUser.findByPk(req.params.id);
    if (!user || !user.mobile || await Driver.findByPk(user.id)) return res.status(404).json({ success: false, message: 'Passenger not found' });
    const block_status = user.block_status === 'Block' ? 'Unblock' : 'Block';
    await user.update({ block_status });
    res.json({ success: true, message: `Passenger ${block_status === 'Block' ? 'blocked' : 'unblocked'}`, data: { block_status } });
  } catch (err) { next(err); }
};
