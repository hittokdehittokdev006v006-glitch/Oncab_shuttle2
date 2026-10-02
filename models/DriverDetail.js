'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DriverDetail = sequelize.define('DriverDetail', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  driver_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  birth_day: { type: DataTypes.DATEONLY, defaultValue: null },
  latitude: { type: DataTypes.DECIMAL(10, 7), defaultValue: null },
  longitude: { type: DataTypes.DECIMAL(10, 7), defaultValue: null },
  location_speed_kmh: { type: DataTypes.DECIMAL(7, 2), defaultValue: null },
  location_heading: { type: DataTypes.DECIMAL(6, 2), defaultValue: null },
  location_trip_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  aadhar: { type: DataTypes.STRING(20), defaultValue: null },
  aadhar_img: { type: DataTypes.TEXT('medium'), defaultValue: null },
  aadhar_back_img: { type: DataTypes.TEXT('medium'), defaultValue: null },
  driving_licence: { type: DataTypes.STRING(50), defaultValue: null },
  driving_licence_img: { type: DataTypes.TEXT('medium'), defaultValue: null },
  driving_licence_back_img: { type: DataTypes.TEXT('medium'), defaultValue: null },
  licence_expiry_date: { type: DataTypes.DATEONLY, defaultValue: null },
  driver_authorized_letter_img: { type: DataTypes.TEXT('medium'), defaultValue: null },
  smart_card_number: { type: DataTypes.STRING(50), defaultValue: null },
  smart_card_img: { type: DataTypes.TEXT('medium'), defaultValue: null },
  smart_card_back_img: { type: DataTypes.TEXT('medium'), defaultValue: null },
  emergency_contact_number: { type: DataTypes.STRING(20), defaultValue: null },
  father_name: { type: DataTypes.STRING(100), defaultValue: null },
  mother_name: { type: DataTypes.STRING(100), defaultValue: null },
  blood_group: { type: DataTypes.STRING(10), defaultValue: null },
  alternate_mobile: { type: DataTypes.STRING(20), defaultValue: null },
  availability_status: { type: DataTypes.ENUM('Yes', 'No'), defaultValue: 'Yes' },
  status: { type: DataTypes.STRING(50), defaultValue: 'Active' },
}, {
  tableName: 'driver_details',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = DriverDetail;
