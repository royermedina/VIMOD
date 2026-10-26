const { HttpError } = require('../../../Nucleo');
const { normalizeTerrainInput } = require('../../Dominio/ModeloProyectos');
const { TerrainRepository } = require('../../Persistencia/Repositorios');

class TerrainService {
  constructor(terrainRepository = new TerrainRepository()) {
    this.terrainRepository = terrainRepository;
  }

  async create(userId, data) {
    const result = normalizeTerrainInput(data);
    if (result.error) throw new HttpError(400, result.error);
    return this.terrainRepository.create({ userId, ...result.value });
  }

  async list(userId) {
    return this.terrainRepository.findAllByUserId(userId);
  }

  async getById(userId, terrainId) {
    const terrain = await this.terrainRepository.findByIdAndUserId(terrainId, userId);
    if (!terrain) throw new HttpError(404, 'Terreno no encontrado');
    return terrain;
  }

  async delete(userId, terrainId) {
    const terrain = await this.terrainRepository.findByIdAndUserId(terrainId, userId);
    if (!terrain) throw new HttpError(404, 'Terreno no encontrado');
    const activeProjects = await this.terrainRepository.findActiveProjectsByTerrainIdAndUserId(
      terrainId,
      userId,
    );
    if (activeProjects.length) {
      const names = activeProjects.map((project) => project.nombre).join(', ');
      throw new HttpError(
        409,
        `No se puede eliminar el terreno porque tiene proyectos activos: ${names}`,
      );
    }
    const deleted = await this.terrainRepository.deleteByIdAndUserId(terrainId, userId);
    if (!deleted) throw new HttpError(404, 'Terreno no encontrado');
    return terrain;
  }
}

module.exports = TerrainService;
