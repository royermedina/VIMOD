const { getDb, parseObjectId } = require('../AccesoDatos');

class TerrainRepository {
  async findDocumentByIdAndOwner(id, ownerId) {
    return getDb().collection('terrains').findOne({ _id: id, ownerId });
  }

  async findProjectSummaryByIdAndOwner(id, ownerId) {
    return getDb().collection('terrains').findOne(
      { _id: id, ownerId },
      { projection: { ubicacion: 1, ancho: 1, largo: 1, area: 1 } },
    );
  }

  async create({ userId, ubicacion, ancho, largo }) {
    const document = {
      ownerId: parseObjectId(userId, 'Usuario'),
      ubicacion,
      ancho,
      largo,
      area: Number((ancho * largo).toFixed(2)),
      createdAt: new Date(),
    };
    const result = await getDb().collection('terrains').insertOne(document);
    return this.toApiTerrain({ ...document, _id: result.insertedId });
  }

  async findAllByUserId(userId) {
    const ownerId = parseObjectId(userId, 'Usuario');
    const documents = await getDb().collection('terrains')
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .toArray();
    return documents.map((document) => this.toApiTerrain(document));
  }

  async findByIdAndUserId(id, userId) {
    const document = await getDb().collection('terrains').findOne({
      _id: parseObjectId(id, 'Terreno'),
      ownerId: parseObjectId(userId, 'Usuario'),
    });
    return document ? this.toApiTerrain(document) : null;
  }

  async findActiveProjectsByTerrainIdAndUserId(id, userId) {
    return getDb().collection('projects').find({
      terrainId: parseObjectId(id, 'Terreno'),
      ownerId: parseObjectId(userId, 'Usuario'),
      estado: { $nin: ['Cerrado', 'Archivado'] },
    }, { projection: { nombre: 1 } }).sort({ createdAt: -1 }).toArray();
  }

  async deleteByIdAndUserId(id, userId) {
    const result = await getDb().collection('terrains').deleteOne({
      _id: parseObjectId(id, 'Terreno'),
      ownerId: parseObjectId(userId, 'Usuario'),
    });
    return result.deletedCount > 0;
  }

  toApiTerrain(document) {
    return {
      id: document._id.toHexString(),
      user_id: document.ownerId.toHexString(),
      ubicacion: document.ubicacion,
      ancho: document.ancho,
      largo: document.largo,
      area: document.area,
      created_at: document.createdAt,
    };
  }
}

module.exports = TerrainRepository;
