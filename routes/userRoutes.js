'use strict';

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/errorHandler');

const createValidation = [
  body('name').notEmpty().withMessage('Name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password min 8 chars'),
  body('role_id').isInt({ min: 1 }).withMessage('Role required'),
  handleValidationErrors,
];

const updateValidation = [
  body('name').optional().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  handleValidationErrors,
];

router.use(authenticate);

router.get('/', requirePermission('users.read'), userController.list);
router.get('/:id', requirePermission('users.read'), userController.show);
router.post('/', requirePermission('users.create'), createValidation, userController.create);
router.put('/:id', requirePermission('users.update'), updateValidation, userController.update);
router.delete('/:id', requirePermission('users.delete'), userController.destroy);
router.patch('/:id/toggle-status', requirePermission('users.update'), userController.toggleStatus);

module.exports = router;
