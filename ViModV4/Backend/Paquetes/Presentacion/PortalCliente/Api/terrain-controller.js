const TerrainService = require('../../../Aplicacion/Terrenos');

const terrainService = new TerrainService();

async function create(req, res) {
  const terrain = await terrainService.create(req.user.id, req.body || {});
  res.status(201).json({ terrain });
}

async function list(req, res) {
  const terrains = await terrainService.list(req.user.id);
  res.json({ terrains });
}

async function getById(req, res) {
  const terrain = await terrainService.getById(req.user.id, req.params.id);
  res.json({ terrain });
}

async function remove(req, res) {
  const terrain = await terrainService.delete(req.user.id, req.params.id);
  res.json({ terrain });
}

module.exports = { create, list, getById, remove };
