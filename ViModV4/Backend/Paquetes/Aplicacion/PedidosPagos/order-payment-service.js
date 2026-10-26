const {
  HttpError,
  objectId,
  clean,
} = require('../../../Nucleo');
const { proposalCostInCop } = require('../Propuestas');
const {
  isValidIdempotencyKey,
  SIMULATION_SESSION_ORDER_STATUSES,
  simulationTransition,
} = require('../../Dominio/ModeloPagos');

class OrderPaymentService {
  async createOrder(ownerId, projectId, idempotencyKey, quoteId, offerId) {
    if (!isValidIdempotencyKey(idempotencyKey)) {
      throw new HttpError(400, 'Se requiere una clave de idempotencia válida');
    }
    const project = await this.ownedProject(projectId, ownerId);
    const existingIdempotentOrder = await this.orderRepository.findByOwnerAndIdempotencyKey(
      project.ownerId,
      idempotencyKey,
    );
    if (existingIdempotentOrder) {
      if (!existingIdempotentOrder.projectId.equals(project._id)) {
        throw new HttpError(409, 'La clave de idempotencia ya se utilizó en otro proyecto');
      }
      return this.ensurePayment(existingIdempotentOrder._id, existingIdempotentOrder);
    }
    if ((await this.contractedProjectService.getPaymentState(project._id, project.ownerId)).paid) {
      throw new HttpError(409, 'Este proyecto ya tiene una compra pagada; no se puede crear otro pedido');
    }
    let proposal = null;
    let selectedOffer = null;
    let amount;
    let source;
    if (offerId) {
      selectedOffer = await this.offerRepository.findAcceptedForProject(
        objectId(offerId, 'Oferta'),
        project._id,
        project.ownerId,
      );
      if (!selectedOffer || !Number.isFinite(Number(selectedOffer.precio)) || selectedOffer.precio <= 0) {
        throw new HttpError(409, 'La oferta aceptada no tiene un importe válido');
      }
      amount = Number(selectedOffer.precio);
      source = 'contractor_offer';
    } else {
      if (!project.selectedProposalId) throw new HttpError(400, 'Selecciona una propuesta antes de continuar');
      proposal = await this.proposalRepository.findForContract(
        project._id,
        project.ownerId,
        project.selectedProposalId,
      );
      const proposalCost = proposalCostInCop(proposal);
      if (!Number.isFinite(proposalCost) || proposalCost <= 0 || proposal.viable === false) {
        throw new HttpError(409, 'No hay una propuesta viable seleccionada');
      }
      amount = proposalCost;
      source = 'academic_estimate';
    }
    let linkedQuote = null;
    if (quoteId) {
      linkedQuote = await this.quoteRequestRepository.findRespondedForOrder(
        objectId(quoteId, 'Cotización'),
        project._id,
        project.ownerId,
      );
      if (!linkedQuote || !linkedQuote.response || !Number.isFinite(linkedQuote.response.amount)) {
        throw new HttpError(409, 'La cotización no está respondida y disponible');
      }
      amount = linkedQuote.response.amount;
      source = 'contractor_quote';
    }
    const orderProposalId = proposal ? proposal._id : null;
    const orderQuoteId = linkedQuote ? linkedQuote._id : null;
    const orderOfferId = selectedOffer ? selectedOffer._id : null;
    const existingPendingOrder = await this.orderRepository.findPendingForOffer(
      project.ownerId,
      project._id,
      orderProposalId,
      orderQuoteId,
      orderOfferId,
    );
    if (existingPendingOrder) {
      return this.ensurePayment(existingPendingOrder._id, existingPendingOrder);
    }
    const now = new Date();
    const document = {
      ownerId: project.ownerId,
      projectId: project._id,
      proposalId: orderProposalId,
      quoteId: orderQuoteId,
      offerId: orderOfferId,
      idempotencyKey,
      amount,
      currency: 'COP',
      amountSource: source,
      orderStatus: 'awaiting_payment',
      paymentStatus: 'created',
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const insertedId = await this.orderRepository.create(document);
      return this.ensurePayment(insertedId, document);
    } catch (error) {
      if (error.code === 11000) {
        const existing = await this.orderRepository.findByOwnerAndIdempotencyKey(project.ownerId, idempotencyKey);
        if (existing) return this.ensurePayment(existing._id, existing);
        const existingOffer = await this.orderRepository.findActiveForOffer(
          project.ownerId,
          project._id,
          orderProposalId,
          orderQuoteId,
          orderOfferId,
        );
        if (existingOffer) throw new HttpError(409, 'Ya existe un pedido activo para esta oferta');
        throw new HttpError(409, 'La operación ya fue registrada');
      }
      throw error;
    }
  }

