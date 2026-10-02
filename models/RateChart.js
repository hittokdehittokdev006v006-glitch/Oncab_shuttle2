'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RateChart = sequelize.define('RateChart', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  route_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  origin_stop_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  destination_stop_id: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: null },
  fare_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
}, {
  tableName: 'rate_charts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = RateChart;