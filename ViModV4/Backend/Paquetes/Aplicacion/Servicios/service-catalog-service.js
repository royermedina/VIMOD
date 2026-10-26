const {
  HttpError,
  objectId,
  clean,
} = require('../../../Nucleo');
const { isApprovedContractor, resolveRole } = require('../Autenticacion');
const { normalizeAdvisorRequest } = require('../../Dominio/ModeloComercial');

class ServiceCatalogService {
  validateAdvisorRequest(data) {
    const result = normalizeAdvisorRequest(data);
    if (result.error) throw new HttpError(400, result.error);
    return result.value;
  }

  async requestAdvisor(ownerId, data = {}) {
    const ownerObjectId = objectId(ownerId, 'Usuario');
    const fields = this.validateAdvisorRequest(data);
    let project = null;
    if (data.projectId) project = await this.ownedProject(data.projectId, ownerId);
    if (await this.advisorRequestRepository.findActiveDuplicate(
      ownerObjectId,
      project ? project._id : null,
    )) {
      throw new HttpError(409, 'Ya existe una solicitud de asesoría activa para este alcance');
    }
    const now = new Date();
    const document = {
      ownerId: ownerObjectId,
      projectId: project ? project._id : null,
      ...fields,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    try {
      const request = await this.advisorRequestRepository.create(document);
      return this.advisorRequestSummary(request, project);
    } catch (error) {
      if (error.code === 11000) {
        throw new HttpError(409, 'Ya existe una solicitud de asesoría activa para este alcance');
      }
      throw error;
    }
  }

  async listAdvisorRequests(ownerId) {
    const requests = await this.advisorRequestRepository.listByOwner(objectId(ownerId, 'Usuario'));
    return Promise.all(requests.map(async (request) => {
      const project = request.projectId
        ? await this.projectRepository.findNameByIdAndOwner(request.projectId, request.ownerId)
        : null;
      return this.advisorRequestSummary(request, project);
    }));
  }

  advisorRequestSummary(request, project) {
    return {
      id: request._id.toHexString(),
      projectId: request.projectId ? request.projectId.toHexString() : null,
      projectName: project ? project.nombre : null,
      topic: request.topic,
      message: request.message,
      contactMethod: request.contactMethod,
      contact: request.contact,
      status: request.status,
      adminNote: request.adminNote || null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      attendedAt: request.attendedAt || null,
    };
  }

  async listServices() {
    return this.filterServices({});
  }

  async listApprovedContractors() {
    const activeAccounts = await this.userRepository.findActiveAccounts();
    const contractors = activeAccounts.filter((contractor) =>
      resolveRole(contractor) === 'constructora'
      && ['aprobado', 'approved', 'active', 'activo'].includes(
        String(contractor.accountStatus || '').toLowerCase(),
      ));
    return contractors.map((contractor) => ({
      id: contractor._id.toHexString(),
      profile: this.publicContractorProfile(contractor),
    }));
  }

  publicContractorProfile(contractor) {
    const profile = contractor.contractorProfile || {};
    return {
      commercialName: profile.commercialName || 'No indicado',
      description: profile.description || 'No indicado',
      coverageZone: profile.coverageZone || 'No indicado',
      contact: profile.contact || 'No indicado',
      demo: Boolean(contractor.demo),
      recordOrigin: contractor.demo ? 'demo' : 'administrative',
    };
  }

  async getContractorProfile(contractorId) {
    const contractor = await this.userRepository.findPublicProfileById(objectId(contractorId, 'Constructora'));
    if (!isApprovedContractor(contractor)) throw new HttpError(404, 'Constructora no disponible');
    return {
      id: contractor._id.toHexString(),
      profile: this.publicContractorProfile(contractor),
    };
  }

  async ownContractorProfile(ownerId) {
    const contractor = await this.userRepository.findPublicProfileById(objectId(ownerId, 'Constructora'));
    if (!isApprovedContractor(contractor)) throw new HttpError(403, 'La cuenta de constructora debe estar aprobada');
    return {
      id: contractor._id.toHexString(),
      profile: this.publicContractorProfile(contractor),
    };
  }

  validateContractorProfile(data) {
    const profile = {
      commercialName: typeof data.commercialName === 'string' ? data.commercialName.trim() : '',
      description: typeof data.description === 'string' ? data.description.trim() : '',
      coverageZone: typeof data.coverageZone === 'string' ? data.coverageZone.trim() : '',
      contact: typeof data.contact === 'string' ? data.contact.trim() : '',
    };
    const limits = {
      commercialName: 120,
      description: 1000,
      coverageZone: 160,
      contact: 160,
    };
    if (!profile.commercialName) throw new HttpError(400, 'El nombre comercial es obligatorio');
    for (const [field, limit] of Object.entries(limits)) {
      if (profile[field].length > limit) {
        throw new HttpError(400, `El campo ${field} no puede superar ${limit} caracteres`);
      }
    }
    return profile;
  }

  async updateContractorProfile(ownerId, data) {
    const profile = this.validateContractorProfile(data || {});
    const currentUser = await this.userRepository.findDocumentById(objectId(ownerId, 'Constructora'));
    if (!isApprovedContractor(currentUser)) {
      throw new HttpError(403, 'La cuenta de constructora debe estar aprobada');
    }
    const updated = await this.userRepository.updateContractorProfile(ownerId, profile);
    return {
      id: updated._id.toHexString(),
      profile: this.publicContractorProfile(updated),
    };
  }

  async filterServices(filters) {
    const items = await this.serviceRepository.listActive();
    const ownerIds = [...new Map(items
      .filter((item) => item.ownerId && item.ownerId.toHexString)
      .map((item) => [item.ownerId.toHexString(), item.ownerId])).values()];
    const owners = ownerIds.length
      ? await this.userRepository.findByIds(ownerIds, {
        nombre: 1, rol: 1, requestedRole: 1, accountType: 1,
        accountStatus: 1, contractorProfile: 1,
      })
      : [];
    const eligibleOwners = new Map(owners.filter(isApprovedContractor)
      .map((owner) => [owner._id.toHexString(), owner]));
    const contractorId = filters.contractorId
      ? objectId(filters.contractorId, 'Constructora').toHexString()
      : null;
    const minPrice = filters.minPrice === undefined || filters.minPrice === ''
      ? null : Number(filters.minPrice);
    const maxPrice = filters.maxPrice === undefined || filters.maxPrice === ''
      ? null : Number(filters.maxPrice);
    if (minPrice !== null && (!Number.isFinite(minPrice) || minPrice < 0)) {
      throw new HttpError(400, 'El precio mínimo debe ser un número igual o mayor que cero');
    }
    if (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
      throw new HttpError(400, 'El precio máximo debe ser un número igual o mayor que cero');
    }
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      throw new HttpError(400, 'El precio mínimo no puede superar el precio máximo');
    }
    if (filters.type && !['servicio', 'material'].includes(filters.type)) {
      throw new HttpError(400, 'El tipo debe ser servicio o material');
    }
    if (filters.availability && !['disponible', 'no-disponible'].includes(filters.availability)) {
      throw new HttpError(400, 'La disponibilidad no es válida');
    }
    return items.filter((item) => item.ownerId
      && eligibleOwners.has(item.ownerId.toHexString()))
      .map((item) => {
        const owner = eligibleOwners.get(item.ownerId.toHexString());
        return {
          ...clean(item),
          ownerId: item.ownerId.toHexString(),
          type: item.type || 'servicio',
          unit: item.unit || 'No indicado',
          availability: item.availability || 'disponible',
          contractorName: (owner.contractorProfile || {}).commercialName || 'No indicado',
          contractorProfile: this.publicContractorProfile(owner),
        };
      })
      .filter((item) => (!filters.type || item.type === filters.type)
        && (!filters.category || item.category === filters.category)
        && (minPrice === null || (item.price !== null && item.price >= minPrice))
        && (maxPrice === null || (item.price !== null && item.price <= maxPrice))
        && (!contractorId || item.ownerId === contractorId)
        && (!filters.availability || item.availability === filters.availability));
  }

