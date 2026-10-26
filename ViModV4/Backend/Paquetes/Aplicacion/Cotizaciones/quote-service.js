const { HttpError, objectId, clean } = require('../../../Nucleo');
const { isApprovedContractor } = require('../Autenticacion');
const { canTransitionQuote } = require('../../Dominio/ModeloComercial');

class QuoteService {
  async requestQuote(ownerId, projectId, data) {
    const project = await this.ownedProject(projectId, ownerId);
    const proposal = await this.getSelectedProposal(ownerId, projectId);
    if (!proposal) throw new HttpError(409, 'Selecciona una propuesta vigente antes de solicitar cotizaciones');
    if (data.proposalId && objectId(data.proposalId, 'Propuesta').toHexString() !== proposal.id) {
      throw new HttpError(409, 'La propuesta seleccionada cambió; actualiza el proyecto antes de continuar');
    }
    const notes = typeof data.notes === 'string' ? data.notes.trim() : '';
    if (notes.length > 2000) throw new HttpError(400, 'Las notas no pueden superar 2000 caracteres');
    let service = null;
    if (data.serviceId) {
      service = await this.serviceRepository.findActiveById(objectId(data.serviceId, 'Servicio'));
      if (!service) throw new HttpError(404, 'Publicación no disponible');
    }
    const requestedIds = service
      ? [service.ownerId]
      : Array.isArray(data.constructorIds)
        ? data.constructorIds.map((id) => objectId(id, 'Constructora'))
        : [objectId(data.constructorId, 'Constructora')];
    const uniqueIds = [...new Map(requestedIds.map((id) => [id.toHexString(), id])).values()];
    if (!uniqueIds.length || uniqueIds.length > 20) {
      throw new HttpError(400, 'Selecciona entre una y 20 constructoras');
    }
    if (uniqueIds.length !== requestedIds.length) {
      throw new HttpError(400, 'No repitas una constructora en la solicitud');
    }
    if (service && data.constructorIds
      && (uniqueIds.length !== 1 || !uniqueIds[0].equals(service.ownerId))) {
      throw new HttpError(400, 'La publicación pertenece a otra constructora');
    }
    const contractors = await this.userRepository.findByIds(uniqueIds);
    const contractorMap = new Map(contractors.map((contractor) => [
      contractor._id.toHexString(), contractor,
    ]));
    for (const contractorId of uniqueIds) {
      if (!isApprovedContractor(contractorMap.get(contractorId.toHexString()))) {
        throw new HttpError(404, 'Una de las constructoras no está disponible');
      }
    }
    const active = await this.quoteRequestRepository.findActiveForProject(
      project._id,
      project.ownerId,
      uniqueIds,
    );
    if (active) {
      const name = contractorMap.get(active.contractorId.toHexString()).contractorProfile?.commercialName;
      throw new HttpError(409, `Ya existe una solicitud activa para este proyecto y constructora${name ? ` (${name})` : ''}`);
    }
    const now = new Date();
    const reservedIds = [];
    const requests = [];
    try {
      for (const contractorId of uniqueIds) {
        const reserved = await this.projectRepository.reserveQuoteContractor(
          project._id,
          project.ownerId,
          contractorId,
        );
        if (!reserved.modifiedCount) {
          throw new HttpError(409, 'Ya existe una solicitud activa para este proyecto y constructora');
        }
        reservedIds.push(contractorId);
      }
      const documents = uniqueIds.map((contractorId) => {
        const contractor = contractorMap.get(contractorId.toHexString());
        return {
          projectId: project._id,
          ownerId: project.ownerId,
          contractorId,
          proposalId: proposal._id ? objectId(proposal.id, 'Propuesta') : project.selectedProposalId,
          serviceId: service ? service._id : null,
          serviceName: service ? service.name : null,
          contractorName: contractor.contractorProfile?.commercialName || 'No indicado',
          notes,
          status: 'requested',
          active: true,
          response: null,
          createdAt: now,
          updatedAt: now,
        };
      });
      for (const document of documents) {
        requests.push(clean(await this.quoteRequestRepository.create(document)));
      }
      return requests;
    } catch (error) {
      if (requests.length) {
        await this.quoteRequestRepository.deleteCreatedForProject(
          project._id,
          project.ownerId,
          uniqueIds,
          now,
        );
      }
      if (reservedIds.length) {
        await this.projectRepository.releaseQuoteContractors(
          project._id,
          project.ownerId,
          reservedIds,
        );
      }
      throw error;
    }
  }

  async releaseQuoteSlot(quote) {
    await this.projectRepository.releaseQuoteContractor(
      quote.projectId,
      quote.ownerId,
      quote.contractorId,
    );
  }

  async expireQuoteIfNeeded(quote) {
    const validUntil = quote.response && new Date(quote.response.validUntil);
    if (quote.status !== 'responded' || !validUntil
      || !Number.isFinite(validUntil.getTime()) || validUntil > new Date()) return quote;
    const result = await this.quoteRequestRepository.expireIfDue(quote._id, new Date(), new Date());
    if (!result.modifiedCount) {
      return this.quoteRequestRepository.findById(quote._id);
    }
    await this.releaseQuoteSlot(quote);
    return { ...quote, status: 'expired', active: false };
  }

  async listClientQuotes(ownerId, projectId) {
    const project = await this.ownedProject(projectId, ownerId);
    const items = await this.quoteRequestRepository.listByProjectAndOwner(project._id, project.ownerId);
    const results = [];
    for (const item of items) {
      results.push(clean(await this.expireQuoteIfNeeded(item)));
    }
    return results;
  }

