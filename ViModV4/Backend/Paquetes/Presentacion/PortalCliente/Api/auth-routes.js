const express = require('express');
const controller = require('./auth-controller');
const asyncHandler = require('../../../../Nucleo/HTTP').asyncHandler;
const { requireAuth } = require('./auth');
const loadUser = require('./load-user');

const router = express.Router();

router.post('/register', asyncHandler(controller.register));
router.post('/login', asyncHandler(controller.login));
router.get('/me', requireAuth, loadUser, asyncHandler(controller.me));

module.exports = router;
