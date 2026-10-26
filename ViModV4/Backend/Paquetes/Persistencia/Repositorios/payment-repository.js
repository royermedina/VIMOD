const { getDb, parseObjectId } = require('../AccesoDatos');

class PaymentRepository {
  async findOrderForOwner(orderId, ownerId) {
    return getDb().collection('orders').findOne({
      _id: parseObjectId(orderId, 'Pedido'),
      ownerId: parseObjectId(ownerId, 'Usuario'),
    });
  }

  async findPaymentByOrder(orderId) {
    return getDb().collection('payments').findOne({
      orderId: parseObjectId(orderId, 'Pedido'),
    });
  }

  async findPaymentDetails(paymentId, ownerId) {
    return getDb().collection('payments').findOne(
      { _id: paymentId, ownerId },
      {
        projection: {
          provider: 1, simulated: 1, reference: 1, status: 1, amount: 1,
          currency: 1, method: 1, attempts: 1, updatedAt: 1,
        },
      },
    );
  }

  async findPaymentForOrder(paymentId, orderId) {
    return getDb().collection('payments').findOne({
      _id: paymentId,
      orderId,
    });
  }

  async findLatestForOrder(orderId) {
    return getDb().collection('payments').findOne({ orderId });
  }

  async listForOwner(ownerId) {
    return getDb().collection('payments').find({ ownerId })
      .sort({ updatedAt: -1 }).toArray();
  }

