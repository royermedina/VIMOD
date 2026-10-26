const express = require('express');
const controller = require('./admin-controller');
const { asyncHandler, requireAuth, loadUser, requireRole } = require('../../PortalCliente/Api');

const router = express.Router();
router.use(requireAuth, loadUser, requireRole('admin'));
router.get('/overview', asyncHandler(controller.overview));
router.get('/users', asyncHandler(controller.users));
router.get('/role-requests', asyncHandler(controller.roleRequests));
router.patch('/users/:id/status', asyncHandler(controller.setUserStatus));
router.patch('/role-requests/:id', asyncHandler(controller.decideRoleRequest));
router.get('/projects', (req, res, next) => { req.params.name = 'projects'; next(); }, asyncHandler(controller.collection));
router.get('/orders', (req, res, next) => { req.params.name = 'orders'; next(); }, asyncHandler(controller.collection));
router.get('/reviews', (req, res, next) => { req.params.name = 'reviewRequests'; next(); }, asyncHandler(controller.collection));
router.patch('/reviews/:id/assign', asyncHandler(controller.assignReview));
router.get('/quotes', (req, res, next) => { req.params.name = 'quoteRequests'; next(); }, asyncHandler(controller.collection));
router.get('/services', (req, res, next) => { req.params.name = 'services'; next(); }, asyncHandler(controller.collection));
router.get('/advisor-requests', asyncHandler(controller.advisorRequests));
router.patch('/advisor-requests/:id', asyncHandler(controller.updateAdvisorRequest));
router.get('/payments', (req, res, next) => { req.params.name = 'payments'; next(); }, asyncHandler(controller.collection));
router.get('/audit', asyncHandler(controller.audit));

module.exports = router;
