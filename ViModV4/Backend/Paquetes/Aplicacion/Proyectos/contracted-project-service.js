const { ObjectId } = require('mongodb');
const {
  contractedProjectFields,
  isPaidOrder,
  mostRecentPaidOrder,
  normalizeDate,
  paidOrderTimestamp,
} = require('../../Dominio/ModeloProyectos');
const { ContractedProjectRepository } = require('../../Persistencia/Repositorios');

function idString(value) {
  return value && typeof value.toHexString === 'function' ? value.toHexString() : value;
}

class ContractedProjectService {
  constructor(repository = new ContractedProjectRepository()) {
    this.repository = repository;
  }

  async getPaymentState(projectId, ownerId) {
    const projectObjectId = new ObjectId(idString(projectId));
    const ownerObjectId = new ObjectId(idString(ownerId));
    const orders = await this.repository.findOrdersByProjectAndOwner(projectObjectId, ownerObjectId);
    const paidOrders = [];
    for (const order of orders) {
      const payment = await this.repository.findPaymentForOrder(order, ownerObjectId);
      if (!isPaidOrder(order, payment)) continue;
      paidOrders.push({
        order,
        payment,
        paidAt: paidOrderTimestamp({ order, payment }),
      });
    }
    const latest = mostRecentPaidOrder(paidOrders);
    if (!latest) return this.emptyPaymentState();
    return this.toPaymentState(latest, projectObjectId, ownerObjectId);
  }

  emptyPaymentState() {
    return {
      paid: false,
      proposalId: null,
      proposalName: null,
      offerId: null,
      contractorId: null,
      contractorName: null,
      orderId: null,
      amount: null,
      paidAt: null,
      provider: null,
    };
  }

  async toPaymentState(record, projectId, ownerId) {
    const { order, payment, paidAt } = record;
    const offer = order.offerId
      ? await this.repository.findOfferById(order.offerId, projectId, ownerId)
      : null;
    let proposal = order.proposalId
      ? await this.repository.findProposalById(order.proposalId, projectId, ownerId)
      : null;
    if (!proposal && offer && offer.modelId) {
      proposal = await this.repository.findProposalByModelId(offer.modelId, projectId, ownerId);
    }
    const contractorId = offer && offer.contractorId
      ? offer.contractorId
      : proposal && proposal.contractorId
        ? proposal.contractorId
        : null;
    const contractor = contractorId
      ? await this.repository.findContractorSummary(contractorId)
      : null;
    return {
      paid: true,
      proposalId: proposal ? proposal._id.toHexString() : null,
      proposalName: proposal ? proposal.name || proposal.nombre || null : null,
      offerId: offer ? offer._id.toHexString() : null,
      contractorId: contractorId ? contractorId.toHexString() : null,
      contractorName: contractor
        ? contractor.contractorProfile && contractor.contractorProfile.commercialName
          || contractor.nombre || null
        : null,
      orderId: order._id.toHexString(),
      amount: Number(order.amount),
      paidAt,
      provider: payment && payment.provider
        || (payment && payment.simulated ? 'internal_simulation' : null)
        || 'internal_simulation',
    };
  }

  async finalizePaidOrder(orderId, paymentId, provider, paidAt = new Date()) {
    const order = await this.repository.findOrderForPayment(orderId, paymentId);
    if (!order) return null;
    const now = normalizeDate(paidAt) || new Date();
    await this.repository.markOrderPaid(order, now);
    const state = await this.getPaymentState(order.projectId, order.ownerId);
    if (!state.paid) return null;
    const fields = contractedProjectFields(state, provider, now);
    fields.contractedProposalId = fields.contractedProposalId
      ? new ObjectId(fields.contractedProposalId)
      : null;
    fields.contractedOfferId = fields.contractedOfferId
      ? new ObjectId(fields.contractedOfferId)
      : null;
    fields.contractedContractorId = fields.contractedContractorId
      ? new ObjectId(fields.contractedContractorId)
      : null;
    fields.contractedOrderId = new ObjectId(fields.contractedOrderId);
    await this.repository.markProjectContracted(order.projectId, order.ownerId, fields);
    if (state.offerId) {
      await this.repository.acceptOffer(state.offerId, order.projectId, order.ownerId, state.paidAt || now);
    }
    await this.repository.rejectProjectOffers(
      order.projectId,
      order.ownerId,
      state.offerId,
      now,
    );
    return state;
  }

  async listForContractor(contractorId) {
    const contractorObjectId = new ObjectId(idString(contractorId));
    const approvedOrderIds = await this.repository.findApprovedPaymentOrderIds();
    const paidOrders = await this.repository.findPaidOrders(approvedOrderIds);
    const projects = new Map();
    for (const order of paidOrders) {
      const state = await this.getPaymentState(order.projectId, order.ownerId);
      if (!state.paid || state.contractorId !== contractorObjectId.toHexString()) continue;
      const projectKey = order.projectId.toHexString();
      if (projects.has(projectKey)) continue;
      const project = await this.repository.findProjectSummary(order.projectId, order.ownerId);
      if (project) {
        projects.set(projectKey, {
          id: project._id.toHexString(),
          nombre: project.nombre,
          presupuesto: project.presupuesto,
          habitaciones: project.habitaciones,
          banos: project.banos,
          ...state,
        });
      }
    }
    return [...projects.values()];
  }
}

module.exports = ContractedProjectService;
