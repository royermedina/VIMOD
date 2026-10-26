module.exports = Object.freeze({
  version: 'academic-co-1',
  currency: 'COP',
  energyUnit: 'kWh/año',
  module: Object.freeze({
    widthM: 6,
    lengthM: 4,
    areaM2: 24,
  }),
  capacities: Object.freeze({
    bedroomsPerModule: 2,
    bathroomsPerModule: 2,
  }),
  // Supuestos académicos aproximados de 1,9 a 3 millones COP por m²; no son cotizaciones.
  unitCostsCop: Object.freeze({
    common: 45000000,
    bedroom: 58000000,
    wetCore: 72000000,
  }),
  annualEnergyKwh: Object.freeze({
    common: 900,
    bedroom: 450,
    wetCore: 300,
  }),
  executionDays: Object.freeze({
    setup: 10,
    perModule: 4,
  }),
  disclaimer: 'Estimación académica preliminar; no es presupuesto comercial ni estudio profesional de suelo o diseño estructural.',
});