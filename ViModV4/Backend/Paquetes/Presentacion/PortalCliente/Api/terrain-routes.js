const express = require('express');
const controller = require('./terrain-controller');
const { asyncHandler, requireAuth, requireRole, loadUser } = require('./index');

const router = express.Router();
router.use(requireAuth, loadUser, requireRole('cliente'));

router.post('/', asyncHandler(controller.create));
router.get('/', asyncHandler(controller.list));
router.get('/:id', asyncHandler(controller.getById));
router.delete('/:id', asyncHandler(controller.remove));

module.exports = router;
