'use strict';

const express = require('express');
const locationController = require('../controllers/locationController');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/dashboard', requirePermission('locations.read'), locationController.dashboard);

module.exports = router;