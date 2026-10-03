'use strict';

const { Op, fn, col } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { BusType, BusRoute, BusSchedule, BusStop, Trip, Booking, Vehicle, Stop, Route, BusDriverAssignment, Passenger, Coupon } = require('../models');
const sequelize = require('../config/database');
const { resolveFare } = require('../utils/fareCalculator');

const buildPagination = (page, limit) => {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 15));
  return { offset: (p - 1) * l, limit: l, page: p };
};

// ── 1. Get Bus Types ─────────────────────────────────────────
exports.getBusTypes = async (req, res, next) => {
  try {
    const busTypes = await BusType.findAll({
      where: { status: 'Active' },
      order: [['name', 'ASC']],
    });

    res.json({
      status: 200,
      success: true,
      message: 'Bus types retrieved successfully',
      data: busTypes,
    });
  } catch (err) {
    next(err);
  }
};

// ── 2. Get Routes ──────────────────────────────────────────────
exports.getRoutes = async (req, res, next) => {
  try {
    const origin_city = req.query?.origin_city || req.body?.origin_city;
    const destination_city = req.query?.destination_city || req.body?.destination_city;

    const where = { status: 'Active' };
    if (origin_city) where.origin_city = origin_city;
    if (destination_city) where.destination_city = destination_city;

    let routes = await Route.findAll({
      where,
      include: [
        { model: Stop, as: 'stops', required: false },
      ],
      order: [['origin_city', 'ASC'], ['destination_city', 'ASC']],
    });

    if (!routes || routes.length === 0) {
      routes = await BusRoute.findAll({
        where,
        include: [
          { model: BusStop, as: 'stops', required: false },
        ],
        order: [['origin_city', 'ASC'], ['destination_city', 'ASC']],
      });
    }

    res.json({
      status: 200,
      success: true,
      message: 'Routes retrieved successfully',
      data: routes,
    });
  } catch (err) {
    next(err);
  }
};

