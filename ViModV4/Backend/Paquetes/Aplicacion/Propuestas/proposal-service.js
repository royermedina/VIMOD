const { HttpError } = require('../../../Nucleo');
const { modularCatalog, calculateProposalCost } = require('../../Dominio/ModeloPropuestas');
const {
  ProjectRepository,
  ProjectAnalysisRepository,
  ProposalRepository,
  ProposalModelRepository,
} = require('../../Persistencia/Repositorios');
const { ContractedProjectService } = require('../Proyectos');
const ProjectAnalysisService = require('./project-analysis-service');

function createCandidate({ code, model, bedrooms, bathrooms, inputs, terrainId }) {
  const roomModuleCount = Math.ceil(bedrooms / modularCatalog.capacities.bedroomsPerModule);
  const wetModuleCount = Math.ceil(bathrooms / modularCatalog.capacities.bathroomsPerModule);
  const counts = {
    common: 1,
    bedroom: roomModuleCount,
    wetCore: wetModuleCount,
  };
  const moduleCount = counts.common + counts.bedroom + counts.wetCore;
  const layout = ProjectAnalysisService.findLayout(inputs.widthM, inputs.lengthM, moduleCount);
  const totalCostCop = calculateProposalCost(model, bedrooms, bathrooms);
  const areaM2 = Math.max(
    moduleCount * modularCatalog.module.areaM2,
    Math.round((Number(model.areaBaseM2 || moduleCount * modularCatalog.module.areaM2)
      + bedrooms * Number(model.areaPerBedroomM2 || 0)
      + bathrooms * Number(model.areaPerBathroomM2 || 0)) * 100) / 100,
  );
  const energyKwhPerYear = counts.common * modularCatalog.annualEnergyKwh.common
    + counts.bedroom * modularCatalog.annualEnergyKwh.bedroom
    + counts.wetCore * modularCatalog.annualEnergyKwh.wetCore;

  if (!layout || !Number.isFinite(totalCostCop) || totalCostCop <= 0) return null;

  const modules = Object.entries(counts).map(([type, count]) => ({
    type,
    count,
    widthM: modularCatalog.module.widthM,
    lengthM: modularCatalog.module.lengthM,
    areaM2PerModule: modularCatalog.module.areaM2,
  }));
  const estimate = {
    catalogVersion: modularCatalog.version,
    areaM2,
    costCop: totalCostCop,
    currency: modularCatalog.currency,
    executionDays: modularCatalog.executionDays.setup
      + moduleCount * modularCatalog.executionDays.perModule,
    energyKwhPerYear,
    energyUnit: modularCatalog.energyUnit,
    parameters: {
      bedrooms,
      bathrooms,
      terrainWidthM: inputs.widthM,
      terrainLengthM: inputs.lengthM,
      terrainAreaM2: inputs.lotAreaM2,
      budgetCop: inputs.budgetCop,
      moduleCount,
      moduleDimensionsM: `${modularCatalog.module.widthM}x${modularCatalog.module.lengthM}`,
      moduleCounts: counts,
      unitCostsCop: modularCatalog.unitCostsCop,
      annualEnergyKwhByModule: modularCatalog.annualEnergyKwh,
      executionDaysRule: `${modularCatalog.executionDays.setup} + ${moduleCount} × ${modularCatalog.executionDays.perModule}`,
      layout,
      modelKey: model.modelKey,
      finishLevel: model.finishLevel,
    },
    assumptions: modularCatalog.disclaimer,
  };

  return {
    code,
    index: Number(model.index || 1),
    name: model.nombre,
    description: `${model.descripcion} ${moduleCount} módulos para ${bedrooms} habitaciones y ${bathrooms} baños.`,
    label: model.finishLevel || 'Modelo de constructora',
    recommended: Number(model.index || 1) === 1,
    bedrooms,
    bathrooms,
    modules,
    layout,
    estimate,
    imageCaption: 'Esquema modular académico; representación ilustrativa',
    technicalDetails: [
      ['Disposición', `${layout.columns} columnas × ${layout.rows} filas`],
      ['Huella', `${layout.footprintWidthM} × ${layout.footprintLengthM} m`],
      ['Capacidad por módulo dormitorio', `${modularCatalog.capacities.bedroomsPerModule} habitaciones`],
      ['Capacidad por módulo húmedo', `${modularCatalog.capacities.bathroomsPerModule} baños`],
    ],
    terrainId,
    source: 'proposal_model',
    contractorId: model.contractorId || null,
    modelId: model._id || null,
    modelKey: model.modelKey,
    finishLevel: model.finishLevel,
    viable: totalCostCop <= inputs.budgetCop,
    budgetDifferenceCop: totalCostCop - inputs.budgetCop,
    inclusions: model.inclusions || [],
  };
}

