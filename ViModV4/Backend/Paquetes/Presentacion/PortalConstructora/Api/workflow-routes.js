const express = require('express');
const controller = require('./workflow-controller');
const { asyncHandler, requireRole } = require('../../PortalCliente/Api');

const router = express.Router();
router.get('/contractor/profile', requireRole('constructora'), asyncHandler(controller.ownContractorProfile));
router.patch('/contractor/profile', requireRole('constructora'), asyncHandler(controller.updateContractorProfile));
router.get('/contractor/services', requireRole('constructora'), asyncHandler(controller.ownServices));
router.post('/contractor/services', requireRole('constructora'), asyncHandler(controller.createService));
router.patch('/contractor/services/:id', requireRole('constructora'), asyncHandler(controller.updateService));
router.delete('/contractor/services/:id', requireRole('constructora'), asyncHandler(controller.deleteService));
router.get('/contractor/quotes', requireRole('constructora'), asyncHandler(controller.listContractorQuotes));
router.patch('/contractor/quotes/:id', requireRole('constructora'), asyncHandler(controller.respondQuote));
router.get('/contractor/offer-projects', requireRole('constructora'), asyncHandler(controller.listOfferProjects));
router.get('/contractor/offers', requireRole('constructora'), asyncHandler(controller.listContractorOffers));
router.post('/contractor/offers/:projectId', requireRole('constructora'), asyncHandler(controller.createOffer));
router.patch('/contractor/offers/:id/withdraw', requireRole('constructora'), asyncHandler(controller.withdrawOffer));

module.exports = router;
