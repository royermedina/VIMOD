const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

const SEED_BATCH = 'propuestas-2026-10-v1';
const contractors = [
  ['arquijuve3d', 'ArquiJuve3D', 'Diseño y construcción modular con enfoque funcional.', 'Bogotá y Cundinamarca'],
  ['re-constructora', 'R.E Constructora', 'Vivienda industrializada y soluciones de obra civil.', 'Antioquia y Eje Cafetero'],
  ['habitat-cauca', 'Habitat Modular Cauca', 'Modelos modulares para vivienda urbana y rural.', 'Cauca y Valle del Cauca'],
  ['casas-del-sur', 'Casas del Sur SAS', 'Vivienda familiar modular con acabados escalables.', 'Nariño y Huila'],
  ['modular-andino', 'ModuLar Andino', 'Sistemas modulares de alta eficiencia constructiva.', 'Boyacá y Santander'],
  ['horizonte-modular', 'Horizonte Modular', 'Diseño, fabricación y montaje de vivienda modular.', 'Costa Caribe y Bogotá'],
];

const finishes = [
  ['economy', 'Económica', 40000000, 8000000, 6000000, 36, 8, 4],
  ['standard', 'Media', 90000000, 18000000, 12000000, 48, 10, 5],
  ['high', 'Alta', 150000000, 28000000, 20000000, 60, 12, 6],
  ['premium', 'Premium', 280000000, 45000000, 30000000, 72, 15, 8],
];

function modelDocuments(contractorId, contractorKey, now) {
  return finishes.map(([level, label, base, bedroom, bathroom, area, areaBedroom, areaBathroom], index) => ({
    contractorId,
    modelKey: `${contractorKey}-${level}`,
    nombre: `${contractors.find((item) => item[0] === contractorKey)[1]} ${label}`,
    descripcion: `Modelo ${label.toLowerCase()} de ${contractors.find((item) => item[0] === contractorKey)[1]}.`,
    bedroomsMin: 1,
    bedroomsMax: 6,
    bathroomsMin: 1,
    bathroomsMax: 6,
    finishLevel: label,
    baseCostCop: base,
    costPerBedroomCop: bedroom,
    costPerBathroomCop: bathroom,
    areaBaseM2: area,
    areaPerBedroomM2: areaBedroom,
    areaPerBathroomM2: areaBathroom,
    plazoBaseDias: 70 + index * 25,
    plazoPorModuloDias: 8 + index * 2,
    inclusions: ['Estructura modular', 'Instalaciones básicas', label === 'Premium' ? 'Acabados premium' : 'Acabados escalables'],
    active: true,
    seed: true,
    seedBatch: SEED_BATCH,
    seedKey: `${contractorKey}-${level}`,
    updatedAt: now,
  }));
}

function serviceDocuments(contractorId, contractorKey, now) {
  return [
    ['Diseño y montaje modular', 'Modelo de referencia para vivienda modular.', 'Vivienda modular', 'm²', 850000, 'servicio'],
    ['Instalación de cubierta liviana', 'Suministro e instalación referencial.', 'Cubiertas', 'm²', 185000, 'servicio'],
  ].map(([name, description, category, unit, price, type], index) => ({
    ownerId: contractorId, name, description, category, unit, price, type,
    estimatedTime: 'Sujeto a cotización y validación profesional', availability: 'disponible', currency: 'COP', status: 'active',
    seed: true, seedBatch: SEED_BATCH, seedKey: `${contractorKey}-service-${index + 1}`, updatedAt: now,
  }));
}

function mode() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--undo')) return 'undo';
  if (args.has('--apply')) return 'apply';
  return 'dry-run';
}

function summary() {
  return {
    seedBatch: SEED_BATCH,
    database: process.env.DEMO_MONGODB_DATABASE || process.env.MONGODB_DATABASE || 'vimod',
    contractors: contractors.map((item) => ({ key: item[0], name: item[1], email: `demo.${item[0]}@example.invalid`, models: 4, services: 2 })),
    totals: { contractors: contractors.length, models: contractors.length * 4, services: contractors.length * 2 },
    credentials: 'La contraseña se toma de DEMO_SEED_PASSWORD; nunca se imprime ni se almacena en el script.',
  };
}

async function main() {
  const selectedMode = mode();
  if (selectedMode === 'dry-run') {
    console.log(JSON.stringify(summary(), null, 2));
    console.log('Dry-run: no se abrió conexión ni se modificó MongoDB. Usa --apply solo después de confirmar este resumen.');
    return;
  }
  const databaseName = process.env.DEMO_MONGODB_DATABASE || process.env.MONGODB_DATABASE;
  if (!databaseName) throw new Error('Define DEMO_MONGODB_DATABASE para elegir explícitamente la base de demostración.');
  if (databaseName === 'vimod' && process.env.DEMO_SEED_CONFIRM !== 'YES') {
    throw new Error('Para aplicar contra vimod debes definir DEMO_SEED_CONFIRM=YES después de revisar el dry-run.');
  }
  const password = process.env.DEMO_SEED_PASSWORD;
  if (selectedMode === 'apply' && (!password || password.length < 12)) {
    throw new Error('DEMO_SEED_PASSWORD debe tener al menos 12 caracteres.');
  }
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27021');
  await client.connect();
  try {
    const db = client.db(databaseName);
    const users = db.collection('users');
    const models = db.collection('proposalModels');
    const services = db.collection('services');
    if (selectedMode === 'undo') {
      const [deletedModels, deletedServices, deletedUsers] = await Promise.all([
        models.deleteMany({ seed: true, seedBatch: SEED_BATCH }),
        services.deleteMany({ seed: true, seedBatch: SEED_BATCH }),
        users.deleteMany({ seed: true, seedBatch: SEED_BATCH }),
      ]);
      console.log(JSON.stringify({ database: databaseName, deleted: { models: deletedModels.deletedCount, services: deletedServices.deletedCount, users: deletedUsers.deletedCount } }));
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    for (const [key, name, description, zone] of contractors) {
      await users.updateOne({ seed: true, seedBatch: SEED_BATCH, seedKey: key }, {
        $set: {
          nombre: name, correo: `demo.${key}@example.invalid`, rol: 'constructora', requestedRole: 'constructora', accountType: 'constructora', accountStatus: 'aprobado',
          contractorProfile: { commercialName: name, description, coverageZone: zone, contact: 'Contacto disponible en demostración académica' },
          demo: true, seed: true, seedBatch: SEED_BATCH, seedKey: key, updatedAt: now,
        },
        $setOnInsert: { passwordHash, createdAt: now },
      }, { upsert: true });
      const user = await users.findOne({ seed: true, seedBatch: SEED_BATCH, seedKey: key }, { projection: { _id: 1 } });
      for (const model of modelDocuments(user._id, key, now)) {
        await models.updateOne({ seed: true, seedBatch: SEED_BATCH, seedKey: model.seedKey }, { $set: model, $setOnInsert: { createdAt: now } }, { upsert: true });
      }
      for (const service of serviceDocuments(user._id, key, now)) {
        await services.updateOne({ seed: true, seedBatch: SEED_BATCH, seedKey: service.seedKey }, { $set: service, $setOnInsert: { createdAt: now } }, { upsert: true });
      }
    }
    console.log(JSON.stringify({ database: databaseName, insertedOrUpdated: summary().totals, seedBatch: SEED_BATCH }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`Seed de propuestas: ${error.message}`);
  process.exitCode = 1;
});
