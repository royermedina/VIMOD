const { HttpError, isObjectId } = require('../../../Nucleo');
const { normalizeProjectInput } = require('../../Dominio/ModeloProyectos');
const {
  ProjectRepository,
  TerrainRepository,
  ProjectAnalysisRepository,
} = require('../../Persistencia/Repositorios');
const ContractedProjectService = require('./contracted-project-service');

class ProjectService {
  constructor(
    projectRepository = new ProjectRepository(),
    terrainRepository = new TerrainRepository(),
    analysisRepository = new ProjectAnalysisRepository(),
    contractedProjectService = new ContractedProjectService()
  ) {
    this.projectRepository = projectRepository;
    this.terrainRepository = terrainRepository;
    this.analysisRepository = analysisRepository;
    this.contractedProjectService = contractedProjectService;
  }

  async create(userId, data) {
    const fields = this.validateProjectData(data);
    const terrain = await this.terrainRepository.findByIdAndUserId(fields.terrainId, userId);
    if (!terrain) throw new HttpError(403, 'El terreno no pertenece al usuario');

    const project = await this.projectRepository.create({
      userId,
      ...fields,
    });
    return this.withPaymentState(project, userId);
  }

  validateProjectData(data) {
    const result = normalizeProjectInput(data);
    if (result.error) throw new HttpError(400, result.error);
    return result.value;
  }

  async list(userId) {
    const projects = await this.projectRepository.findAllByUserId(userId);
    return Promise.all(projects.map((project) => this.withPaymentState(project, userId)));
  }

  async getById(userId, projectId) {
    if (!isObjectId(projectId)) throw new HttpError(400, 'Proyecto no es válido');
    const project = await this.projectRepository.findByIdAndUserId(projectId, userId);
    if (!project) throw new HttpError(404, 'Proyecto no encontrado');
    return this.withPaymentState(project, userId);
  }

  async withPaymentState(project, userId) {
    const payment = await this.contractedProjectService.getPaymentState(project.id, userId);
    return {
      ...project,
      paid: payment.paid,
      contractedProposalId: payment.proposalId,
      contractedOfferId: payment.offerId,
      contractedContractorId: payment.contractorId,
      contractedOrderId: payment.orderId,
      contractedAmount: payment.amount,
      contractedPaidAt: payment.paidAt,
      contractedProvider: payment.provider,
      contractedProposalName: payment.proposalName,
      contractedContractorName: payment.contractorName,
      payment,
    };
  }

  async close(userId, projectId) {
    const project = await this.projectRepository.closeByIdAndUserId(projectId, userId);
    if (project) return this.withPaymentState(project, userId);
    const existing = await this.projectRepository.findByIdAndUserId(projectId, userId);
    if (!existing) throw new HttpError(404, 'Proyecto no encontrado');
    return this.withPaymentState(existing, userId);
  }

  async update(userId, projectId, data) {
    const fields = this.validateProjectData(data);
    const project = await this.projectRepository.findDocumentByIdAndUserId(projectId, userId);
    if (!project) throw new HttpError(404, 'Proyecto no encontrado');
    if (project.estado !== 'Borrador') {
      throw new HttpError(409, 'Solo se pueden editar proyectos en borrador');
    }
    const terrain = await this.terrainRepository.findByIdAndUserId(fields.terrainId, userId);
    if (!terrain) throw new HttpError(403, 'El terreno no pertenece al usuario');
    if (await this.projectRepository.hasWorkflowActivity(project)) {
      throw new HttpError(409, 'No se puede editar un proyecto con actividad relacionada');
    }
    const updated = await this.projectRepository.updateByIdAndUserId(projectId, userId, {
      terrainId: fields.terrainId,
      nombre: fields.nombre,
      presupuesto: fields.presupuesto,
      habitaciones: fields.habitaciones,
      banos: fields.banos,
    });
    if (!updated) throw new HttpError(409, 'El proyecto ya no está disponible para editar');
    const analysisInputsChanged = project.terrainId.toHexString() !== fields.terrainId
      || project.presupuesto !== fields.presupuesto
      || project.habitaciones !== fields.habitaciones
      || project.banos !== fields.banos;
    if (analysisInputsChanged) {
      await Promise.all([
        this.analysisRepository.markStale(projectId, userId),
        this.projectRepository.markProposalsStale(projectId, userId),
      ]);
    }
    return this.withPaymentState(updated, userId);
  }

  async delete(userId, projectId) {
    const projectDocument = await this.projectRepository.findDocumentByIdAndUserId(projectId, userId);
    if (!projectDocument) throw new HttpError(404, 'Proyecto no encontrado');
    if (projectDocument.estado !== 'Borrador'
      || await this.projectRepository.hasRelatedActivity(projectDocument)) {
      throw new HttpError(409, 'El proyecto tiene actividad o no está en borrador. Puedes archivarlo en su lugar.');
    }
    const deleted = await this.projectRepository.deleteByIdAndUserId(projectId, userId);
    if (!deleted) throw new HttpError(409, 'El proyecto ya no se puede eliminar. Puedes archivarlo en su lugar.');
    return this.projectRepository.toApiProject(projectDocument);
  }

  async archive(userId, projectId) {
    const project = await this.projectRepository.archiveByIdAndUserId(projectId, userId);
    if (!project) throw new HttpError(404, 'Proyecto no encontrado');
    return this.withPaymentState(project, userId);
  }
}

module.exports = ProjectService;