  validateService(data) {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    const category = typeof data.category === 'string' ? data.category.trim() : '';
    const estimatedTime = typeof data.estimatedTime === 'string' ? data.estimatedTime.trim() : '';
    const type = typeof data.type === 'string' ? data.type.trim() : '';
    const unit = typeof data.unit === 'string' ? data.unit.trim() : '';
    const availability = typeof data.availability === 'string'
      ? data.availability.trim() : 'disponible';
    if (!name || name.length > 120) throw new HttpError(400, 'El nombre debe tener entre 1 y 120 caracteres');
    if (!description || description.length > 3000) throw new HttpError(400, 'La descripción debe tener entre 1 y 3000 caracteres');
    if (!category || category.length > 80) throw new HttpError(400, 'La categoría es obligatoria');
    if (estimatedTime.length > 100) throw new HttpError(400, 'El plazo estimado no puede superar 100 caracteres');
    if (!['servicio', 'material'].includes(type)) throw new HttpError(400, 'Selecciona si publicas un servicio o material');
    if (!unit || unit.length > 40) throw new HttpError(400, 'La unidad es obligatoria y no puede superar 40 caracteres');
    const price = Number(data.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new HttpError(400, 'El precio indicativo debe ser mayor que cero');
    }
    if (!['disponible', 'no-disponible'].includes(availability)) {
      throw new HttpError(400, 'Selecciona una disponibilidad válida');
    }
    return {
      name, description, category, estimatedTime, type, unit, availability, price, currency: 'COP',
    };
  }

