const { WorkflowService } = require('../../../Aplicacion/PedidosPagos');

const workflow = new WorkflowService();

async function listAssignedReviews(req, res) {
  res.json({ reviews: await workflow.listAssignedReviews(req.user.id) });
}

async function getArchitectProfile(req, res) {
  res.json({ profile: await workflow.architectProfile(req.user.id) });
}

async function updateArchitectProfile(req, res) {
  res.json({ profile: await workflow.updateArchitectProfile(req.user.id, req.body || {}) });
}

async function applyToReview(req, res) {
  res.status(201).json({
    application: await workflow.applyToReview(req.user.id, req.params.id, req.body || {}),
  });
}

async function acceptDirectedReview(req, res) {
  res.json({ review: await workflow.acceptDirectedReview(req.user.id, req.params.id) });
}

async function rejectDirectedReview(req, res) {
  res.json({ review: await workflow.rejectDirectedReview(req.user.id, req.params.id) });
}

async function startReview(req, res) {
  await workflow.startReview(req.user.id, req.params.id);
  res.status(204).end();
}

async function addObservation(req, res) {
  const observation = await workflow.addObservation(req.user, req.params.id, req.body && req.body.observation);
  res.status(201).json({ observation });
}

async function deliverReview(req, res) {
  await workflow.deliverReview(req.user.id, req.params.id, req.body || {});
  res.status(204).end();
}

module.exports = { listAssignedReviews, getArchitectProfile, updateArchitectProfile, applyToReview, acceptDirectedReview, rejectDirectedReview, startReview, addObservation, deliverReview };
