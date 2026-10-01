'use strict';

const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

router.get('/permissions', requirePermission('roles.read'), roleController.listPermissions);
router.get('/', requirePermission('roles.read'), roleController.listRoles);
router.post('/', requirePermission('roles.manage'), roleController.createRole);
router.put('/:id', requirePermission('roles.manage'), roleController.updateRole);
router.delete('/:id', requirePermission('roles.manage'), roleController.deleteRole);
router.put('/:id/permissions', requirePermission('roles.manage'), roleController.assignPermissions);

module.exports = router;
