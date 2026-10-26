const express = require('express');
const controller = require('./workflow-controller');
const { asyncHandler, requireRole } = require('../../PortalCliente/Api');

const router = express.Router();
router.get('/architect/profile', requireRole('arquitecto'), asyncHandler(controller.getArchitectProfile));
router.patch('/architect/profile', requireRole('arquitecto'), asyncHandler(controller.updateArchitectProfile));
router.get('/architect/reviews', requireRole('arquitecto'), asyncHandler(controller.listAssignedReviews));
router.post('/reviews/:id/applications', requireRole('arquitecto'), asyncHandler(controller.applyToReview));
router.post('/reviews/:id/accept', requireRole('arquitecto'), asyncHandler(controller.acceptDirectedReview));
router.post('/reviews/:id/reject', requireRole('arquitecto'), asyncHandler(controller.rejectDirectedReview));
router.post('/reviews/:id/start', requireRole('arquitecto'), asyncHandler(controller.startReview));
router.post('/reviews/:id/observations', requireRole('arquitecto'), asyncHandler(controller.addObservation));
router.post('/reviews/:id/deliver', requireRole('arquitecto'), asyncHandler(controller.deliverReview));

module.exports = router;
