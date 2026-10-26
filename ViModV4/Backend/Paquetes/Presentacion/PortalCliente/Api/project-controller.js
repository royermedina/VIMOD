const ProjectService = require('../../../Aplicacion/Proyectos');
const { ProjectAnalysisService, ProposalService } = require('../../../Aplicacion/Propuestas');

const projectService = new ProjectService();
const projectAnalysisService = new ProjectAnalysisService();
const proposalService = new ProposalService({ analysisService: projectAnalysisService });

async function create(req, res) {
  const project = await projectService.create(req.user.id, req.body || {});
  res.status(201).json({ project });
}

async function list(req, res) {
  const projects = await projectService.list(req.user.id);
  res.json({ projects });
}

async function getById(req, res) {
  const project = await projectService.getById(req.user.id, req.params.id);
  res.json({ project });
}

async function close(req, res) {
  const project = await projectService.close(req.user.id, req.params.id);
  res.json({ project });
}

async function update(req, res) {
  const project = await projectService.update(req.user.id, req.params.id, req.body || {});
  res.json({ project });
}

async function remove(req, res) {
  const project = await projectService.delete(req.user.id, req.params.id);
  res.json({ project });
}

async function archive(req, res) {
  const project = await projectService.archive(req.user.id, req.params.id);
  res.json({ project });
}

async function analyze(req, res) {
  const result = await projectAnalysisService.analyze(req.user.id, req.params.id);
  res.json({ analysis: result.analysis });
}

async function getAnalysis(req, res) {
  const analysis = await projectAnalysisService.get(req.user.id, req.params.id);
  res.json({ analysis });
}

async function generateProposals(req, res) {
  const result = await proposalService.generate(req.user.id, req.params.id, {
    regenerate: req.body && req.body.regenerate === true,
  });
  res.json(result);
}

async function listProposals(req, res) {
  res.json(await proposalService.list(req.user.id, req.params.id));
}

async function getProposal(req, res) {
  const proposal = await proposalService.getById(
    req.user.id,
    req.params.id,
    req.params.proposalId,
  );
  res.json({ proposal });
}

async function regenerateProposals(req, res) {
  const result = await proposalService.generate(req.user.id, req.params.id, {
    regenerate: true,
  });
  res.json(result);
}

module.exports = {
  create,
  list,
  getById,
  close,
  update,
  remove,
  archive,
  analyze,
  getAnalysis,
  generateProposals,
  listProposals,
  getProposal,
  regenerateProposals,
};
