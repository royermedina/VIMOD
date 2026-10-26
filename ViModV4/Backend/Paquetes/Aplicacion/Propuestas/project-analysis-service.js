const crypto = require('node:crypto');
const { HttpError } = require('../../../Nucleo');
const { modularCatalog } = require('../../Dominio/ModeloPropuestas');
const { validateProjectNeeds } = require('../../Dominio/ModeloProyectos');
const {
  ProjectRepository,
  TerrainRepository,
  ProjectAnalysisRepository,
} = require('../../Persistencia/Repositorios');

function validateNeeds(project) {
  const error = validateProjectNeeds(project);
  if (error) throw new HttpError(422, error);
}

function findLayout(widthM, lengthM, moduleCount) {
  const orientations = [
    { moduleWidthM: modularCatalog.module.widthM, moduleLengthM: modularCatalog.module.lengthM },
    { moduleWidthM: modularCatalog.module.lengthM, moduleLengthM: modularCatalog.module.widthM },
  ];
  const layouts = [];
  for (const orientation of orientations) {
    const maxColumns = Math.floor(widthM / orientation.moduleWidthM);
    const maxRows = Math.floor(lengthM / orientation.moduleLengthM);
    for (let columns = 1; columns <= Math.min(maxColumns, moduleCount); columns += 1) {
      const rows = Math.ceil(moduleCount / columns);
      if (rows > maxRows) continue;
      layouts.push({
        ...orientation,
        columns,
        rows,
        unusedCells: columns * rows - moduleCount,
        footprintWidthM: columns * orientation.moduleWidthM,
        footprintLengthM: rows * orientation.moduleLengthM,
      });
    }
  }
  layouts.sort((left, right) => left.unusedCells - right.unusedCells || left.rows - right.rows);
  return layouts[0] || null;
}

class ProjectAnalysisService {
  constructor({ projectRepository, terrainRepository, analysisRepository } = {}) {
    this.projectRepository = projectRepository || new ProjectRepository();
    this.terrainRepository = terrainRepository || new TerrainRepository();
    this.analysisRepository = analysisRepository || new ProjectAnalysisRepository();
  }

  async analyze(ownerId, projectId) {
    const project = await this.projectRepository.findByIdAndUserId(projectId, ownerId);
    if (!project) throw new HttpError(404, 'Proyecto no encontrado');
    validateNeeds(project);

    const terrain = await this.terrainRepository.findByIdAndUserId(project.terrain_id, ownerId);
    if (!terrain) throw new HttpError(422, 'El terreno asociado no existe o no pertenece al cliente');
    if (!Number.isFinite(Number(terrain.ancho)) || Number(terrain.ancho) <= 0
      || !Number.isFinite(Number(terrain.largo)) || Number(terrain.largo) <= 0) {
      throw new HttpError(422, 'El terreno no tiene dimensiones válidas para analizar');
    }

    const inputs = {
      terrainId: terrain.id,
      widthM: Number(terrain.ancho),
      lengthM: Number(terrain.largo),
      lotAreaM2: Number((Number(terrain.ancho) * Number(terrain.largo)).toFixed(2)),
      budgetCop: Number(project.presupuesto),
      bedrooms: project.habitaciones,
      bathrooms: project.banos,
    };
    const requiredModules = 1
      + Math.ceil(inputs.bedrooms / modularCatalog.capacities.bedroomsPerModule)
      + Math.ceil(inputs.bathrooms / modularCatalog.capacities.bathroomsPerModule);
    const layout = findLayout(inputs.widthM, inputs.lengthM, requiredModules);
    const inputFingerprint = crypto.createHash('sha256')
      .update(JSON.stringify({ projectId, inputs, catalogVersion: modularCatalog.version }))
      .digest('hex');
    const analysis = {
      inputFingerprint,
      catalogVersion: modularCatalog.version,
      inputs,
      preliminary: {
        status: layout ? 'layout_capacity_available' : 'insufficient_dimensions_for_standard_modules',
        requiredModules,
        minimumFootprintM2: requiredModules * modularCatalog.module.areaM2,
        maxGridLayout: layout,
        summary: layout
          ? `Las dimensiones admiten una retícula de ${layout.columns} columnas por ${layout.rows} filas para el programa requerido.`
          : 'Las dimensiones no admiten la disposición en retícula de los módulos académicos definidos.',
      },
      assumptions: {
        module: modularCatalog.module,
        capacities: modularCatalog.capacities,
        catalogVersion: modularCatalog.version,
        disclaimer: modularCatalog.disclaimer,
        soilStudyIncluded: false,
      },
    };
    const saved = await this.analysisRepository.save({ ownerId, projectId, analysis });
    return { analysis: saved, project, terrain };
  }

  async get(ownerId, projectId) {
    const project = await this.projectRepository.findByIdAndUserId(projectId, ownerId);
    if (!project) throw new HttpError(404, 'Proyecto no encontrado');
    const analysis = await this.analysisRepository.findByProjectAndOwner(projectId, ownerId);
    if (!analysis) throw new HttpError(404, 'El proyecto todavía no tiene un análisis guardado');
    if (analysis.stale) throw new HttpError(404, 'Los datos del proyecto cambiaron y requieren un nuevo análisis');
    return analysis;
  }
}

ProjectAnalysisService.findLayout = findLayout;
ProjectAnalysisService.validateNeeds = validateNeeds;
module.exports = ProjectAnalysisService;