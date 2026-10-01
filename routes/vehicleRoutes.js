'use strict';

const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/expiring-documents', requirePermission('vehicles.read'), vehicleController.expiringDocuments);
router.get('/bus-types', requirePermission('vehicles.read'), vehicleController.listBusTypes);
router.get('/', requirePermission('vehicles.read'), vehicleController.list);
router.get('/:id', requirePermission('vehicles.read'), vehicleController.show);
router.post('/', requirePermission('vehicles.manage'), vehicleController.create);
router.put('/:id', requirePermission('vehicles.manage'), vehicleController.update);
router.delete('/:id', requirePermission('vehicles.manage'), vehicleController.destroy);
router.post('/:id/documents', requirePermission('vehicles.manage'), vehicleController.addDocument);
router.put('/:id/documents/:documentId', requirePermission('vehicles.manage'), vehicleController.updateDocument);
module.exports = router;
