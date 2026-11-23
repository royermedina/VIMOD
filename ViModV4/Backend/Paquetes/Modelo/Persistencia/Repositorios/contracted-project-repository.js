const { getDb, toObjectId } = require('../AccesoDatos');

class ContractedProjectRepository {
  async findOrdersByProjectAndOwner(projectId, ownerId) {
    return getDb().collection('orders').find({
      projectId: toObjectId(projectId),
      ownerId: toObjectId(ownerId),
    }).toArray();
  }

  async findPaymentForOrder(order, ownerId) {
    const query = {
      orderId: order._id,
      ownerId: toObjectId(ownerId),
    };
    if (order.paymentId) query._id = order.paymentId;
    return getDb().collection('payments').findOne(query);
  }

  async findOfferById(offerId, projectId, ownerId) {
    return getDb().collection('offers').findOne({
      _id: toObjectId(offerId),
      projectId: toObjectId(projectId),
      ownerId: toObjectId(ownerId),
    });
  }

  async findProposalById(proposalId, projectId, ownerId) {
    return getDb().collection('proposals').findOne({
      _id: toObjectId(proposalId),
      projectId: toObjectId(projectId),
      ownerId: toObjectId(ownerId),
    });
  }

  async findProposalByModelId(modelId, projectId, ownerId) {
    return getDb().collection('proposals').findOne({
      modelId: toObjectId(modelId),
      projectId: toObjectId(projectId),
      ownerId: toObjectId(ownerId),
    });
  }

  async findContractorSummary(contractorId) {
    return getDb().collection('users').findOne(
      { _id: toObjectId(contractorId) },
      { projection: { nombre: 1, contractorProfile: 1 } },
    );
  }

  async findOrderForPayment(orderId, paymentId) {
    return getDb().collection('orders').findOne({
      _id: toObjectId(orderId),
      paymentId: toObjectId(paymentId),
    });
  }

  async markOrderPaid(order, paidAt) {
    return getDb().collection('orders').updateOne(
      { _id: order._id, ownerId: order.ownerId, paymentId: order.paymentId },
      {
        $set: {
          orderStatus: 'paid',
          paymentStatus: 'approved',
          paidAt,
          updatedAt: paidAt,
        },
      },
    );
  }

  async markProjectContracted(projectId, ownerId, fields) {
    return getDb().collection('projects').updateOne(
      { _id: toObjectId(projectId), ownerId: toObjectId(ownerId) },
      { $set: fields },
    );
  }

  async acceptOffer(offerId, projectId, ownerId, acceptedAt) {
    return getDb().collection('offers').updateOne(
      {
        _id: toObjectId(offerId),
        projectId: toObjectId(projectId),
        ownerId: toObjectId(ownerId),
      },
      {
        $set: {
          status: 'aceptada',
          active: false,
          acceptedAt,
          updatedAt: acceptedAt,
        },
      },
    );
  }

  async rejectProjectOffers(projectId, ownerId, acceptedOfferId, rejectedAt) {
    const query = {
      projectId: toObjectId(projectId),
      ownerId: toObjectId(ownerId),
      status: { $in: ['enviada', 'aceptada'] },
      active: true,
    };
    if (acceptedOfferId) query._id = { $ne: toObjectId(acceptedOfferId) };
    return getDb().collection('offers').updateMany(
      query,
      {
        $set: {
          status: 'rechazada',
          active: false,
          rejectedAt,
          updatedAt: rejectedAt,
        },
      },
    );
  }

  async findApprovedPaymentOrderIds() {
    const payments = await getDb().collection('payments').find(
      { status: 'approved' },
      { projection: { orderId: 1 } },
    ).toArray();
    return payments.map((payment) => payment.orderId);
  }

  async findPaidOrders(approvedOrderIds) {
    return getDb().collection('orders').find({
      $or: [
        { orderStatus: 'paid' },
        { paymentStatus: 'approved' },
        { _id: { $in: approvedOrderIds } },
      ],
    }).sort({ updatedAt: -1 }).toArray();
  }

  async findProjectSummary(projectId, ownerId) {
    return getDb().collection('projects').findOne(
      { _id: toObjectId(projectId), ownerId: toObjectId(ownerId) },
      { projection: { nombre: 1, presupuesto: 1, habitaciones: 1, banos: 1 } },
    );
  }
}

module.exports = ContractedProjectRepository;
