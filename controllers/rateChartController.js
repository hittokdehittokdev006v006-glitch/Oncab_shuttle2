'use strict';

const { RateChart, Route, Stop } = require('../models');

const serializeRateChart = (rateChart) => {
  const data = rateChart.toJSON();
  return {
    ...data,
    fare_amount: Number(data.fare_amount),
  };
};

const validateRate = async (body) => {
  const routeId = Number(body.route_id);
  const fareAmount = Number(body.fare_amount);
  const originStopId = body.origin_stop_id ? Number(body.origin_stop_id) : null;
  const destinationStopId = body.destination_stop_id ? Number(body.destination_stop_id) : null;

  if (!Number.isInteger(routeId) || routeId < 1) return { error: 'Select a valid route' };
  if (!Number.isFinite(fareAmount) || fareAmount <= 0) return { error: 'Fare must be greater than zero' };
  if ((originStopId && !destinationStopId) || (!originStopId && destinationStopId)) {
    return { error: 'Select both origin and destination stops for a stop-wise fare' };
  }
  if (originStopId && originStopId === destinationStopId) return { error: 'Origin and destination stops must be different' };

  const route = await Route.findByPk(routeId);
  if (!route) return { error: 'Route not found' };

  if (originStopId && destinationStopId) {
    const stops = await Stop.findAll({ where: { route_id: routeId, id: [originStopId, destinationStopId] } });
    if (stops.length !== 2) return { error: 'Both stops must belong to the selected route' };
  }

  return { routeId, fareAmount, originStopId, destinationStopId };
};

const includeRateAssociations = [
  { model: Route, as: 'route', attributes: ['id', 'route_name', 'route_code', 'origin_city', 'destination_city'] },
  { model: Stop, as: 'origin_stop', attributes: ['id', 'stop_name', 'stop_sequence'], required: false },
  { model: Stop, as: 'destination_stop', attributes: ['id', 'stop_name', 'stop_sequence'], required: false },
];

exports.list = async (req, res, next) => {
  try {
    const rateCharts = await RateChart.findAll({
      include: includeRateAssociations,
      order: [['route_id', 'ASC'], ['origin_stop_id', 'ASC'], ['destination_stop_id', 'ASC']],
    });
    res.json({ success: true, data: rateCharts.map(serializeRateChart) });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const validated = await validateRate(req.body);
    if (validated.error) return res.status(400).json({ success: false, message: validated.error });

    const where = {
      route_id: validated.routeId,
      origin_stop_id: validated.originStopId,
      destination_stop_id: validated.destinationStopId,
    };
    const existing = await RateChart.findOne({ where });
    if (existing) return res.status(409).json({ success: false, message: 'A rate already exists for this route and stop selection' });

    const rateChart = await RateChart.create({ ...where, fare_amount: validated.fareAmount });
    const created = await RateChart.findByPk(rateChart.id, { include: includeRateAssociations });
    res.status(201).json({ success: true, message: 'Rate added', data: serializeRateChart(created) });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const rateChart = await RateChart.findByPk(req.params.id);
    if (!rateChart) return res.status(404).json({ success: false, message: 'Rate not found' });
    const validated = await validateRate(req.body);
    if (validated.error) return res.status(400).json({ success: false, message: validated.error });

    const where = {
      route_id: validated.routeId,
      origin_stop_id: validated.originStopId,
      destination_stop_id: validated.destinationStopId,
    };
    const duplicate = await RateChart.findOne({ where });
    if (duplicate && duplicate.id !== rateChart.id) {
      return res.status(409).json({ success: false, message: 'A rate already exists for this route and stop selection' });
    }

    await rateChart.update({ ...where, fare_amount: validated.fareAmount });
    const updated = await RateChart.findByPk(rateChart.id, { include: includeRateAssociations });
    res.json({ success: true, message: 'Rate updated', data: serializeRateChart(updated) });
  } catch (err) {
    next(err);
  }
};

exports.destroy = async (req, res, next) => {
  try {
    const rateChart = await RateChart.findByPk(req.params.id);
    if (!rateChart) return res.status(404).json({ success: false, message: 'Rate not found' });
    await rateChart.destroy();
    res.json({ success: true, message: 'Rate deleted' });
  } catch (err) {
    next(err);
  }
};