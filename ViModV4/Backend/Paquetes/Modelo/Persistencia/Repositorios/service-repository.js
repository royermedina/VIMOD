const { getDb } = require('../AccesoDatos');

class ServiceRepository {
  async findActiveById(id) {
    return getDb().collection('services').findOne({ _id: id, status: 'active' });
  }

  async listActive() {
    return getDb().collection('services').find({ status: 'active' })
      .sort({ createdAt: -1 }).toArray();
  }

  async listByOwner(ownerId) {
    return getDb().collection('services').find({ ownerId })
      .sort({ createdAt: -1 }).toArray();
  }

  async findByIdAndOwner(id, ownerId) {
    return getDb().collection('services').findOne({ _id: id, ownerId });
  }

  async create(document) {
    const result = await getDb().collection('services').insertOne(document);
    return { ...document, _id: result.insertedId };
  }

  async updateByIdAndOwner(id, ownerId, fields) {
    return getDb().collection('services').findOneAndUpdate(
      { _id: id, ownerId },
      { $set: fields },
      { returnDocument: 'after' },
    );
  }

  async deleteByIdAndOwner(id, ownerId) {
    return getDb().collection('services').deleteOne({ _id: id, ownerId });
  }

  async countAll() {
    return getDb().collection('services').countDocuments();
  }

  async listForAdmin(limit) {
    return getDb().collection('services').find({})
      .sort({ createdAt: -1 }).limit(limit).toArray();
  }
}

module.exports = ServiceRepository;