  async createOrFindSimulationPayment(order, provider, now) {
    return getDb().collection('payments').findOneAndUpdate(
      { orderId: order._id },
      {
        $setOnInsert: {
          orderId: order._id,
          ownerId: order.ownerId,
          amount: order.amount,
          currency: order.currency,
          provider,
          simulated: true,
          status: 'created',
          attempts: [],
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
  }

  async updateSimulationSession(payment, session, now, addAttempt) {
    const update = {
      $set: {
        provider: payment.provider,
        simulated: true,
        reference: session.reference,
        status: 'pending',
        method: null,
        updatedAt: now,
      },
    };
    if (payment.reference && payment.reference !== session.reference) {
      update.$push = {
        referenceHistory: {
          reference: payment.reference,
          status: payment.status,
          method: payment.method || null,
          updatedAt: payment.updatedAt || now,
        },
      };
    }
    if (addAttempt) {
      update.$push = update.$push || {};
      update.$push.attempts = {
        reference: session.reference,
        amount: payment.amount,
        currency: payment.currency,
        method: null,
        status: 'pending',
        simulated: true,
        createdAt: now,
        updatedAt: now,
      };
    }
    return getDb().collection('payments').updateOne({ _id: payment._id }, update);
  }

  async findForOwner(paymentId, ownerId) {
    return getDb().collection('payments').findOne({ _id: paymentId, ownerId });
  }

  async resolvePendingSimulation(
    payment,
    paymentStatus,
    method,
    failureReason,
    cancellationReason,
    reason,
    now,
  ) {
    const update = {
      $set: {
        status: paymentStatus,
        method,
        failureReason,
        cancellationReason,
        updatedAt: now,
        'attempts.$.status': paymentStatus,
        'attempts.$.method': method,
        'attempts.$.reason': reason || null,
        'attempts.$.updatedAt': now,
      },
    };
    return getDb().collection('payments').updateOne(
      {
        _id: payment._id,
        ownerId: payment.ownerId,
        status: 'pending',
        'attempts.reference': payment.reference,
      },
      update,
    );
  }

  async findById(id) {
    return getDb().collection('payments').findOne({ _id: id });
  }

  async listForAdmin(limit) {
    return getDb().collection('payments').find({})
      .sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async countAll() {
    return getDb().collection('payments').countDocuments();
  }

  async ensurePayment(order) {
    const db = getDb();
    const now = new Date();
    const result = await db.collection('payments').findOneAndUpdate(
      { orderId: order._id },
      {
        $setOnInsert: {
          orderId: order._id,
          ownerId: order.ownerId,
          amount: order.amount,
          currency: order.currency,
          provider: 'stripe',
          simulated: false,
          status: 'created',
          attempts: [],
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    await db.collection('orders').updateOne(
      { _id: order._id, ownerId: order.ownerId },
      { $set: { paymentId: result._id } },
    );
    return result;
  }

  async findProposalName(order) {
    if (!order.proposalId) return null;
    const proposal = await getDb().collection('proposals').findOne({
      _id: order.proposalId,
      projectId: order.projectId,
      ownerId: order.ownerId,
    }, { projection: { name: 1, nombre: 1 } });
    return proposal && (proposal.name || proposal.nombre) || null;
  }

  async saveStripeSession(payment, order, data) {
    const now = new Date();
    const updated = await getDb().collection('payments').findOneAndUpdate(
      { _id: payment._id, ownerId: payment.ownerId, orderId: order._id, status: { $ne: 'approved' } },
      {
        $set: {
          provider: 'stripe',
          simulated: false,
          stripeSessionId: data.stripeSessionId,
          stripeSessionUrl: data.url,
          amount: data.amountCop,
          amountCop: data.amountCop,
          amountUsdCents: data.amountUsdCents,
          copPerUsd: data.copPerUsd,
          currency: 'COP',
          status: 'pending',
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) return null;
    await getDb().collection('orders').updateOne(
      { _id: order._id, ownerId: order.ownerId, paymentId: payment._id },
      { $set: { orderStatus: 'payment_pending', paymentStatus: 'pending', updatedAt: now } },
    );
    return updated;
  }

  async findPaymentByStripeSession(sessionId) {
    return getDb().collection('payments').findOne({
      provider: 'stripe',
      stripeSessionId: sessionId,
    });
  }

  async markStripeResult(payment, status) {
    const db = getDb();
    const now = new Date();
    const paymentStatus = status === 'paid' ? 'approved' : status;
    const orderStatus = status === 'paid'
      ? 'paid'
      : status === 'expired' ? 'payment_expired' : 'payment_cancelled';
    const updated = await db.collection('payments').findOneAndUpdate(
      { _id: payment._id, ownerId: payment.ownerId, status: { $ne: 'approved' } },
      { $set: { status: paymentStatus, updatedAt: now } },
      { returnDocument: 'after' },
    );
    if (!updated && payment.status !== 'approved') return null;
    await db.collection('orders').updateOne(
      { _id: payment.orderId, ownerId: payment.ownerId, paymentId: payment._id },
      { $set: { orderStatus, paymentStatus, updatedAt: now } },
    );
    return updated || payment;
  }

  async markStripePending(payment) {
    const now = new Date();
    return getDb().collection('payments').findOneAndUpdate(
      { _id: payment._id, ownerId: payment.ownerId, status: { $ne: 'approved' } },
      { $set: { status: 'pending', updatedAt: now } },
      { returnDocument: 'after' },
    );
  }

  async getOrderById(orderId, ownerId) {
    return this.findOrderForOwner(orderId, ownerId);
  }

  async findPaymentById(paymentId, ownerId) {
    return getDb().collection('payments').findOne({
      _id: parseObjectId(paymentId, 'Pago'),
      ownerId: parseObjectId(ownerId, 'Usuario'),
      provider: 'stripe',
    });
  }

  async markOrderCancellation(payment, order) {
    const now = new Date();
    const result = await getDb().collection('payments').updateOne(
      { _id: payment._id, ownerId: payment.ownerId, status: { $ne: 'approved' } },
      { $set: { status: 'cancelled', updatedAt: now } },
    );
    if (!result.modifiedCount) return this.findPaymentById(payment._id.toHexString(), payment.ownerId.toHexString());
    await getDb().collection('orders').updateOne(
      {
        _id: order._id,
        ownerId: order.ownerId,
        paymentId: payment._id,
        paymentStatus: { $ne: 'approved' },
      },
      { $set: { orderStatus: 'payment_cancelled', paymentStatus: 'cancelled', updatedAt: now } },
    );
    return this.findPaymentById(payment._id.toHexString(), payment.ownerId.toHexString());
  }
}

module.exports = PaymentRepository;
