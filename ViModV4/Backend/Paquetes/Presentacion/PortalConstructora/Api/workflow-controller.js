const { WorkflowService } = require('../../../Aplicacion/PedidosPagos');
const OfferService = require('../../../Aplicacion/Cotizaciones').OfferService;

const workflow = new WorkflowService();
const offers = new OfferService();

async function ownContractorProfile(req, res) {
  res.json(await workflow.ownContractorProfile(req.user.id));
}

async function updateContractorProfile(req, res) {
  res.json(await workflow.updateContractorProfile(req.user.id, req.body || {}));
}

async function ownServices(req, res) {
  res.json({ services: await workflow.listOwnServices(req.user.id) });
}

async function createService(req, res) {
  const service = await workflow.createService(req.user.id, req.body || {});
  res.status(201).json({ service });
}

async function updateService(req, res) {
  const service = await workflow.updateService(req.user.id, req.params.id, req.body || {});
  res.json({ service });
}

async function deleteService(req, res) {
  await workflow.deleteService(req.user.id, req.params.id);
  res.status(204).end();
}

async function listContractorQuotes(req, res) {
  res.json({ quotes: await workflow.listContractorQuotes(req.user.id) });
}

async function listOfferProjects(req, res) {
  res.json({ projects: await offers.listOpenProjects(req.user.id) });
}

async function createOffer(req, res) {
  res.status(201).json({ offer: await offers.create(req.user.id, req.params.projectId, req.body || {}) });
}

async function listContractorOffers(req, res) {
  const [contractorOffers, contractedProjects] = await Promise.all([
    offers.listMine(req.user.id),
    offers.listContractedProjects(req.user.id),
  ]);
  res.json({ offers: contractorOffers, contractedProjects });
}

async function withdrawOffer(req, res) {
  res.json({ offer: await offers.withdraw(req.user.id, req.params.id) });
}

async function respondQuote(req, res) {
  const quote = await workflow.respondQuote(req.user.id, req.params.id, req.body || {});
  res.json({ quote });
}

module.exports = { ownContractorProfile, updateContractorProfile, ownServices, createService, updateService, deleteService, listContractorQuotes, listOfferProjects, createOffer, listContractorOffers, withdrawOffer, respondQuote };
