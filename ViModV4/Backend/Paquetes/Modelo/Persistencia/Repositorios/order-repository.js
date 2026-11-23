const { getDb } = require('../AccesoDatos');

class OrderRepository {
  async findByOwnerAndIdempotencyKey(ownerId, idempotencyKey) {
    return getDb().collection('orders').findOne({ ownerId, idempotencyKey });
  }

  async findPendingForOffer(ownerId, projectId, proposalId, quoteId, offerId) {
    return getDb().collection('orders').findOne({
      ownerId,
      projectId,
      proposalId,
      quoteId,
      offerId,
      active: true,
      paymentStatus: { $in: ['created', 'pending'] },
      orderStatus: { $in: ['awaiting_payment', 'awaiting_payment_configuration', 'payment_pending'] },
    }, { sort: { createdAt: -1 } });
  }

  async create(document) {
    const result = await getDb().collection('orders').insertOne(document);
    return result.insertedId;
  }

  async findActiveForOffer(ownerId, projectId, proposalId, quoteId, offerId) {
    return getDb().collection('orders').findOne({
      ownerId,
      projectId,
      proposalId,
      quoteId,
      offerId,
      active: true,
    });
  }

  async listByOwner(ownerId) {
    return getDb().collection('orders').find({ ownerId })
      .sort({ createdAt: -1 }).toArray();
  }

  async findByIdAndOwner(id, ownerId) {
    return getDb().collection('orders').findOne({ _id: id, ownerId });
  }

  async findById(id) {
    return getDb().collection('orders').findOne({ _id: id });
  }

  async updatePaymentLink(id, paymentId) {
    return getDb().collection('orders').updateOne(
      { _id: id },
      { $set: { paymentId } },
    );
  }

  async updatePaymentState(id, ownerId, paymentId, fields, clearFailure = false) {
    const update = { $set: fields };
    if (clearFailure) {
      update.$unset = { paymentFailureReason: '', paymentCancellationReason: '' };
    }
    return getDb().collection('orders').updateOne(
      { _id: id, ownerId, ...(paymentId ? { paymentId } : {}) },
      update,
    );
  }

  async countAll() {
    return getDb().collection('orders').countDocuments();
  }

  async listForAdmin(limit) {
    return getDb().collection('orders').find({})
      .sort({ createdAt: -1 }).limit(limit).toArray();
  }
}

module.exports = OrderRepository;
