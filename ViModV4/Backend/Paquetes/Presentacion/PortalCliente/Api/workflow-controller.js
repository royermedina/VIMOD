const { WorkflowService } = require('../../../Aplicacion/PedidosPagos');
const OfferService = require('../../../Aplicacion/Cotizaciones').OfferService;

const workflow = new WorkflowService();
const offers = new OfferService();

async function selectProposal(req, res) {
  const proposal = await workflow.selectProposal(req.user.id, req.params.id, req.body && req.body.proposalId);
  res.json({ proposal });
}

async function getSelectedProposal(req, res) {
  res.json({ proposal: await workflow.getSelectedProposal(req.user.id, req.params.id) });
}

async function requestReview(req, res) {
  const review = await workflow.requestReview(req.user.id, req.params.id, req.body || {});
  res.status(201).json({ review });
}

async function listProjectReviews(req, res) {
  res.json(await workflow.listProjectReviews(req.user.id, req.params.id));
}

async function listArchitects(req, res) {
  res.json({ architects: await workflow.listApprovedArchitects() });
}

async function assignReview(req, res) {
  res.json({
    review: await workflow.assignReview(
      req.user.id,
      req.params.id,
      req.params.reviewId,
      req.body && req.body.applicationId,
    ),
  });
}

async function cancelReview(req, res) {
  await workflow.cancelReview(req.user.id, req.params.id, req.params.reviewId);
  res.status(204).end();
}

async function rateReview(req, res) {
  await workflow.rateReview(
    req.user.id,
    req.params.id,
    req.params.reviewId,
    req.body && req.body.rating,
  );
  res.status(204).end();
}

async function publicServices(req, res) {
  res.json({ services: await workflow.filterServices(req.query || {}) });
}

async function listContractors(req, res) {
  res.json({ contractors: await workflow.listApprovedContractors() });
}

async function getContractorProfile(req, res) {
  res.json(await workflow.getContractorProfile(req.params.id));
}

async function requestQuote(req, res) {
  const quotes = await workflow.requestQuote(req.user.id, req.params.id, req.body || {});
  res.status(201).json({ quotes, quote: quotes.length === 1 ? quotes[0] : undefined });
}

async function listClientQuotes(req, res) {
  res.json({ quotes: await workflow.listClientQuotes(req.user.id, req.params.id) });
}

async function listProjectOffers(req, res) {
  res.json({ offers: await offers.listForClient(req.user.id, req.params.id) });
}

async function acceptOffer(req, res) {
  res.json({ offer: await offers.accept(req.user.id, req.params.id, req.params.offerId) });
}

async function acceptQuote(req, res) {
  res.json({
    quote: await workflow.acceptQuote(req.user.id, req.params.id, req.params.quoteId),
  });
}

async function rejectQuote(req, res) {
  res.json({
    quote: await workflow.rejectQuote(req.user.id, req.params.id, req.params.quoteId),
  });
}

async function createOrder(req, res) {
  const order = await workflow.createOrder(
    req.user.id,
    req.params.id,
    req.get('Idempotency-Key'),
    req.body && req.body.quoteId,
    req.body && req.body.offerId,
  );
  res.status(201).json({
    order,
    message: 'El pedido está registrado; puedes continuar con el pago disponible.',
  });
}

async function listOrders(req, res) {
  res.json({ orders: await workflow.listOrders(req.user.id) });
}

async function listPayments(req, res) {
  res.json({ payments: await workflow.listPayments(req.user.id) });
}

async function createPaymentSession(req, res) {
  const session = await workflow.createPaymentSession(req.user.id, req.params.id);
  res.json({ session });
}

async function resolveSimulationPayment(req, res) {
  res.json(await workflow.resolveSimulationPayment(req.user.id, req.params.id, req.body || {}));
}

async function rejectClientConfirmation(req, res) {
  await workflow.rejectClientPaymentConfirmation();
}

async function confirmStripePayment(req, res) {
  res.json(await workflow.confirmStripePayment(req.user.id, req.body && req.body.sessionId));
}

async function cancelStripePayment(req, res) {
  res.json(await workflow.cancelStripePayment(req.user.id, req.params.id));
}

async function requestAdvisor(req, res) {
  const request = await workflow.requestAdvisor(req.user.id, req.body || {});
  res.status(201).json({ request });
}

async function listAdvisorRequests(req, res) {
  res.json({ requests: await workflow.listAdvisorRequests(req.user.id) });
}


module.exports = { selectProposal, getSelectedProposal, requestReview, listProjectReviews, listArchitects, assignReview, cancelReview, rateReview, publicServices, listContractors, getContractorProfile, requestQuote, listClientQuotes, listProjectOffers, acceptOffer, acceptQuote, rejectQuote, createOrder, listOrders, listPayments, createPaymentSession, resolveSimulationPayment, rejectClientConfirmation, confirmStripePayment, cancelStripePayment, requestAdvisor, listAdvisorRequests };
