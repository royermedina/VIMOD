const { getDb } = require('../AccesoDatos');

class AdvisorRequestRepository {
  async findActiveDuplicate(ownerId, projectId) {
    return getDb().collection('advisorRequests').findOne({
      ownerId,
      status: { $in: ['pending', 'in_progress'] },
      projectId,
    });
  }

  async create(document) {
    const result = await getDb().collection('advisorRequests').insertOne(document);
    return { ...document, _id: result.insertedId };
  }

  async listByOwner(ownerId) {
    return getDb().collection('advisorRequests').find({ ownerId })
      .sort({ createdAt: -1 }).toArray();
  }

  async listForAdmin(limit) {
    return getDb().collection('advisorRequests').find({})
      .sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async countAll() {
    return getDb().collection('advisorRequests').countDocuments();
  }

  async updateStatus(id, status, adminNote, now) {
    const fields = { status, adminNote, updatedAt: now };
    if (status === 'attended') fields.attendedAt = now;
    return getDb().collection('advisorRequests').findOneAndUpdate(
      { _id: id },
      { $set: fields },
      { returnDocument: 'after' },
    );
  }
}

module.exports = AdvisorRequestRepository;
