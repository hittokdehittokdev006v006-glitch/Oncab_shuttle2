'use strict';

const express = require('express');
const rateChartController = require('../controllers/rateChartController');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/', requirePermission('rates.read'), rateChartController.list);
router.post('/', requirePermission('rates.manage'), rateChartController.create);
router.put('/:id', requirePermission('rates.manage'), rateChartController.update);
router.delete('/:id', requirePermission('rates.manage'), rateChartController.destroy);

module.exports = router;