// ── 3. Search Routes with Filters ─────────────────────────────
exports.searchRoutes = async (req, res, next) => {
  try {
    const origin_city = req.query?.origin_city || req.body?.origin_city;
    const destination_city = req.query?.destination_city || req.body?.destination_city;
    const travel_date = req.query?.travel_date || req.body?.travel_date;
    const bus_type_id = req.query?.bus_type_id || req.body?.bus_type_id;

    const where = { status: 'Active' };
    if (origin_city) where.origin_city = origin_city;
    if (destination_city) where.destination_city = destination_city;

    let routes = await Route.findAll({
      where,
      include: [
        { model: Stop, as: 'stops', required: false },
      ],
    });

    if (!routes || routes.length === 0) {
      routes = await BusRoute.findAll({
        where,
        include: [
          { model: BusStop, as: 'stops', required: false },
        ],
      });
    }

    // Get schedules for these routes
    const routeIds = routes.map((r) => r.id);
    const scheduleWhere = {
      route_id: { [Op.in]: routeIds },
      status: 'Active',
    };
    if (bus_type_id) scheduleWhere.bus_type_id = bus_type_id;

    let schedules = await BusSchedule.findAll({
      where: scheduleWhere,
      include: [
        { model: BusType, as: 'bus_type', required: false },
        { model: Route, as: 'main_route', required: false },
        { model: BusRoute, as: 'route', required: false },
      ],
      order: [['departure_time', 'ASC']],
    });

    if (!schedules || schedules.length === 0) {
      const tripWhere = {
        route_id: { [Op.in]: routeIds },
      };
      if (bus_type_id) tripWhere.bus_type_id = bus_type_id;

      schedules = await Trip.findAll({
        where: tripWhere,
        include: [
          { model: BusType, as: 'bus_type', required: false },
          { model: Route, as: 'route', include: [{ model: Stop, as: 'stops', required: false }], required: false },
        ],
        order: [['departure_time', 'ASC']],
      });
    }

    // Filter schedules by operating days if travel_date is provided
    let filteredSchedules = schedules;
    if (travel_date) {
      const date = new Date(travel_date);
      const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const weekday = weekdays[date.getDay()];

      filteredSchedules = schedules.filter((schedule) => {
        if (schedule.trip_date && schedule.trip_date === travel_date) return true;
        if (!schedule.operating_days) return true;
        const operatingDays = String(schedule.operating_days).toLowerCase().split(/[,:]/).map((d) => d.trim());
        return operatingDays.includes(weekday);
      });
    }

    const formattedSearchedSchedules = filteredSchedules.map((s) => {
      const item = s.toJSON();
      item.route = item.main_route || item.route;
      return item;
    });

    res.json({
      status: 200,
      success: true,
      message: 'Routes searched successfully',
      data: {
        routes,
        schedules: formattedSearchedSchedules,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── 4. Get Schedules ──────────────────────────────────────────
exports.getSchedules = async (req, res, next) => {
  try {
    const route_id = req.query?.route_id || req.body?.route_id;
    const bus_type_id = req.query?.bus_type_id || req.body?.bus_type_id;
    const travel_date = req.query?.travel_date || req.body?.travel_date;

    const where = {};
    if (route_id) where.route_id = route_id;
    if (bus_type_id) where.bus_type_id = bus_type_id;

    let schedules = await BusSchedule.findAll({
      where,
      include: [
        { model: BusType, as: 'bus_type', required: false },
        { model: Route, as: 'main_route', include: [{ model: Stop, as: 'stops', required: false }], required: false },
        { model: BusRoute, as: 'route', include: [{ model: BusStop, as: 'stops', required: false }], required: false },
      ],
      order: [['departure_time', 'ASC']],
    });

    if (!schedules || schedules.length === 0) {
      const tripWhere = {};
      if (route_id) tripWhere.route_id = route_id;
      if (bus_type_id) tripWhere.bus_type_id = bus_type_id;

      schedules = await Trip.findAll({
        where: tripWhere,
        include: [
          { model: BusType, as: 'bus_type', required: false },
          { model: Route, as: 'route', include: [{ model: Stop, as: 'stops', required: false }], required: false },
        ],
        order: [['departure_time', 'ASC']],
      });
    }

    // Filter by operating days if travel_date is provided
    let filteredSchedules = schedules;
    if (travel_date) {
      const date = new Date(travel_date);
      const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const weekday = weekdays[date.getDay()];

      filteredSchedules = schedules.filter((schedule) => {
        if (schedule.trip_date && schedule.trip_date === travel_date) return true;
        if (!schedule.operating_days) return true;
        const operatingDays = String(schedule.operating_days).toLowerCase().split(/[,:]/).map((d) => d.trim());
        return operatingDays.includes(weekday);
      });
    }

    const formattedSchedules = filteredSchedules.map((s) => {
      const item = s.toJSON();
      item.route = item.main_route || item.route;
      return item;
    });

    res.json({
      status: 200,
      success: true,
      message: 'Schedules retrieved successfully',
      data: formattedSchedules,
    });
  } catch (err) {
    next(err);
  }
};

// ── 5. Check Seat Availability ────────────────────────────────
exports.checkSeatAvailability = async (req, res, next) => {
  try {
    const rawScheduleId = req.query?.schedule_id || req.body?.schedule_id;
    const travel_date = req.query?.travel_date || req.body?.travel_date;

    if (!rawScheduleId || !travel_date) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'schedule_id and travel_date are required',
      });
    }

    const schedule_id = Number(rawScheduleId) || rawScheduleId;

    let schedule = await BusSchedule.findByPk(schedule_id, {
      include: [
        { model: BusType, as: 'bus_type', required: false },
        { model: Route, as: 'main_route', include: [{ model: Stop, as: 'stops', required: false }], required: false },
        { model: BusRoute, as: 'route', include: [{ model: BusStop, as: 'stops', required: false }], required: false },
      ],
    });

    if (!schedule) {
      schedule = await Trip.findByPk(schedule_id, {
        include: [
          { model: BusType, as: 'bus_type', required: false },
          { model: Route, as: 'route', include: [{ model: Stop, as: 'stops', required: false }], required: false },
        ],
      });
    }

    if (!schedule) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Schedule not found',
      });
    }

    // Determine trip ID for booking lookups
    let tripId = schedule.id;
    if (schedule.schedule_code) {
      const trip = await Trip.findOne({
        where: {
          schedule_code: schedule.schedule_code,
          trip_date: travel_date,
        },
      });
      if (trip) tripId = trip.id;
    }

    const bookings = await Booking.findAll({
      where: {
        trip_id: tripId,
        travel_date,
        booking_status: { [Op.ne]: 'cancelled' },
      },
      attributes: ['seat_numbers'],
    });

    const bookedSeats = new Set();
    bookings.forEach((booking) => {
      if (booking.seat_numbers && Array.isArray(booking.seat_numbers)) {
        booking.seat_numbers.forEach((seat) => bookedSeats.add(seat));
      }
    });

    const totalSeats = schedule.seat_capacity || schedule.bus_type?.total_seats || 30;
    const availableSeats = totalSeats - bookedSeats.size;

    // Generate seat layout
    const seatLayout = [];
    const rows = schedule.bus_type?.seat_rows || 5;
    const columns = schedule.bus_type?.seat_columns || 4;

    for (let row = 1; row <= rows; row++) {
      for (let col = 1; col <= columns; col++) {
        const seatNumber = `${row}${String.fromCharCode(64 + col)}`;
        seatLayout.push({
          seat_number: seatNumber,
          row,
          column: col,
          is_available: !bookedSeats.has(seatNumber),
        });
      }
    }

    const routeInfo = schedule.main_route || schedule.route;

    res.json({
      status: 200,
      success: true,
      message: 'Seat availability checked successfully',
      data: {
        schedule_id: schedule.id,
        schedule_code: schedule.schedule_code,
        bus_number: schedule.bus_number || null,
        travel_date,
        total_seats: totalSeats,
        booked_seats: bookedSeats.size,
        available_seats: availableSeats,
        booked_seat_numbers: Array.from(bookedSeats),
        seat_layout: seatLayout,
        schedule: {
          departure_time: schedule.departure_time,
          arrival_time: schedule.arrival_time,
          base_fare: schedule.base_fare,
          bus_type: schedule.bus_type,
          route: routeInfo,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── 6. Calculate Fare ─────────────────────────────────────────
exports.calculateFare = async (req, res, next) => {
  try {
    const body = req.body || {};
    const query = req.query || {};
    const rawScheduleId = query.schedule_id || body.schedule_id;
    const origin_stop_id = query.origin_stop_id || body.origin_stop_id;
    const destination_stop_id = query.destination_stop_id || body.destination_stop_id;
    const rawSeatCount = query.seat_count || body.seat_count || 1;
    const seat_count = Number(rawSeatCount);
    if (!Number.isInteger(seat_count) || seat_count < 1) {
      return res.status(400).json({ status: 400, success: false, message: 'seat_count must be a positive integer' });
    }

    if (!rawScheduleId) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'schedule_id is required',
      });
    }

    const schedule_id = Number(rawScheduleId) || rawScheduleId;

    let schedule = await BusSchedule.findByPk(schedule_id, {
      include: [
        { model: Route, as: 'main_route', required: false },
        { model: BusRoute, as: 'route', required: false },
        { model: BusType, as: 'bus_type', required: false },
      ],
    });

    if (!schedule) {
      schedule = await Trip.findByPk(schedule_id, {
        include: [
          { model: Route, as: 'route', required: false },
          { model: BusType, as: 'bus_type', required: false },
        ],
      });
    }

    if (!schedule) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Schedule not found',
      });
    }

    const scheduleRoute = schedule.route;
    const isLegacyRoute = scheduleRoute
      && !Object.prototype.hasOwnProperty.call(scheduleRoute.dataValues || {}, 'route_stops');
    const route = schedule.main_route || (isLegacyRoute ? scheduleRoute : null);
    const distance = Number(route?.total_distance) || 100;
    const farePerKm = Number(schedule.fare_per_km) || 3;
    const baseFare = Number(schedule.base_fare) || 100;
    const fallbackFare = baseFare + (distance * farePerKm);
    const fareResult = await resolveFare({
      routeId: route?.id,
      originStopId: origin_stop_id,
      destinationStopId: destination_stop_id,
      fallbackFare,
    });
    if (fareResult.error) return res.status(400).json({ status: 400, success: false, message: fareResult.error });

    const farePerSeat = fareResult.fare;
    const finalAmount = farePerSeat * seat_count;

    res.json({
      status: 200,
      success: true,
      message: 'Fare calculated successfully',
      data: {
        schedule_id: schedule.id,
        schedule_code: schedule.schedule_code,
        origin_stop_id,
        destination_stop_id,
        distance_km: distance,
        base_fare: baseFare,
        fare_per_km: farePerKm,
        seat_count,
        fare_per_seat: farePerSeat,
        total_fare: finalAmount,
        rate_source: fareResult.source,
        currency: 'INR',
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── 7. Get User Bookings ───────────────────────────────────────
exports.getUserBookings = async (req, res, next) => {
  try {
    const body = req.body || {};
    const query = req.query || {};
    const passenger_id = query.passenger_id || body.passenger_id;
    const passenger_mobile = query.passenger_mobile || body.passenger_mobile;
    const booking_status = query.booking_status || body.booking_status;
    const travel_date = query.travel_date || body.travel_date;
    const page = query.page || body.page || 1;
    const limit = query.limit || body.limit || 20;

    const where = {};
    if (passenger_id) where.passenger_id = passenger_id;
    if (passenger_mobile) where.passenger_mobile = passenger_mobile;
    if (booking_status) where.booking_status = booking_status;
    if (travel_date) where.travel_date = travel_date;

    const { offset, limit: lim, page: p } = buildPagination(page, limit);

    const { count, rows } = await Booking.findAndCountAll({
      where,
      include: [
        { model: Trip, as: 'trip', include: [{ model: Route, as: 'route', required: false }], required: false },
        { model: Stop, as: 'origin_stop', attributes: ['id', 'stop_name'], required: false },
        { model: Stop, as: 'destination_stop', attributes: ['id', 'stop_name'], required: false },
        { model: Passenger, as: 'passenger', attributes: ['id', 'name', 'mobile', 'email'], required: false },
      ],
      offset,
      limit: lim,
      order: [['created_at', 'DESC']],
    });

    res.json({
      status: 200,
      success: true,
      message: 'User bookings retrieved successfully',
      data: rows,
      pagination: {
        total: count,
        page: p,
        limit: lim,
        pages: Math.ceil(count / lim),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── 8. Get Booking Details for Boarding Pass ───────────────────
exports.getBookingDetails = async (req, res, next) => {
  try {
    const body = req.body || {};
    const query = req.query || {};
    const booking_id = query.booking_id || body.booking_id;
    const booking_reference = query.booking_reference || body.booking_reference;
    const boarding_pass_code = query.boarding_pass_code || body.boarding_pass_code;

    const where = {};
    if (booking_id) where.id = booking_id;
    if (booking_reference) where.booking_reference = booking_reference;
    if (boarding_pass_code) where.boarding_pass_code = boarding_pass_code;

    if (!booking_id && !booking_reference && !boarding_pass_code) {
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Either booking_id, booking_reference, or boarding_pass_code is required',
      });
    }

    const booking = await Booking.findOne({
      where,
      include: [
        { model: Trip, as: 'trip', include: [{ model: Route, as: 'route', required: false }], required: false },
        { model: Stop, as: 'origin_stop', attributes: ['id', 'stop_name', 'address'], required: false },
        { model: Stop, as: 'destination_stop', attributes: ['id', 'stop_name', 'address'], required: false },
      ],
    });

    if (!booking) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Booking not found',
      });
    }

    // Format response for boarding pass
    const boardingPassData = {
      booking_id: booking.id,
      booking_reference: booking.booking_reference,
      passenger_name: booking.passenger_name,
      passenger_mobile: booking.passenger_mobile,
      passenger_email: booking.passenger_email,
      travel_date: booking.travel_date,
      seat_numbers: booking.seat_numbers,
      total_seats: booking.total_seats,
      total_fare: booking.total_fare,
      discount_amount: booking.discount_amount,
      final_amount: booking.final_amount,
      payment_status: booking.payment_status,
      booking_status: booking.booking_status,
      boarding_pass_code: booking.boarding_pass_code,
      boarding_pin: booking.boarding_pin,
      boarding_status: booking.boarding_status,
      boarded_at: booking.boarded_at,
      qr_token: booking.qr_token,
      trip: {
        trip_id: booking.trip?.id,
        schedule_code: booking.trip?.schedule_code,
        departure_time: booking.trip?.departure_time,
        arrival_time: booking.trip?.arrival_time,
        route: {
          route_name: booking.trip?.route?.route_name,
          origin_city: booking.trip?.route?.origin_city,
          destination_city: booking.trip?.route?.destination_city,
        },
      },
      origin_stop: booking.origin_stop,
      destination_stop: booking.destination_stop,
    };

    res.json({
      status: 200,
      success: true,
      message: 'Booking details retrieved successfully',
      data: boardingPassData,
    });
  } catch (err) {
    next(err);
  }
};

// ── 9. Cancel User Booking ────────────────────────────────────
exports.cancelUserBooking = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { booking_id, cancellation_reason } = req.body || {};

    if (!booking_id) {
      await t.rollback();
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'booking_id is required',
      });
    }

    const booking = await Booking.findByPk(booking_id, { transaction: t });
    if (!booking) {
      await t.rollback();
      return res.status(404).json({
        status: 404,
        success: false,
        message: 'Booking not found',
      });
    }

    if (booking.booking_status === 'cancelled') {
      await t.rollback();
      return res.status(400).json({
        status: 400,
        success: false,
        message: 'Booking already cancelled',
      });
    }

    await booking.update(
      {
        booking_status: 'cancelled',
        status: 'Cancelled',
        cancellation_reason: cancellation_reason || 'Cancelled by user',
        cancelled_at: new Date(),
      },
      { transaction: t }
    );

    // Decrement booked seats in trip
    const trip = await Trip.findByPk(booking.trip_id, { transaction: t });
    if (trip) {
      await trip.decrement('booked_seats', { by: booking.total_seats, transaction: t });
    }

    if (booking.payment_status === 'paid') {
      const payment = await Payment.findOne({
        where: { booking_id: booking.id, status: ['captured', 'partial_refund'] },
        order: [['created_at', 'DESC']],
        transaction: t,
      });
      await Refund.create({
        booking_id: booking.id,
        payment_id: payment?.id || null,
        passenger_id: booking.passenger_id,
        refund_reference: `REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        refund_amount: booking.final_amount,
        refund_reason: cancellation_reason || 'Cancelled by user',
        status: 'pending',
      }, { transaction: t });
    }

    await t.commit();

    res.json({
      status: 200,
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        booking_id: booking.id,
        booking_reference: booking.booking_reference,
        booking_status: booking.booking_status,
        payment_status: booking.payment_status,
        cancelled_at: booking.cancelled_at,
      },
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// ── 10. Public Create Booking ──────────────────────────────────
exports.createBooking = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const body = req.body || {};
    const {
      trip_id,
      schedule_id,
      passenger_id,
      passenger_name,
      passenger_mobile,
      passenger_email,
      origin_stop_id,
      destination_stop_id,
      travel_date,
      seat_numbers,
      total_seats,
      payment_method,
      coupon_id,
      special_requests
    } = body;

    const targetTripId = trip_id || schedule_id;

    if (!targetTripId) {
      await t.rollback();
      return res.status(400).json({ status: 400, success: false, message: 'trip_id or schedule_id is required' });
    }

    if (!passenger_name || !passenger_mobile) {
      await t.rollback();
      return res.status(400).json({ status: 400, success: false, message: 'passenger_name and passenger_mobile are required' });
    }

    let trip = await Trip.findByPk(targetTripId, { transaction: t });
    if (!trip) {
      const schedule = await BusSchedule.findByPk(targetTripId, { transaction: t });
      if (schedule) {
        trip = await Trip.findOne({
          where: { schedule_code: schedule.schedule_code, trip_date: travel_date || schedule.trip_date },
          transaction: t
        });
      }
    }

    if (!trip) {
      await t.rollback();
      return res.status(404).json({ status: 404, success: false, message: 'Trip not found' });
    }

    const numSeats = total_seats || (Array.isArray(seat_numbers) ? seat_numbers.length : 1);
    const available = (trip.seat_capacity || 30) - (trip.booked_seats || 0);
    if (available < numSeats) {
      await t.rollback();
      return res.status(409).json({ status: 409, success: false, message: `Only ${available} seats available` });
    }

    const fareResult = await resolveFare({
      routeId: trip.route_id,
      originStopId: origin_stop_id,
      destinationStopId: destination_stop_id,
      fallbackFare: trip.base_fare,
      transaction: t,
    });
    if (fareResult.error) {
      await t.rollback();
      return res.status(400).json({ status: 400, success: false, message: fareResult.error });
    }

    let total_fare = fareResult.fare * numSeats;
    let discount_amount = 0;

    if (coupon_id) {
      const coupon = await Coupon.findByPk(coupon_id, { transaction: t });
      if (coupon && coupon.status === 'Active') {
        if (coupon.code_type === 'FLAT') discount_amount = Math.min(coupon.amount, total_fare);
        else discount_amount = Math.min((total_fare * coupon.amount) / 100, coupon.max_discount || Infinity);
        await coupon.increment('used_count', { transaction: t });
      }
    }

    const final_amount = Math.max(0, total_fare - discount_amount);
    const booking_reference = `BK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const boarding_pass_code = `BP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const boarding_pin = Math.floor(1000 + Math.random() * 9000).toString();

    const booking = await Booking.create({
      booking_reference,
      trip_id: trip.id,
      passenger_id: passenger_id || null,
      passenger_name,
      passenger_mobile,
      passenger_email: passenger_email || null,
      origin_stop_id: origin_stop_id || null,
      destination_stop_id: destination_stop_id || null,
      travel_date: travel_date || trip.trip_date,
      seat_numbers,
      total_seats: numSeats,
      total_fare,
      discount_amount,
      final_amount,
      payment_method: payment_method || 'cash',
      coupon_id: coupon_id || null,
      special_requests: special_requests || null,
      boarding_pass_code,
      boarding_pin,
      booking_status: 'confirmed',
      payment_status: 'pending',
      qr_token: uuidv4(),
    }, { transaction: t });

    await trip.increment('booked_seats', { by: numSeats, transaction: t });

    await t.commit();
    const bookingData = booking.toJSON();
    res.status(201).json({
      status: 201,
      success: true,
      message: 'Booking created successfully',
      data: {
        booking_id: booking.id,
        ...bookingData
      }
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};