  async listContractorQuotes(contractorId) {
    const items = await this.quoteRequestRepository.listByContractor(
      objectId(contractorId, 'Constructora'),
    );
    return Promise.all(items.map(async (item) => {
      const currentItem = await this.expireQuoteIfNeeded(item);
      const [project, owner] = await Promise.all([
        this.projectRepository.findDocumentById(item.projectId),
        this.userRepository.findNameById(item.ownerId),
      ]);
      const terrain = project && project.terrainId
        ? await this.terrainRepository.findDocumentByIdAndOwner(project.terrainId, item.ownerId)
        : null;
      const paymentState = project
        ? await this.contractedProjectService.getPaymentState(project._id, item.ownerId)
        : null;
      const proposalId = paymentState && paymentState.paid && paymentState.proposalId
        ? objectId(paymentState.proposalId, 'Propuesta')
        : item.proposalId || (project && project.selectedProposalId);
      const proposal = project && proposalId
        ? await this.proposalRepository.findForContract(item.projectId, item.ownerId, proposalId)
        : null;
      return {
        ...clean(currentItem),
        project: project ? {
          id: project._id.toHexString(),
          nombre: project.nombre,
          presupuesto: project.presupuesto,
          habitaciones: project.habitaciones,
          banos: project.banos,
          terrain: terrain ? {
            ubicacion: terrain.ubicacion,
            ancho: terrain.ancho,
            largo: terrain.largo,
            area: terrain.area,
          } : null,
        } : null,
        clientName: owner ? owner.nombre : 'Cliente',
        proposal: proposal ? {
          nombre: proposal.name,
          descripcion: proposal.description,
          modules: proposal.modules,
          estimate: proposal.estimate,
        } : null,
      };
    }));
  }

  async respondQuote(contractorId, quoteId, { items, currency, message, estimatedDays, validUntil }) {
    const days = Number(estimatedDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new HttpError(400, 'El plazo debe ser un número entero de días entre 1 y 3650');
    }
    if (currency && currency !== 'COP') {
      throw new HttpError(400, 'La moneda admitida actualmente es COP');
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
      throw new HttpError(400, 'Incluye entre una y 50 partidas en la cotización');
    }
    const normalizedItems = items.map((item) => {
      const concept = typeof item.concept === 'string' ? item.concept.trim() : '';
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      if (!concept || concept.length > 120) {
        throw new HttpError(400, 'Cada concepto debe tener entre 1 y 120 caracteres');
      }
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000) {
        throw new HttpError(400, 'La cantidad de cada partida debe ser positiva');
      }
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new HttpError(400, 'El precio unitario de cada partida debe ser mayor que cero');
      }
      const subtotal = Math.round(quantity * unitPrice * 100) / 100;
      return { concept, quantity, unitPrice, subtotal };
    });
    const total = Math.round(normalizedItems.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
    if (!Number.isFinite(total) || total <= 0) {
      throw new HttpError(400, 'El total de la cotización debe ser mayor que cero');
    }
    const validity = new Date(validUntil);
    if (!Number.isFinite(validity.getTime()) || validity <= new Date()) {
      throw new HttpError(400, 'La vigencia debe ser una fecha futura válida');
    }
    const quoteMessage = typeof message === 'string' ? message.trim() : '';
    if (quoteMessage.length > 2000) throw new HttpError(400, 'El alcance no puede superar 2000 caracteres');
    const result = await this.quoteRequestRepository.respond(
      objectId(quoteId, 'Cotización'),
      objectId(contractorId, 'Constructora'),
      {
        items: normalizedItems,
        amount: total,
        currency: 'COP',
        message: quoteMessage,
        estimatedDays: days,
        validUntil: validity,
        respondedAt: new Date(),
      },
      new Date(),
    );
    if (!result) throw new HttpError(404, 'Cotización no disponible');
    return clean(result);
  }

  async acceptQuote(ownerId, projectId, quoteId) {
    const project = await this.ownedProject(projectId, ownerId);
    const quote = await this.quoteRequestRepository.findForProject(
      objectId(quoteId, 'Cotización'),
      project._id,
      project.ownerId,
    );
    if (!quote || !canTransitionQuote(quote.status, 'accepted') || !quote.active) {
      throw new HttpError(409, 'Solo se pueden aceptar cotizaciones recibidas y activas');
    }
    const current = await this.expireQuoteIfNeeded(quote);
    if (current.status === 'expired') throw new HttpError(409, 'La cotización venció y no se puede aceptar');
    const result = await this.quoteRequestRepository.accept(
      quote._id,
      project._id,
      project.ownerId,
      new Date(),
      new Date(),
      new Date(),
    );
    if (!result) throw new HttpError(409, 'La cotización venció o cambió de estado');
    await this.releaseQuoteSlot(result);
    return clean(result);
  }

  async rejectQuote(ownerId, projectId, quoteId) {
    const project = await this.ownedProject(projectId, ownerId);
    const result = await this.quoteRequestRepository.reject(
      objectId(quoteId, 'Cotización'),
      project._id,
      project.ownerId,
      new Date(),
      new Date(),
    );
    if (!result) throw new HttpError(409, 'Solo se pueden rechazar cotizaciones recibidas y activas');
    await this.releaseQuoteSlot(result);
    return clean(result);
  }
}

module.exports = QuoteService;
