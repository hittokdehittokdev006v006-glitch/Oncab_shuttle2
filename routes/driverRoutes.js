'use strict';

const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driverController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/', requirePermission('drivers.read'), driverController.list);
router.get('/:id', requirePermission('drivers.read'), driverController.show);
router.post('/', requirePermission('drivers.create'), driverController.create);
router.put('/:id', requirePermission('drivers.update'), driverController.update);
router.delete('/:id', requirePermission('drivers.delete'), driverController.destroy);
router.patch('/:id/status', requirePermission('drivers.update'), driverController.updateStatus);
module.exports = router;
