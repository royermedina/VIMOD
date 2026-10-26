const express = require('express');
const controller = require('./workflow-controller');
const { asyncHandler, requireRole } = require('./index');

const router = express.Router();

router.post('/advisor-requests', requireRole('cliente'), asyncHandler(controller.requestAdvisor));
router.get('/advisor-requests', requireRole('cliente'), asyncHandler(controller.listAdvisorRequests));
router.get('/architects', requireRole('cliente'), asyncHandler(controller.listArchitects));
router.post('/projects/:id/select-proposal', requireRole('cliente'), asyncHandler(controller.selectProposal));
router.get('/projects/:id/selected-proposal', requireRole('cliente'), asyncHandler(controller.getSelectedProposal));
router.post('/projects/:id/reviews', requireRole('cliente'), asyncHandler(controller.requestReview));
router.get('/projects/:id/reviews', requireRole('cliente'), asyncHandler(controller.listProjectReviews));
router.post('/projects/:id/reviews/:reviewId/assign', requireRole('cliente'), asyncHandler(controller.assignReview));
router.post('/projects/:id/reviews/:reviewId/cancel', requireRole('cliente'), asyncHandler(controller.cancelReview));
router.post('/projects/:id/reviews/:reviewId/rating', requireRole('cliente'), asyncHandler(controller.rateReview));
router.post('/projects/:id/quotes', requireRole('cliente'), asyncHandler(controller.requestQuote));
router.get('/projects/:id/quotes', requireRole('cliente'), asyncHandler(controller.listClientQuotes));
router.post('/projects/:id/quotes/:quoteId/accept', requireRole('cliente'), asyncHandler(controller.acceptQuote));
router.post('/projects/:id/quotes/:quoteId/reject', requireRole('cliente'), asyncHandler(controller.rejectQuote));
router.get('/projects/:id/offers', requireRole('cliente'), asyncHandler(controller.listProjectOffers));
router.post('/projects/:id/offers/:offerId/accept', requireRole('cliente'), asyncHandler(controller.acceptOffer));
router.post('/projects/:id/orders', requireRole('cliente'), asyncHandler(controller.createOrder));
router.get('/orders', requireRole('cliente'), asyncHandler(controller.listOrders));
router.get('/payments', requireRole('cliente'), asyncHandler(controller.listPayments));
router.post('/orders/:id/payment-session', requireRole('cliente'), asyncHandler(controller.createPaymentSession));
router.post('/orders/:id/payment-cancel', requireRole('cliente'), asyncHandler(controller.cancelStripePayment));
router.post('/payments/stripe/confirm', requireRole('cliente'), asyncHandler(controller.confirmStripePayment));
router.post('/payments/:id/resolve', requireRole('cliente'), asyncHandler(controller.resolveSimulationPayment));
router.post('/payments/:id/confirm', requireRole('cliente'), asyncHandler(controller.rejectClientConfirmation));

module.exports = router;
