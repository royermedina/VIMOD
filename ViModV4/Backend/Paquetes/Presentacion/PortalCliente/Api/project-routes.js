const express = require('express');
const controller = require('./project-controller');
const { asyncHandler, requireAuth, requireRole, loadUser } = require('./index');

const router = express.Router();
router.use(requireAuth, loadUser, requireRole('cliente'));

router.post('/', asyncHandler(controller.create));
router.get('/', asyncHandler(controller.list));
router.patch('/:id', asyncHandler(controller.update));
router.delete('/:id', asyncHandler(controller.remove));
router.patch('/:id/archive', asyncHandler(controller.archive));
router.post('/:id/analyze', asyncHandler(controller.analyze));
router.get('/:id/analysis', asyncHandler(controller.getAnalysis));
router.patch('/:id/close', asyncHandler(controller.close));
router.post('/:id/proposals', asyncHandler(controller.generateProposals));
router.post('/:id/proposals/regenerate', asyncHandler(controller.regenerateProposals));
router.get('/:id/proposals', asyncHandler(controller.listProposals));
router.get('/:id/proposals/:proposalId', asyncHandler(controller.getProposal));
router.get('/:id', asyncHandler(controller.getById));

module.exports = router;
