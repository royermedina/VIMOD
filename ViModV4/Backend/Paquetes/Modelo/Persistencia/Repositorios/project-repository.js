const { getDb, parseObjectId } = require('../AccesoDatos');

class ProjectRepository {
  async findDocumentById(id) {
    return getDb().collection('projects').findOne({ _id: id });
  }

  async findAdminSummaryById(id) {
    return getDb().collection('projects').findOne(
      { _id: id },
      { projection: { nombre: 1, estado: 1 } },
    );
  }

  async findNameByIdAndOwner(id, ownerId) {
    return getDb().collection('projects').findOne(
      { _id: id, ownerId },
      { projection: { nombre: 1 } },
    );
  }

  async listForAdmin(limit) {
    return getDb().collection('projects').find({})
      .sort({ createdAt: -1 }).limit(limit).toArray();
  }

  async countAll() {
    return getDb().collection('projects').countDocuments();
  }

  async selectProposal(projectId, ownerId, proposalId, updatedAt) {
    return getDb().collection('projects').updateOne(
      { _id: projectId, ownerId },
      { $set: { selectedProposalId: proposalId, updatedAt } },
    );
  }

  async reserveQuoteContractor(projectId, ownerId, contractorId) {
    return getDb().collection('projects').updateOne({
      _id: projectId,
      ownerId,
      activeQuoteContractorIds: { $ne: contractorId },
    }, {
      $addToSet: { activeQuoteContractorIds: contractorId },
    });
  }

  async releaseQuoteContractors(projectId, ownerId, contractorIds) {
    return getDb().collection('projects').updateOne(
      { _id: projectId, ownerId },
      { $pull: { activeQuoteContractorIds: { $in: contractorIds } } },
    );
  }

  async releaseQuoteContractor(projectId, ownerId, contractorId) {
    return getDb().collection('projects').updateOne(
      { _id: projectId, ownerId },
      { $pull: { activeQuoteContractorIds: contractorId } },
    );
  }

  async reserveReview(projectId, ownerId, reviewId) {
    return getDb().collection('projects').updateOne({
      _id: projectId,
      ownerId,
      activeReviewId: { $exists: false },
    }, {
      $set: { activeReviewId: reviewId },
    });
  }

  async releaseReview(projectId, ownerId, reviewId) {
    return getDb().collection('projects').updateOne({
      _id: projectId,
      ownerId,
      activeReviewId: reviewId,
    }, {
      $unset: { activeReviewId: '' },
    });
  }

  async markInReview(projectId, updatedAt) {
    return getDb().collection('projects').updateOne(
      { _id: projectId },
      { $set: { estado: 'En revisión', updatedAt } },
    );
  }

  async create({ userId, terrainId, nombre, presupuesto, habitaciones, banos }) {
    const now = new Date();
    const document = {
      ownerId: parseObjectId(userId, 'Usuario'),
      terrainId: parseObjectId(terrainId, 'Terreno'),
      nombre,
      presupuesto,
      habitaciones,
      banos,
      estado: 'Borrador',
      createdAt: now,
      updatedAt: now,
    };
    const result = await getDb().collection('projects').insertOne(document);
    return this.toApiProject({ ...document, _id: result.insertedId });
  }

  async findAllByUserId(userId) {
    const ownerId = parseObjectId(userId, 'Usuario');
    const documents = await getDb().collection('projects')
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .toArray();
    return documents.map((document) => this.toApiProject(document));
  }

  async findByIdAndUserId(id, userId) {
    const document = await this.findDocumentByIdAndUserId(id, userId);
    return document ? this.toApiProject(document) : null;
  }

  async findDocumentByIdAndUserId(id, userId) {
    const document = await getDb().collection('projects').findOne({
      _id: parseObjectId(id, 'Proyecto'),
      ownerId: parseObjectId(userId, 'Usuario'),
    });
    return document;
  }

