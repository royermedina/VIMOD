const { HttpError } = require('../../../Nucleo');
const {
  ArchitectObservationRepository,
  AdvisorRequestRepository,
  OfferRepository,
  OrderRepository,
  PaymentRepository,
  ProjectAnalysisRepository,
  ProjectRepository,
  ProposalRepository,
  QuoteRequestRepository,
  ReviewRequestRepository,
  ServiceRepository,
  TerrainRepository,
  UserRepository,
} = require('../../Persistencia/Repositorios');
const ContractedProjectService = require('./contracted-project-service');

class WorkflowContext {
  constructor(paymentSimulator, stripePaymentService) {
    this.paymentSimulator = paymentSimulator;
    this.stripePaymentService = stripePaymentService;
    this.projectRepository = new ProjectRepository();
    this.userRepository = new UserRepository();
    this.contractedProjectService = new ContractedProjectService();
    this.architectObservationRepository = new ArchitectObservationRepository();
    this.advisorRequestRepository = new AdvisorRequestRepository();
    this.offerRepository = new OfferRepository();
    this.orderRepository = new OrderRepository();
    this.paymentRepository = new PaymentRepository();
    this.projectAnalysisRepository = new ProjectAnalysisRepository();
    this.analysisRepository = this.projectAnalysisRepository;
    this.proposalRepository = new ProposalRepository();
    this.quoteRequestRepository = new QuoteRequestRepository();
    this.reviewRequestRepository = new ReviewRequestRepository();
    this.serviceRepository = new ServiceRepository();
    this.terrainRepository = new TerrainRepository();
  }

  async ownedProject(projectId, ownerId) {
    const project = await this.projectRepository.findDocumentByIdAndUserId(projectId, ownerId);
    if (!project) throw new HttpError(404, 'Proyecto no encontrado');
    return project;
  }
}

module.exports = WorkflowContext;