function fallbackModels() {
  return [
    { modelKey: 'academic-economy', nombre: 'Vivienda modular económica', descripcion: 'Solución funcional de acabados básicos.', finishLevel: 'Económica', index: 1, bedroomsMin: 1, bedroomsMax: 6, bathroomsMin: 1, bathroomsMax: 6, baseCostCop: 40000000, costPerBedroomCop: 8000000, costPerBathroomCop: 6000000, areaBaseM2: 36, areaPerBedroomM2: 8, areaPerBathroomM2: 4, inclusions: ['Estructura modular básica', 'Instalaciones esenciales'] },
    { modelKey: 'academic-standard', nombre: 'Vivienda modular estándar', descripcion: 'Modelo equilibrado para vivienda familiar.', finishLevel: 'Media', index: 2, bedroomsMin: 1, bedroomsMax: 6, bathroomsMin: 1, bathroomsMax: 6, baseCostCop: 90000000, costPerBedroomCop: 18000000, costPerBathroomCop: 12000000, areaBaseM2: 48, areaPerBedroomM2: 10, areaPerBathroomM2: 5, inclusions: ['Acabados estándar', 'Cocina y baños funcionales'] },
    { modelKey: 'academic-high', nombre: 'Vivienda modular alta', descripcion: 'Modelo con mejores acabados y mayor confort.', finishLevel: 'Alta', index: 3, bedroomsMin: 1, bedroomsMax: 6, bathroomsMin: 1, bathroomsMax: 6, baseCostCop: 150000000, costPerBedroomCop: 28000000, costPerBathroomCop: 20000000, areaBaseM2: 60, areaPerBedroomM2: 12, areaPerBathroomM2: 6, inclusions: ['Acabados superiores', 'Carpintería básica'] },
    { modelKey: 'academic-premium', nombre: 'Vivienda modular premium', descripcion: 'Modelo de alto nivel con especificaciones premium.', finishLevel: 'Premium', index: 4, bedroomsMin: 1, bedroomsMax: 6, bathroomsMin: 1, bathroomsMax: 6, baseCostCop: 280000000, costPerBedroomCop: 45000000, costPerBathroomCop: 30000000, areaBaseM2: 72, areaPerBedroomM2: 15, areaPerBathroomM2: 8, inclusions: ['Acabados premium', 'Equipamiento ampliado'] },
  ];
}

class ProposalService {
  constructor({ analysisService, analysisRepository, proposalRepository, projectRepository, modelRepository } = {}) {
    this.analysisService = analysisService || new ProjectAnalysisService();
    this.analysisRepository = analysisRepository || new ProjectAnalysisRepository();
    this.proposalRepository = proposalRepository || new ProposalRepository();
    this.projectRepository = projectRepository || new ProjectRepository();
    this.modelRepository = modelRepository || new ProposalModelRepository();
    this.contractedProjectService = new ContractedProjectService();
  }

  async withPaymentState(projectId, ownerId, result) {
    const payment = await this.contractedProjectService.getPaymentState(projectId, ownerId);
    return {
      ...result,
      projectPayment: payment,
      proposals: (result.proposals || []).map((proposal) => ({
        ...proposal,
        contracted: payment.paid && proposal.id === payment.proposalId,
        projectPaid: payment.paid,
      })),
    };
  }

