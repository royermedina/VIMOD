const { ObjectId } = require('mongodb');
const { isApprovedContractor } = require('../Autenticacion');
const { HttpError } = require('../../../Nucleo');
const { normalizeOfferInput } = require('../../Dominio/ModeloComercial');
const {
  OfferRepository,
  ProposalModelRepository,
  ProjectRepository,
  TerrainRepository,
  UserRepository,
} = require('../../Persistencia/Repositorios');
const { ContractedProjectService } = require('../Proyectos');

function objectId(id, label) {
  try {
    return new ObjectId(id);
  } catch (error) {
    throw new HttpError(400, `${label} no válido`);
  }
}

class OfferService {
  constructor(
    offerRepository = new OfferRepository(),
    modelRepository = new ProposalModelRepository(),
    userRepository = new UserRepository(),
    projectRepository = new ProjectRepository(),
    terrainRepository = new TerrainRepository(),
  ) {
    this.offerRepository = offerRepository;
    this.modelRepository = modelRepository;
    this.userRepository = userRepository;
    this.projectRepository = projectRepository;
    this.terrainRepository = terrainRepository;
    this.contractedProjectService = new ContractedProjectService();
  }

  async contractor(contractorId) {
    const user = await this.userRepository.findDocumentById(objectId(contractorId, 'Constructora'));
    if (!isApprovedContractor(user)) throw new HttpError(403, 'La cuenta de constructora debe estar aprobada');
    return user;
  }

  async listOpenProjects(contractorId) {
    await this.contractor(contractorId);
    const projects = await this.offerRepository.listOpenProjects();
    const openProjects = [];
    for (const project of projects) {
      if ((await this.contractedProjectService.getPaymentState(project._id, project.ownerId)).paid) continue;
      openProjects.push(project);
    }
    return Promise.all(openProjects.map(async (project) => {
      const terrain = await this.terrainRepository.findProjectSummaryByIdAndOwner(
        project.terrainId,
        project.ownerId,
      );
      return {
        id: project._id.toHexString(),
        nombre: project.nombre,
        presupuesto: project.presupuesto,
        habitaciones: project.habitaciones,
        banos: project.banos,
        estado: project.estado,
        terrain: terrain ? {
          ubicacion: terrain.ubicacion,
          ancho: terrain.ancho,
          largo: terrain.largo,
          area: terrain.area,
        } : null,
      };
    }));
  }

  async create(contractorId, projectId, data = {}) {
    await this.contractor(contractorId);
    const project = await this.offerRepository.findProject(projectId);
    if (project
      && (await this.contractedProjectService.getPaymentState(project._id, project.ownerId)).paid) {
      throw new HttpError(409, 'El proyecto ya fue contratado y no acepta nuevas ofertas');
    }
    if (!project || !['Borrador', 'En revisión'].includes(project.estado) || project.offersOpen === false) {
      throw new HttpError(404, 'Proyecto no disponible para ofertas');
    }
    const normalizedOffer = normalizeOfferInput(data);
    if (normalizedOffer.error) throw new HttpError(400, normalizedOffer.error);
    const { precio, plazoDias, inclusiones } = normalizedOffer.value;
    let model = null;
    if (data.modelId) {
      model = await this.modelRepository.findById(data.modelId);
      if (!model || !model.contractorId || model.contractorId.toHexString() !== contractorId) {
        throw new HttpError(403, 'El modelo no pertenece a la constructora');
      }
    }
    const now = new Date();
    const document = {
      projectId: project._id,
      ownerId: project.ownerId,
      contractorId: objectId(contractorId, 'Constructora'),
      modelId: model ? model._id : null,
      precio,
      moneda: 'COP',
      plazoDias,
      inclusiones,
      status: 'enviada',
      active: true,
      seed: false,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const saved = await this.offerRepository.insert(document);
      return this.toApi(saved, project, model);
    } catch (error) {
      if (error.code === 11000) throw new HttpError(409, 'Ya existe una oferta activa de esta constructora para el proyecto');
      throw error;
    }
  }

  async listMine(contractorId) {
    await this.contractor(contractorId);
    const offers = await this.offerRepository.listByContractor(contractorId);
    return Promise.all(offers.map(async (offer) => {
      const project = await this.offerRepository.findProject(offer.projectId);
      const model = offer.modelId ? await this.modelRepository.findById(offer.modelId) : null;
      return this.toApi(offer, project, model);
    }));
  }

  async listContractedProjects(contractorId) {
    await this.contractor(contractorId);
    return this.contractedProjectService.listForContractor(contractorId);
  }

  async listForClient(ownerId, projectId) {
    const project = await this.projectRepository.findDocumentByIdAndUserId(projectId, ownerId);
    if (!project) throw new HttpError(404, 'Proyecto no encontrado');
    const offers = await this.offerRepository.listByProject(projectId, ownerId);
    return Promise.all(offers.map(async (offer) => {
      const contractor = await this.userRepository.findContractorNameAndProfile(offer.contractorId);
      const model = offer.modelId ? await this.modelRepository.findById(offer.modelId) : null;
      return this.toApi(offer, project, model, contractor);
    }));
  }

  async withdraw(contractorId, offerId) {
    await this.contractor(contractorId);
    const offer = await this.offerRepository.withdraw(contractorId, offerId);
    if (!offer) throw new HttpError(409, 'La oferta no está disponible para retirar');
    return this.toApi(offer);
  }

  async accept(ownerId, projectId, offerId) {
    const project = await this.projectRepository.findDocumentByIdAndUserId(projectId, ownerId);
    if (!project) throw new HttpError(404, 'Proyecto no encontrado');
    if ((await this.contractedProjectService.getPaymentState(project._id, project.ownerId)).paid) {
      throw new HttpError(409, 'El proyecto ya fue contratado y no admite aceptar otra oferta');
    }
    const result = await this.offerRepository.acceptForProject(
      objectId(offerId, 'Oferta'),
      project._id,
      project.ownerId,
      new Date(),
    );
    if (!result) throw new HttpError(409, 'La oferta no está disponible para aceptar');
    return this.toApi(result, project);
  }

  toApi(offer, project, model, contractor) {
    if (!offer) return null;
    const profile = contractor && contractor.contractorProfile || {};
    return {
      id: offer._id.toHexString(), projectId: offer.projectId.toHexString(), contractorId: offer.contractorId.toHexString(),
      modelId: offer.modelId ? offer.modelId.toHexString() : null, precio: offer.precio, moneda: offer.moneda,
      plazoDias: offer.plazoDias, inclusiones: offer.inclusiones || [],
      estado: offer.status || offer.estado, active: offer.active,
      seed: offer.seed === true, createdAt: offer.createdAt, updatedAt: offer.updatedAt,
      project: project ? { id: project._id.toHexString(), nombre: project.nombre, presupuesto: project.presupuesto } : null,
      contractorName: contractor ? (profile.commercialName || contractor.nombre) : null,
      modelName: model ? model.nombre : null,
    };
  }
}

module.exports = OfferService;