  async ensurePayment(orderId, order) {
    const now = new Date();
    const payment = await this.paymentRepository.createOrFindSimulationPayment(
      { ...order, _id: orderId },
      this.paymentSimulator.provider,
      now,
    );
    await this.orderRepository.updatePaymentLink(orderId, payment._id);
    return clean({ ...order, _id: orderId, paymentId: payment._id });
  }

  async listOrders(ownerId) {
    const items = await this.orderRepository.listByOwner(objectId(ownerId, 'Usuario'));
    return Promise.all(items.map(async (order) => {
      const payment = order.paymentId
        ? await this.paymentRepository.findPaymentDetails(order.paymentId, order.ownerId)
        : null;
      return clean({
        ...order,
        payment: payment ? {
          provider: payment.provider,
          simulated: payment.simulated === true,
          reference: payment.reference || null,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method || null,
          attempts: payment.attempts || [],
          updatedAt: payment.updatedAt,
        } : null,
      });
    }));
  }

  async createPaymentSession(ownerId, orderId) {
    const order = await this.orderRepository.findByIdAndOwner(
      objectId(orderId, 'Pedido'),
      objectId(ownerId, 'Usuario'),
    );
    if (!order) throw new HttpError(404, 'Pedido no encontrado');
    if ((await this.contractedProjectService.getPaymentState(order.projectId, order.ownerId)).paid) {
      throw new HttpError(409, 'Este proyecto ya tiene una compra pagada y no admite otra sesión de pago');
    }
    if (this.stripePaymentService.isEnabled()) {
      return this.stripePaymentService.createCheckoutSession(ownerId, orderId);
    }
    if (!SIMULATION_SESSION_ORDER_STATUSES.includes(order.orderStatus)) {
      throw new HttpError(409, 'El pedido no está disponible para iniciar el pago');
    }
    let payment = order.paymentId
      ? await this.paymentRepository.findPaymentForOrder(order.paymentId, order._id)
      : null;
    if (!payment) {
      await this.ensurePayment(order._id, order);
      payment = await this.paymentRepository.findLatestForOrder(order._id);
    }
    const paymentId = payment && payment._id;
    if (payment && payment.status === 'approved') {
      throw new HttpError(409, 'El pedido ya tiene un pago aprobado');
    }
    const existingReference = payment && payment.status === 'pending' ? payment.reference : null;
    const session = this.paymentSimulator.createSimulationSession({
      orderId: order._id.toHexString(),
      paymentId: paymentId.toHexString(),
      amount: order.amount,
      currency: order.currency,
      reference: existingReference,
    });
    const now = new Date();
    await this.paymentRepository.updateSimulationSession(
      { ...payment, provider: this.paymentSimulator.provider },
      session,
      now,
      !existingReference,
    );
    await this.orderRepository.updatePaymentState(order._id, order.ownerId, null, {
      orderStatus: 'payment_pending',
      paymentStatus: 'pending',
      paymentReference: session.reference,
      updatedAt: now,
    });
    return { ...session, paymentId: paymentId.toHexString() };
  }

  async rejectClientPaymentConfirmation() {
    throw new HttpError(403, 'El estado del pago solo puede confirmarse mediante una notificación verificada del proveedor');
  }

  async confirmStripePayment(ownerId, sessionId) {
    return this.stripePaymentService.confirmSession(ownerId, sessionId);
  }

