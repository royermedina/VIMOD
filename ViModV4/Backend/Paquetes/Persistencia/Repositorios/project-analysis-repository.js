const { getDb, parseObjectId } = require('../AccesoDatos');

class ProjectAnalysisRepository {
  async findDocumentByProjectAndOwner(projectId, ownerId) {
    return getDb().collection('projectAnalyses').findOne({ projectId, ownerId });
  }

  async save({ ownerId, projectId, analysis }) {
    const collection = getDb().collection('projectAnalyses');
    const ownerObjectId = parseObjectId(ownerId, 'Usuario');
    const projectObjectId = parseObjectId(projectId, 'Proyecto');
    const filter = { ownerId: ownerObjectId, projectId: projectObjectId };
    const existing = await collection.findOne(filter, {
      projection: { inputFingerprint: 1 },
    });
    const now = new Date();
    const document = {
      ...filter,
      inputFingerprint: analysis.inputFingerprint,
      catalogVersion: analysis.catalogVersion,
      inputs: analysis.inputs,
      preliminary: analysis.preliminary,
      assumptions: analysis.assumptions,
      stale: false,
      analyzedAt: now,
      updatedAt: now,
    };
    const update = { $set: document };
    if (existing && existing.inputFingerprint !== analysis.inputFingerprint) {
      update.$unset = { proposalResult: '' };
    }
    try {
      await collection.updateOne(filter, update, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      await collection.updateOne(filter, update);
    }
    return this.findByProjectAndOwner(projectId, ownerId);
  }

  async markStale(projectId, ownerId) {
    await getDb().collection('projectAnalyses').updateOne(
      {
        projectId: parseObjectId(projectId, 'Proyecto'),
        ownerId: parseObjectId(ownerId, 'Usuario'),
      },
      { $set: { stale: true, updatedAt: new Date() } },
    );
  }

  async saveProposalResult({ ownerId, projectId, inputFingerprint, result }) {
    await getDb().collection('projectAnalyses').updateOne(
      {
        ownerId: parseObjectId(ownerId, 'Usuario'),
        projectId: parseObjectId(projectId, 'Proyecto'),
        inputFingerprint,
      },
      { $set: { proposalResult: result, updatedAt: new Date() } },
    );
  }

  async findByProjectAndOwner(projectId, ownerId) {
    const document = await getDb().collection('projectAnalyses').findOne({
      projectId: parseObjectId(projectId, 'Proyecto'),
      ownerId: parseObjectId(ownerId, 'Usuario'),
    });
    if (!document) return null;
    return this.toApiAnalysis(document);
  }

  toApiAnalysis(document) {
    return {
      projectId: document.projectId.toHexString(),
      inputFingerprint: document.inputFingerprint,
      catalogVersion: document.catalogVersion,
      inputs: document.inputs,
      preliminary: document.preliminary,
      assumptions: document.assumptions,
      stale: document.stale === true,
      analyzedAt: document.analyzedAt,
      updatedAt: document.updatedAt,
      proposalResult: document.proposalResult || null,
    };
  }
}

module.exports = ProjectAnalysisRepository;