  async hasRelatedActivity(project) {
    const db = getDb();
    const filter = { projectId: project._id, ownerId: project.ownerId };
    const collections = [
      'projectAnalyses',
      'proposals',
      'reviewRequests',
      'architectObservations',
      'quoteRequests',
      'orders',
    ];
    const relatedRecords = await Promise.all(collections.map((name) =>
      db.collection(name).findOne(filter, { projection: { _id: 1 } })));
    return Boolean(project.selectedProposalId || relatedRecords.some(Boolean));
  }

  async hasWorkflowActivity(project) {
    const db = getDb();
    const filter = { projectId: project._id, ownerId: project.ownerId };
    const collections = [
      'reviewRequests',
      'architectObservations',
      'quoteRequests',
      'orders',
    ];
    const relatedRecords = await Promise.all(collections.map((name) =>
      db.collection(name).findOne(filter, { projection: { _id: 1 } })));
    return relatedRecords.some(Boolean);
  }

  async markProposalsStale(id, userId) {
    const db = getDb();
    const projectId = parseObjectId(id, 'Proyecto');
    const ownerId = parseObjectId(userId, 'Usuario');
    await Promise.all([
      db.collection('proposals').updateMany(
        { projectId, ownerId },
        { $set: { stale: true, updatedAt: new Date() } },
      ),
      db.collection('projects').updateOne(
        { _id: projectId, ownerId },
        { $unset: { selectedProposalId: '' }, $set: { updatedAt: new Date() } },
      ),
    ]);
  }

  async updateByIdAndUserId(id, userId, fields) {
    const now = new Date();
    const result = await getDb().collection('projects').findOneAndUpdate(
      {
        _id: parseObjectId(id, 'Proyecto'),
        ownerId: parseObjectId(userId, 'Usuario'),
        estado: 'Borrador',
      },
      {
        $set: {
          ...fields,
          terrainId: parseObjectId(fields.terrainId, 'Terreno'),
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );
    return result ? this.toApiProject(result) : null;
  }

  async deleteByIdAndUserId(id, userId) {
    const result = await getDb().collection('projects').deleteOne({
      _id: parseObjectId(id, 'Proyecto'),
      ownerId: parseObjectId(userId, 'Usuario'),
      estado: 'Borrador',
      selectedProposalId: { $exists: false },
    });
    return result.deletedCount > 0;
  }

  async archiveByIdAndUserId(id, userId) {
    const now = new Date();
    const result = await getDb().collection('projects').findOneAndUpdate(
      {
        _id: parseObjectId(id, 'Proyecto'),
        ownerId: parseObjectId(userId, 'Usuario'),
      },
      { $set: { estado: 'Archivado', fechaArchivo: now, updatedAt: now } },
      { returnDocument: 'after' },
    );
    return result ? this.toApiProject(result) : null;
  }

  async closeByIdAndUserId(id, userId) {
    const now = new Date();
    const result = await getDb().collection('projects').findOneAndUpdate(
      {
        _id: parseObjectId(id, 'Proyecto'),
        ownerId: parseObjectId(userId, 'Usuario'),
        estado: { $ne: 'Cerrado' },
      },
      { $set: { estado: 'Cerrado', fechaCierre: now, updatedAt: now } },
      { returnDocument: 'after' },
    );
    return result ? this.toApiProject(result) : null;
  }

  toApiProject(document) {
    const project = {
      id: document._id.toHexString(),
      user_id: document.ownerId.toHexString(),
      terrain_id: document.terrainId.toHexString(),
      nombre: document.nombre,
      presupuesto: document.presupuesto,
      estado: document.estado,
      created_at: document.createdAt,
      updated_at: document.updatedAt,
    };
    if (document.fechaCierre) project.fecha_cierre = document.fechaCierre;
    if (document.fechaArchivo) project.fecha_archivo = document.fechaArchivo;
    if (Object.prototype.hasOwnProperty.call(document, 'habitaciones')) {
      project.habitaciones = document.habitaciones;
    }
    if (Object.prototype.hasOwnProperty.call(document, 'banos')) {
      project.banos = document.banos;
    }
    if (document.selectedProposalId) {
      project.selected_proposal_id = document.selectedProposalId.toHexString();
    }
    return project;
  }
}

module.exports = ProjectRepository;
