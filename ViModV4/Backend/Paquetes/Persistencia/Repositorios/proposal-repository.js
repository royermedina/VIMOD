const { getDb, parseObjectId } = require('../AccesoDatos');

class ProposalRepository {
  async findDocumentById(id) {
    return getDb().collection('proposals').findOne({ _id: id });
  }

  async findForSelection(id, projectId, ownerId, inputFingerprint) {
    return getDb().collection('proposals').findOne({
      _id: id,
      projectId,
      ownerId,
      inputFingerprint,
      stale: { $ne: true },
    });
  }

  async findForContract(projectId, ownerId, proposalId) {
    return getDb().collection('proposals').findOne({
      _id: proposalId,
      projectId,
      ownerId,
    });
  }

  async findReviewable(id, projectId, ownerId) {
    return getDb().collection('proposals').findOne({
      _id: id,
      projectId,
      ownerId,
      stale: { $ne: true },
    });
  }

  async findByProjectAndModel(projectId, ownerId, modelId) {
    return getDb().collection('proposals').findOne({ projectId, ownerId, modelId });
  }

  async findAdminSummaryById(id, projectId) {
    return getDb().collection('proposals').findOne(
      { _id: id, projectId },
      { projection: { name: 1, estimate: 1 } },
    );
  }

  async upsertGeneration({ ownerId, projectId, terrainId, inputFingerprint, proposals }) {
    const collection = getDb().collection('proposals');
    const ownerObjectId = parseObjectId(ownerId, 'Usuario');
    const projectObjectId = parseObjectId(projectId, 'Proyecto');
    const terrainObjectId = parseObjectId(terrainId, 'Terreno');

    for (const proposal of proposals) {
      const filter = {
        ownerId: ownerObjectId,
        projectId: projectObjectId,
        inputFingerprint,
        code: proposal.code,
      };
      try {
        await collection.updateOne(
          filter,
          {
            $set: {
              ...proposal,
              ...filter,
              terrainId: terrainObjectId,
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true },
        );
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    }

    return this.findGeneration(projectId, ownerId, inputFingerprint);
  }

  async findGeneration(projectId, ownerId, inputFingerprint) {
    const documents = await getDb().collection('proposals')
      .find({
        projectId: parseObjectId(projectId, 'Proyecto'),
        ownerId: parseObjectId(ownerId, 'Usuario'),
        inputFingerprint,
      })
      .sort({ code: 1 })
      .toArray();
    return documents.map((document) => this.toApiProposal(document));
  }

  async findAllByProject(projectId, ownerId) {
    const documents = await getDb().collection('proposals')
      .find({
        projectId: parseObjectId(projectId, 'Proyecto'),
        ownerId: parseObjectId(ownerId, 'Usuario'),
      })
      .sort({ code: 1 })
      .toArray();
    return documents.map((document) => this.toApiProposal(document));
  }

  async deleteOutdatedByProject(projectId, ownerId, inputFingerprint) {
    await getDb().collection('proposals').deleteMany({
      projectId: parseObjectId(projectId, 'Proyecto'),
      ownerId: parseObjectId(ownerId, 'Usuario'),
      $or: [
        { stale: true },
        { inputFingerprint: { $ne: inputFingerprint } },
      ],
    });
  }

  async findByIdAndProjectAndOwner(proposalId, projectId, ownerId) {
    const document = await getDb().collection('proposals').findOne({
      _id: parseObjectId(proposalId, 'Propuesta'),
      projectId: parseObjectId(projectId, 'Proyecto'),
      ownerId: parseObjectId(ownerId, 'Usuario'),
    });
    return document ? this.toApiProposal(document) : null;
  }

  toApiProposal(document) {
    const estimate = document.estimate;
    return {
      id: document._id.toHexString(),
      projectId: document.projectId.toHexString(),
      proyectoId: document.projectId.toHexString(),
      terrainId: document.terrainId.toHexString(),
      inputFingerprint: document.inputFingerprint,
      code: document.code,
      codigo: document.code,
      index: document.index,
      indice: document.index,
      name: document.name,
      nombre: document.name,
      description: document.description,
      descripcion: document.description,
      label: document.label,
      etiqueta: document.label,
      recommended: document.recommended,
      recomendada: document.recommended,
      bedrooms: document.bedrooms,
      habitaciones: document.bedrooms,
      bathrooms: document.bathrooms,
      banos: document.bathrooms,
      modules: document.modules,
      layout: document.layout,
      estimate,
      area: estimate.areaM2,
      costo: estimate.costCop,
      tiempo: `${estimate.executionDays} días`,
      imagenCaption: document.imageCaption,
      tecnicos: document.technicalDetails,
      source: document.source || 'academic',
      contractorId: document.contractorId ? document.contractorId.toHexString() : null,
      modelId: document.modelId ? document.modelId.toHexString() : null,
      modelKey: document.modelKey || null,
      finishLevel: document.finishLevel || null,
      viable: document.viable !== false,
      budgetDifferenceCop: document.budgetDifferenceCop || 0,
      inclusions: document.inclusions || [],
      createdAt: document.createdAt,
      stale: document.stale === true,
    };
  }
}

module.exports = ProposalRepository;
