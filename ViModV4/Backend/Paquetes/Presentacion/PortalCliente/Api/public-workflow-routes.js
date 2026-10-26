const express = require('express');
const controller = require('./workflow-controller');
const { asyncHandler } = require('./index');

const router = express.Router();
router.get('/services', asyncHandler(controller.publicServices));
router.get('/contractors', asyncHandler(controller.listContractors));
router.get('/contractors/:id', asyncHandler(controller.getContractorProfile));

module.exports = router;
