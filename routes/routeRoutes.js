'use strict';

const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/', requirePermission('routes.read'), routeController.list);
router.get('/:id', requirePermission('routes.read'), routeController.show);
router.post('/', requirePermission('routes.manage'), routeController.create);
router.put('/:id', requirePermission('routes.manage'), routeController.update);
router.delete('/:id', requirePermission('routes.manage'), routeController.destroy);
router.post('/:id/stops', requirePermission('routes.manage'), routeController.addStop);
router.put('/:id/stops/:stopId', requirePermission('routes.manage'), routeController.updateStop);
router.delete('/:id/stops/:stopId', requirePermission('routes.manage'), routeController.deleteStop);
module.exports = router;
