const {
  HttpError,
  objectId,
  clean,
} = require('../../../Nucleo');
const {
  ProjectRepository,
  ProjectAnalysisRepository,
  ProposalRepository,
} = require('../../Persistencia/Repositorios');
const { proposalCostInCop } = require('../../Dominio/ModeloPropuestas');
const { ContractedProjectService } = require('../Proyectos');

class ProposalWorkflowService {
  constructor(projectRepository = new ProjectRepository(),
    analysisRepository = new ProjectAnalysisRepository(),
    proposalRepository = new ProposalRepository()) {
    this.projectRepository = projectRepository;
    this.analysisRepository = analysisRepository;
    this.proposalRepository = proposalRepository;
    this.contractedProjectService = new ContractedProjectService();
  }

  async selectProposal(ownerId, projectId, proposalId) {
    const project = await this.ownedProject(projectId, ownerId);
    if ((await this.contractedProjectService.getPaymentState(project._id, project.ownerId)).paid) {
      throw new HttpError(409, 'Este proyecto ya tiene una compra pagada y una propuesta contratada');
    }
    const analysis = await this.analysisRepository.findDocumentByProjectAndOwner(
      project._id,
      project.ownerId,
    );
    if (!analysis || analysis.stale) {
      throw new HttpError(409, 'Regenera las propuestas con los datos actuales antes de seleccionar');
    }
    const proposal = await this.proposalRepository.findForSelection(
      objectId(proposalId, 'Propuesta'),
      project._id,
      project.ownerId,
      analysis.inputFingerprint,
    );
    if (!proposal) throw new HttpError(404, 'La propuesta no pertenece a este proyecto');
    const proposalCost = proposalCostInCop(proposal);
    if (!Number.isFinite(proposalCost) || proposalCost <= 0) {
      throw new HttpError(409, 'La propuesta no tiene una estimación válida');
    }
    if (proposal.viable === false || proposalCost > Number(project.presupuesto)) {
      throw new HttpError(409, 'La propuesta supera el presupuesto vigente del proyecto');
    }
    await this.projectRepository.selectProposal(
      project._id,
      project.ownerId,
      proposal._id,
      new Date(),
    );
    return clean({ ...proposal, selected: true });
  }

  async getSelectedProposal(ownerId, projectId) {
    const project = await this.ownedProject(projectId, ownerId);
    const paymentState = await this.contractedProjectService.getPaymentState(project._id, project.ownerId);
    const proposalId = paymentState.paid && paymentState.proposalId
      ? objectId(paymentState.proposalId, 'Propuesta')
      : project.selectedProposalId;
    if (!proposalId) return null;
    if (paymentState.paid && paymentState.proposalId) {
      const contractedProposal = await this.proposalRepository.findForContract(
        project._id,
        project.ownerId,
        proposalId,
      );
      return contractedProposal
        ? clean({ ...contractedProposal, selected: true, contracted: true, paymentState })
        : null;
    }
    const analysis = await this.analysisRepository.findDocumentByProjectAndOwner(
      project._id,
      project.ownerId,
    );
    if (!analysis || analysis.stale) return null;
    const proposal = await this.proposalRepository.findForSelection(
      proposalId,
      project._id,
      project.ownerId,
      analysis.inputFingerprint,
    );
    return proposal
      ? clean({
        ...proposal,
        contracted: paymentState.paid,
        paymentState: paymentState.paid ? paymentState : null,
      })
      : null;
  }
}

module.exports = ProposalWorkflowService;
