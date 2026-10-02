'use strict';

const { RateChart, Stop } = require('../models');

const resolveFare = async ({ routeId, originStopId, destinationStopId, fallbackFare, transaction }) => {
  const originId = originStopId ? Number(originStopId) : null;
  const destinationId = destinationStopId ? Number(destinationStopId) : null;

  if ((originId && !destinationId) || (!originId && destinationId)) {
    return { error: 'Select both origin and destination stops' };
  }

  if (originId && destinationId) {
    if (!routeId) return { error: 'Stop fares are unavailable for this schedule route' };
    const matchingStops = await Stop.findAll({
      where: { route_id: routeId, id: [originId, destinationId] },
      transaction,
    });
    if (matchingStops.length !== 2) return { error: 'Selected stops do not belong to this route' };

    const stopFare = await RateChart.findOne({
      where: { route_id: routeId, origin_stop_id: originId, destination_stop_id: destinationId },
      transaction,
    });
    if (stopFare) return { fare: Number(stopFare.fare_amount), source: 'stop_pair' };
  }

  if (routeId) {
    const routeFare = await RateChart.findOne({
      where: { route_id: routeId, origin_stop_id: null, destination_stop_id: null },
      transaction,
    });
    if (routeFare) return { fare: Number(routeFare.fare_amount), source: 'route' };
  }

  return { fare: Number(fallbackFare) || 0, source: 'schedule' };
};

module.exports = { resolveFare };