  async cancelStripePayment(ownerId, orderId) {
    return this.stripePaymentService.cancelSession(ownerId, orderId);
  }

  paymentSummary(payment) {
    if (!payment) return null;
    return {
      id: payment._id.toHexString(),
      reference: payment.reference || null,
      orderId: payment.orderId.toHexString(),
      ownerId: payment.ownerId.toHexString(),
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method || null,
      status: payment.status,
      provider: payment.provider || 'internal_simulation',
      simulated: payment.simulated === true,
      amountCop: payment.amountCop ?? payment.amount,
      amountUsdCents: payment.amountUsdCents ?? null,
      copPerUsd: payment.copPerUsd ?? null,
      failureReason: payment.failureReason || null,
      cancellationReason: payment.cancellationReason || null,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      attempts: (payment.attempts || []).map((attempt) => ({
        reference: attempt.reference,
        amount: attempt.amount,
        currency: attempt.currency,
        method: attempt.method || null,
        status: attempt.status,
        simulated: attempt.simulated === true,
        reason: attempt.reason || null,
        createdAt: attempt.createdAt,
        updatedAt: attempt.updatedAt,
      })),
    };
  }

  async listPayments(ownerId) {
    const payments = await this.paymentRepository.listForOwner(objectId(ownerId, 'Usuario'));
    return payments.map((payment) => this.paymentSummary(payment));
  }

  async resolveSimulationPayment(ownerId, paymentId, data = {}) {
    const payment = await this.paymentRepository.findForOwner(
      objectId(paymentId, 'Pago'),
      objectId(ownerId, 'Usuario'),
    );
    if (!payment) throw new HttpError(404, 'Pago no encontrado');
    const method = this.paymentSimulator.validateMethod(data.method);
    const result = this.paymentSimulator.validateResult(data.result);
    const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
    if (reason.length > 500) throw new HttpError(400, 'El motivo no puede superar 500 caracteres');
    if (payment.status === 'approved' && result === 'approved') {
      await this.contractedProjectService.finalizePaidOrder(
        payment.orderId.toHexString(),
        payment._id.toHexString(),
        payment.provider || this.paymentSimulator.provider,
        payment.updatedAt || new Date(),
      );
      const currentPayment = await this.paymentRepository.findById(payment._id);
      return { payment: this.paymentSummary(currentPayment), orderStatus: 'paid' };
    }
    if (payment.status !== 'pending') {
      throw new HttpError(409, 'El intento de pago ya tiene un resultado y no puede modificarse');
    }
    const next = simulationTransition(result);
    const now = new Date();
    const updatedPayment = await this.paymentRepository.resolvePendingSimulation(
      payment,
      next.paymentStatus,
      method,
      result === 'declined' ? (reason || 'Pago rechazado en la simulación') : null,
      result === 'cancelled' ? (reason || 'Cancelado por el usuario') : null,
      reason,
      now,
    );
    if (!updatedPayment.modifiedCount) {
      throw new HttpError(409, 'El intento de pago cambió y no pudo actualizarse');
    }
    const orderFields = {
      orderStatus: next.orderStatus,
      paymentStatus: next.paymentStatus,
      updatedAt: now,
    };
    if (result === 'declined') orderFields.paymentFailureReason = reason || 'Pago rechazado en la simulación';
    if (result === 'cancelled') orderFields.paymentCancellationReason = reason || 'Cancelado por el usuario';
    await this.orderRepository.updatePaymentState(
      payment.orderId,
      payment.ownerId,
      payment._id,
      orderFields,
      result === 'approved' || result === 'pending',
    );
    if (result === 'approved') {
      await this.contractedProjectService.finalizePaidOrder(
        payment.orderId.toHexString(),
        payment._id.toHexString(),
        payment.provider || this.paymentSimulator.provider,
        now,
      );
    }
    const updated = await this.paymentRepository.findById(payment._id);
    return { payment: this.paymentSummary(updated), orderStatus: next.orderStatus };
  }

}

module.exports = OrderPaymentService;