  async ensureApprovedContractor(ownerId) {
    const contractor = await this.userRepository.findDocumentById(objectId(ownerId, 'Constructora'));
    if (!isApprovedContractor(contractor)) {
      throw new HttpError(403, 'La cuenta de constructora debe estar aprobada');
    }
  }

  async createService(ownerId, data) {
    await this.ensureApprovedContractor(ownerId);
    const fields = this.validateService(data || {});
    const now = new Date();
    const document = {
      ownerId: objectId(ownerId, 'Constructora'),
      ...fields,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    return clean(await this.serviceRepository.create(document));
  }

  async listOwnServices(ownerId) {
    await this.ensureApprovedContractor(ownerId);
    const items = await this.serviceRepository.listByOwner(objectId(ownerId, 'Constructora'));
    return items.map(clean);
  }

  async updateService(ownerId, serviceId, data) {
    await this.ensureApprovedContractor(ownerId);
    const filter = { _id: objectId(serviceId, 'Servicio'), ownerId: objectId(ownerId, 'Constructora') };
    const existing = await this.serviceRepository.findByIdAndOwner(filter._id, filter.ownerId);
    if (!existing) throw new HttpError(404, 'Servicio no encontrado');
    const status = data && data.status !== undefined ? data.status : existing.status;
    if (!['active', 'paused'].includes(status)) throw new HttpError(400, 'El estado de publicación no es válido');
    const fields = this.validateService({
      ...existing,
      ...(data || {}),
      type: data && data.type !== undefined ? data.type : existing.type || 'servicio',
      unit: data && data.unit !== undefined ? data.unit : existing.unit || 'No indicado',
      availability: data && data.availability !== undefined
        ? data.availability : existing.availability || 'disponible',
      price: data && data.price !== undefined ? data.price : existing.price,
    });
    const result = await this.serviceRepository.updateByIdAndOwner(
      filter._id,
      filter.ownerId,
      { ...fields, status, updatedAt: new Date() },
    );
    if (!result) throw new HttpError(404, 'Servicio no encontrado');
    return clean(result);
  }

  async deleteService(ownerId, serviceId) {
    await this.ensureApprovedContractor(ownerId);
    const result = await this.serviceRepository.deleteByIdAndOwner(
      objectId(serviceId, 'Servicio'),
      objectId(ownerId, 'Constructora'),
    );
    if (!result.deletedCount) throw new HttpError(404, 'Servicio no encontrado');
  }
}

module.exports = ServiceCatalogService;
