const { getDb } = require('../AccesoDatos');

class AdminAuditRepository {
  async create(event) {
    const result = await getDb().collection('adminAudit').insertOne(event);
    return { ...event, _id: result.insertedId };
  }

  async listRecent() {
    return getDb().collection('adminAudit').find({})
      .sort({ createdAt: -1 }).limit(500).toArray();
  }
}

module.exports = AdminAuditRepository;
