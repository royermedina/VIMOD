const { getDb, parseObjectId } = require('../AccesoDatos');

class OfferRepository {
  async findAcceptedForProject(id, projectId, ownerId) {
    return getDb().collection('offers').findOne({
      _id: id,
      projectId,
      ownerId,
      status: 'aceptada',
    });
  }

  async findForOrder(projectId, ownerId, offerId) {
    return getDb().collection('offers').findOne({
      _id: offerId,
      projectId,
      ownerId,
    });
  }

  async acceptForProject(offerId, projectId, ownerId, now) {
    return getDb().collection('offers').findOneAndUpdate({
      _id: offerId,
      projectId,
      ownerId,
      status: 'enviada',
      active: true,
    }, {
      $set: { status: 'aceptada', acceptedAt: now, updatedAt: now },
    }, { returnDocument: 'after' });
  }

  async listForAdmin(limit) {
    return getDb().collection('offers').find({})
      .sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async listOpenProjects() {
    return getDb().collection('projects').find({
      estado: { $in: ['Borrador', 'En revisión'] },
      offersOpen: { $ne: false },
    }).sort({ createdAt: -1 }).limit(200).toArray();
  }

  async findProject(projectId) {
    const id = projectId && typeof projectId.toHexString === 'function'
      ? projectId.toHexString()
      : projectId;
    return getDb().collection('projects').findOne({ _id: parseObjectId(id, 'Proyecto') });
  }

  async insert(document) {
    const result = await getDb().collection('offers').insertOne(document);
    return { ...document, _id: result.insertedId };
  }

  async listByContractor(contractorId) {
    return getDb().collection('offers').find({
      contractorId: parseObjectId(contractorId, 'Constructora'),
    }).sort({ createdAt: -1 }).toArray();
  }

  async listByProject(projectId, ownerId) {
    return getDb().collection('offers').find({
      projectId: parseObjectId(projectId, 'Proyecto'),
      ownerId: parseObjectId(ownerId, 'Usuario'),
    }).sort({ createdAt: -1 }).toArray();
  }

  async withdraw(contractorId, offerId) {
    return getDb().collection('offers').findOneAndUpdate(
      {
        _id: parseObjectId(offerId, 'Oferta'),
        contractorId: parseObjectId(contractorId, 'Constructora'),
        status: 'enviada',
        active: true,
      },
      { $set: { status: 'retirada', active: false, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
  }
}

module.exports = OfferRepository;
