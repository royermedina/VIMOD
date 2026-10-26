const { getDb } = require('../AccesoDatos');

class QuoteRequestRepository {
  async findActiveForProject(projectId, ownerId, contractorIds) {
    return getDb().collection('quoteRequests').findOne({
      projectId,
      ownerId,
      contractorId: { $in: contractorIds },
      active: true,
    });
  }

  async create(document) {
    const result = await getDb().collection('quoteRequests').insertOne(document);
    return { ...document, _id: result.insertedId };
  }

  async deleteCreatedForProject(projectId, ownerId, contractorIds, createdAt) {
    return getDb().collection('quoteRequests').deleteMany({
      projectId,
      ownerId,
      contractorId: { $in: contractorIds },
      createdAt,
    });
  }

  async listByProjectAndOwner(projectId, ownerId) {
    return getDb().collection('quoteRequests').find({ projectId, ownerId })
      .sort({ createdAt: -1 }).toArray();
  }

  async listByContractor(contractorId) {
    return getDb().collection('quoteRequests').find({ contractorId })
      .sort({ createdAt: -1 }).toArray();
  }

  async findForProject(id, projectId, ownerId) {
    return getDb().collection('quoteRequests').findOne({ _id: id, projectId, ownerId });
  }

  async findRespondedForOrder(id, projectId, ownerId) {
    return getDb().collection('quoteRequests').findOne({
      _id: id,
      projectId,
      ownerId,
      status: 'responded',
      active: true,
    });
  }

  async findById(id) {
    return getDb().collection('quoteRequests').findOne({ _id: id });
  }

  async expireIfDue(quoteId, dueAt, updatedAt) {
    return getDb().collection('quoteRequests').updateOne({
      _id: quoteId,
      status: 'responded',
      active: true,
      'response.validUntil': { $lte: dueAt },
    }, {
      $set: { status: 'expired', active: false, updatedAt },
    });
  }

  async respond(id, contractorId, response, updatedAt) {
    return getDb().collection('quoteRequests').findOneAndUpdate({
      _id: id,
      contractorId,
      status: { $in: ['requested', 'responded'] },
      active: true,
    }, {
      $set: { status: 'responded', response, updatedAt },
    }, { returnDocument: 'after' });
  }

  async accept(id, projectId, ownerId, validAt, acceptedAt, updatedAt) {
    return getDb().collection('quoteRequests').findOneAndUpdate({
      _id: id,
      projectId,
      ownerId,
      status: 'responded',
      active: true,
      'response.validUntil': { $gt: validAt },
    }, {
      $set: { status: 'accepted', active: false, acceptedAt, updatedAt },
    }, { returnDocument: 'after' });
  }

  async reject(id, projectId, ownerId, rejectedAt, updatedAt) {
    return getDb().collection('quoteRequests').findOneAndUpdate({
      _id: id,
      projectId,
      ownerId,
      status: 'responded',
      active: true,
    }, {
      $set: { status: 'rejected', active: false, rejectedAt, updatedAt },
    }, { returnDocument: 'after' });
  }

  async countAll() {
    return getDb().collection('quoteRequests').countDocuments();
  }

  async listForAdmin(limit) {
    return getDb().collection('quoteRequests').find({})
      .sort({ createdAt: -1 }).limit(limit).toArray();
  }
}

module.exports = QuoteRequestRepository;
