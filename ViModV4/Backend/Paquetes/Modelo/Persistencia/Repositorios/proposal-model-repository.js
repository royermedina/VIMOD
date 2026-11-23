const { getDb, parseObjectId } = require('../AccesoDatos');

class ProposalModelRepository {
  async listForProject(project) {
    const models = await getDb().collection('proposalModels').find({
      active: { $ne: false },
      bedroomsMin: { $lte: project.habitaciones },
      bedroomsMax: { $gte: project.habitaciones },
      bathroomsMin: { $lte: project.banos },
      bathroomsMax: { $gte: project.banos },
    }).sort({ baseCostCop: 1, nombre: 1 }).toArray();
    return models;
  }

  async findById(id) {
    return getDb().collection('proposalModels').findOne({ _id: parseObjectId(id, 'Modelo') });
  }
}

module.exports = ProposalModelRepository;