  async generate(ownerId, projectId, { regenerate = false } = {}) {
    const { analysis } = await this.analysisService.analyze(ownerId, projectId);
    await this.proposalRepository.deleteOutdatedByProject(
      projectId,
      ownerId,
      analysis.inputFingerprint,
    );
    const existing = await this.proposalRepository.findGeneration(
      projectId,
      ownerId,
      analysis.inputFingerprint,
    );
    if (existing.length && !regenerate) {
      const viableExisting = existing.some((proposal) => proposal.viable !== false);
      return this.withPaymentState(projectId, ownerId, {
        viable: viableExisting,
        regenerated: false,
        proposals: existing,
        message: 'Se recuperó la generación persistida para estas entradas.',
        inputFingerprint: analysis.inputFingerprint,
      });
    }

    const project = await this.projectRepository.findByIdAndUserId(projectId, ownerId);
    if (!project) throw new HttpError(404, 'Proyecto no encontrado');
    const { inputs } = analysis;
    const availableModels = await this.modelRepository.listForProject(project);
    const models = availableModels.length ? availableModels : fallbackModels();
    const candidates = models.map((model, index) => createCandidate({
      code: String.fromCharCode(65 + index),
      model,
      bedrooms: inputs.bedrooms,
      bathrooms: inputs.bathrooms,
      inputs,
      terrainId: analysis.inputs.terrainId,
    })).filter(Boolean);

    if (!candidates.length) {
      const minimumModules = 1
        + Math.ceil(inputs.bedrooms / modularCatalog.capacities.bedroomsPerModule)
        + Math.ceil(inputs.bathrooms / modularCatalog.capacities.bathroomsPerModule);
      const dimensionsFit = !!ProjectAnalysisService.findLayout(
        inputs.widthM,
        inputs.lengthM,
        minimumModules,
      );
      const result = {
        viable: false,
        regenerated: Boolean(regenerate),
        proposals: [],
        reason: dimensionsFit ? 'no_compatible_model' : 'terrain_too_small',
        message: dimensionsFit
          ? 'No hay modelos compatibles con el rango solicitado.'
          : 'No hay combinación: la retícula de módulos requerida no cabe en las dimensiones del terreno.',
        inputFingerprint: analysis.inputFingerprint,
      };
      await this.analysisRepository.saveProposalResult({
        ownerId,
        projectId,
        inputFingerprint: analysis.inputFingerprint,
        result: {
          viable: false,
          regenerated: Boolean(regenerate),
          reason: result.reason,
          message: result.message,
          inputFingerprint: analysis.inputFingerprint,
          generatedAt: new Date(),
        },
      });
      return this.withPaymentState(projectId, ownerId, result);
    }

    const proposals = await this.proposalRepository.upsertGeneration({
      ownerId,
      projectId,
      terrainId: analysis.inputs.terrainId,
      inputFingerprint: analysis.inputFingerprint,
      proposals: candidates,
    });
    const viableProposals = proposals.filter((proposal) => proposal.viable !== false);
    const minimumCost = proposals.reduce((minimum, proposal) => Math.min(minimum, Number(proposal.estimate.costCop)), Infinity);
    const result = {
      viable: viableProposals.length > 0,
      regenerated: Boolean(regenerate),
      proposals,
      reason: viableProposals.length ? undefined : 'budget_below_minimum',
      message: viableProposals.length
        ? 'Modelos académicos persistidos; no son presupuestos comerciales garantizados.'
        : `No hay combinación dentro del presupuesto. El mínimo calculado entre modelos compatibles es ${minimumCost} ${modularCatalog.currency}.`,
      inputFingerprint: analysis.inputFingerprint,
    };
    await this.analysisRepository.saveProposalResult({
      ownerId,
      projectId,
      inputFingerprint: analysis.inputFingerprint,
      result: {
        viable: result.viable,
        regenerated: result.regenerated,
        proposalIds: proposals.map((proposal) => proposal.id),
        message: result.message,
        generatedAt: new Date(),
      },
    });
    return this.withPaymentState(projectId, ownerId, result);
  }

  async list(ownerId, projectId) {
    const project = await this.projectRepository.findByIdAndUserId(projectId, ownerId);
    if (!project) throw new HttpError(404, 'Proyecto no encontrado');
    const analysis = await this.analysisRepository.findByProjectAndOwner(projectId, ownerId);
    if (!analysis) {
      return this.withPaymentState(projectId, ownerId, {
        viable: false,
        requiresGeneration: true,
        proposals: [],
        message: 'Todavía no se han generado propuestas para este proyecto.',
      });
    }
    if (analysis.stale) {
      const proposals = await this.proposalRepository.findAllByProject(projectId, ownerId);
      return this.withPaymentState(projectId, ownerId, {
        viable: false,
        outdated: proposals.length > 0,
        proposals,
        message: proposals.length
          ? 'Los datos del proyecto cambiaron. Estas propuestas están desactualizadas; regenera para continuar.'
          : 'Los datos del proyecto cambiaron. Regenera para calcular propuestas con los valores actuales.',
        inputFingerprint: analysis.inputFingerprint,
      });
    }
    const proposals = await this.proposalRepository.findGeneration(
      projectId,
      ownerId,
      analysis.inputFingerprint,
    );
    return this.withPaymentState(projectId, ownerId, {
      viable: proposals.length > 0,
      proposals,
      message: proposals.length
        ? 'Estimaciones académicas persistidas; no son presupuestos comerciales garantizados.'
        : analysis.proposalResult?.message || 'Todavía no se han generado combinaciones viables.',
      inputFingerprint: analysis.inputFingerprint,
    });
  }

  async getById(ownerId, projectId, proposalId) {
    const project = await this.projectRepository.findByIdAndUserId(projectId, ownerId);
    if (!project) throw new HttpError(404, 'Proyecto no encontrado');
    const analysis = await this.analysisRepository.findByProjectAndOwner(projectId, ownerId);
    if (!analysis) throw new HttpError(404, 'El proyecto todavía no tiene un análisis guardado');
    const proposal = await this.proposalRepository.findByIdAndProjectAndOwner(
      proposalId,
      projectId,
      ownerId,
    );
    if (!proposal || proposal.stale || proposal.inputFingerprint !== analysis.inputFingerprint
      || !proposal.estimate || proposal.estimate.currency !== modularCatalog.currency
      || !Number.isFinite(Number(proposal.estimate.costCop))
      || Number(proposal.estimate.costCop) <= 0) {
      throw new HttpError(404, 'Propuesta no encontrada para las entradas actuales');
    }
    const payment = await this.contractedProjectService.getPaymentState(projectId, ownerId);
    return {
      ...proposal,
      contracted: payment.paid && proposal.id === payment.proposalId,
      projectPaid: payment.paid,
      projectPayment: payment,
    };
  }
}

ProposalService.createCandidate = createCandidate;
module.exports = ProposalService;
