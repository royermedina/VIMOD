const { getDb, isObjectId, toObjectId } = require('../AccesoDatos');

class UserRepository {
  async findDocumentById(id) {
    return getDb().collection('users').findOne({ _id: id });
  }

  async findByEmail(correo) {
    return getDb().collection('users').findOne({ correo });
  }

  async findById(id) {
    if (!isObjectId(id)) return null;
    return getDb().collection('users').findOne(
      { _id: toObjectId(id) },
      { projection: { passwordHash: 0 } },
    );
  }

  async findActiveAccounts() {
    return getDb().collection('users').find({
      accountStatus: { $in: ['aprobado', 'approved', 'active', 'activo'] },
    }, {
      projection: { passwordHash: 0, token: 0 },
    }).sort({ nombre: 1 }).toArray();
  }

  async findByIds(ids, projection) {
    return getDb().collection('users').find(
      { _id: { $in: ids } },
      projection ? { projection } : {},
    ).toArray();
  }

  async findPublicProfileById(id) {
    return getDb().collection('users').findOne(
      { _id: id },
      { projection: { passwordHash: 0, token: 0 } },
    );
  }

  async findAdminSummaryById(id) {
    return getDb().collection('users').findOne(
      { _id: id },
      { projection: { nombre: 1, correo: 1 } },
    );
  }

  async findNameById(id) {
    return getDb().collection('users').findOne(
      { _id: id },
      { projection: { nombre: 1 } },
    );
  }

  async findContractorNameAndProfile(id) {
    return getDb().collection('users').findOne(
      { _id: id },
      { projection: { nombre: 1, contractorProfile: 1 } },
    );
  }

  async listForOverview() {
    return getDb().collection('users').find({}, {
      projection: { rol: 1, requestedRole: 1, accountType: 1, accountStatus: 1 },
    }).toArray();
  }

  async listForAdmin() {
    return getDb().collection('users').find({}, {
      projection: { passwordHash: 0, token: 0 },
    }).sort({ createdAt: -1 }).limit(1000).toArray();
  }

  async updateConfiguredAdminPassword(id, expectedRole, expectedStatus, passwordHash) {
    return getDb().collection('users').updateOne(
      { _id: id, rol: expectedRole, accountStatus: expectedStatus },
      { $set: { passwordHash, updatedAt: new Date() } },
    );
  }

  async createConfiguredAdmin(document) {
    const result = await getDb().collection('users').insertOne(document);
    return result.insertedId;
  }

  async updateRoleDecision(id, role, status, decision, reason, decidedAt, adminId) {
    return getDb().collection('users').updateOne(
      { _id: id, accountStatus: 'pendiente' },
      {
        $set: {
          rol: role,
          accountStatus: status,
          roleDecision: { decision, reason, decidedAt, adminId },
        },
      },
    );
  }

  async updateAccountStatus(id, status) {
    return getDb().collection('users').updateOne(
      { _id: id },
      { $set: { accountStatus: status } },
    );
  }

  async updateContractorProfile(id, profile) {
    if (!isObjectId(id)) return null;
    const result = await getDb().collection('users').findOneAndUpdate(
      { _id: toObjectId(id) },
      { $set: { contractorProfile: profile, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { passwordHash: 0, token: 0 } },
    );
    return result || null;
  }

  async updateArchitectProfile(id, fields) {
    if (!isObjectId(id)) return null;
    const result = await getDb().collection('users').findOneAndUpdate(
      { _id: toObjectId(id) },
      { $set: fields },
      { returnDocument: 'after', projection: { passwordHash: 0, token: 0 } },
    );
    return result || null;
  }

  async create(document) {
    const users = getDb().collection('users');
    const result = await users.insertOne(document);
    return this.findById(result.insertedId.toHexString());
  }
}

module.exports = UserRepository;
