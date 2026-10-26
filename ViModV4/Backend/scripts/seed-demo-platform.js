const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

const SEED_SOURCE = 'vimod-demo-platform-v1';
const demoArchitects = [
  {
    key: 'andres-ramirez',
    name: 'Arquitecto Andrés Ramírez',
    email: 'demo.andres.ramirez@example.invalid',
    profile: {
      specialty: 'Vivienda modular y coordinación de obra',
      yearsExperience: 12,
      zone: 'Bogotá y Sabana Centro',
      baseFee: 3800000,
    },
  },
  {
    key: 'laura-gomez',
    name: 'Arquitecta Laura Gómez',
    email: 'demo.laura.gomez@example.invalid',
    profile: {
      specialty: 'Diseño bioclimático y vivienda urbana',
      yearsExperience: 9,
      zone: 'Medellín y Valle de Aburrá',
      baseFee: 3200000,
    },
  },
  {
    key: 'carlos-munoz',
    name: 'Arquitecto Carlos Muñoz',
    email: 'demo.carlos.munoz@example.invalid',
    profile: {
      specialty: 'Estructuras livianas y vivienda rural',
      yearsExperience: 15,
      zone: 'Cali y Valle del Cauca',
      baseFee: 4100000,
    },
  },
  {
    key: 'natalia-rodriguez',
    name: 'Arquitecta Natalia Rodríguez',
    email: 'demo.natalia.rodriguez@example.invalid',
    profile: {
      specialty: 'Interventoría y presupuestos de vivienda',
      yearsExperience: 7,
      zone: 'Bucaramanga y Santander',
      baseFee: 2900000,
    },
  },
];

const demoProjects = [
  {
    key: 'vivienda-familiar-dos-habitaciones',
    name: 'Vivienda familiar de dos habitaciones',
    location: 'Bogotá, lote de demostración',
    width: 12,
    length: 20,
    budget: 220000000,
    bedrooms: 2,
    bathrooms: 2,
  },
  {
    key: 'casa-modular-lote-urbano',
    name: 'Casa modular para lote urbano',
    location: 'Medellín, lote de demostración',
    width: 10,
    length: 18,
    budget: 190000000,
    bedrooms: 2,
    bathrooms: 1,
  },
  {
    key: 'vivienda-economica-tres-habitaciones',
    name: 'Vivienda económica de tres habitaciones',
    location: 'Cali, lote de demostración',
    width: 14,
    length: 22,
    budget: 280000000,
    bedrooms: 3,
    bathrooms: 2,
  },
  {
    key: 'proyecto-vivienda-terreno-rural',
    name: 'Proyecto de vivienda para terreno rural',
    location: 'Santander, lote de demostración',
    width: 18,
    length: 30,
    budget: 250000000,
    bedrooms: 2,
    bathrooms: 2,
  },
];

function requireDemoDatabase() {
  const databaseName = process.env.DEMO_MONGODB_DATABASE;
  if (!databaseName || !/^vimod_(demo|stage)/i.test(databaseName)) {
    throw new Error('Define DEMO_MONGODB_DATABASE con un nombre vimod_demo_* o vimod_stage*; nunca se usa la base vimod.');
  }
  return databaseName;
}

function validateArguments() {
  const args = process.argv.slice(2);
  const removeOnly = args.includes('--remove');
  if (args.some((arg) => arg !== '--remove') || args.filter((arg) => arg === '--remove').length > 1) {
    throw new Error('Uso: node scripts\\seed-demo-platform.js [--remove]');
  }
  const password = process.env.DEMO_SEED_PASSWORD;
  if (!removeOnly && (!password || password.length < 8)) {
    throw new Error('DEMO_SEED_PASSWORD debe tener al menos 8 caracteres.');
  }
  return { removeOnly, password };
}

async function upsertUser(users, filter, fields, passwordHash, now) {
  await users.updateOne(filter, {
    $set: { ...fields, updatedAt: now },
    $setOnInsert: { passwordHash, createdAt: now },
  }, { upsert: true });
  return users.findOne(filter, { projection: { _id: 1 } });
}

async function main() {
  const { removeOnly, password } = validateArguments();
  const databaseName = requireDemoDatabase();
  const client = new MongoClient(process.env.DEMO_MONGODB_URI || 'mongodb://127.0.0.1:27021', {
    serverSelectionTimeoutMS: 5000,
  });

  try {
    await client.connect();
    const db = client.db(databaseName);
    const users = db.collection('users');
    const terrains = db.collection('terrains');
    const projects = db.collection('projects');

    if (removeOnly) {
      const projectResult = await projects.deleteMany({ demo: true, demoSource: SEED_SOURCE });
      const terrainResult = await terrains.deleteMany({ demo: true, demoSource: SEED_SOURCE });
      const userResult = await users.deleteMany({ demo: true, demoSource: SEED_SOURCE });
      console.log(`Datos demo eliminados: ${userResult.deletedCount} usuarios, ${terrainResult.deletedCount} terrenos y ${projectResult.deletedCount} proyectos.`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    for (const architect of demoArchitects) {
      await upsertUser(users, {
        demo: true,
        demoSource: SEED_SOURCE,
        demoSeedKey: architect.key,
      }, {
        nombre: architect.name,
        correo: architect.email,
        rol: 'arquitecto',
        requestedRole: 'arquitecto',
        accountType: 'arquitecto',
        accountStatus: 'aprobado',
        architectProfile: architect.profile,
        demo: true,
        demoSource: SEED_SOURCE,
        demoSeedKey: architect.key,
      }, passwordHash, now);
    }

    const clientUser = await upsertUser(users, {
      demo: true,
      demoSource: SEED_SOURCE,
      demoSeedKey: 'client',
    }, {
      nombre: 'Cliente Demo ViMod',
      correo: 'demo.cliente@example.invalid',
      rol: 'cliente',
      requestedRole: 'cliente',
      accountType: 'cliente',
      accountStatus: 'activo',
      demo: true,
      demoSource: SEED_SOURCE,
      demoSeedKey: 'client',
    }, passwordHash, now);

    for (const project of demoProjects) {
      const terrainResult = await terrains.updateOne({
        demo: true,
        demoSource: SEED_SOURCE,
        demoSeedKey: `${project.key}-terrain`,
      }, {
        $set: {
          ownerId: clientUser._id,
          ubicacion: project.location,
          ancho: project.width,
          largo: project.length,
          area: Number((project.width * project.length).toFixed(2)),
          demo: true,
          demoSource: SEED_SOURCE,
          demoSeedKey: `${project.key}-terrain`,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      }, { upsert: true });
      const terrain = await terrains.findOne({
        demo: true,
        demoSource: SEED_SOURCE,
        demoSeedKey: `${project.key}-terrain`,
      }, { projection: { _id: 1 } });
      if (!terrainResult.acknowledged || !terrain) throw new Error(`No se pudo guardar el terreno ${project.key}.`);

      await projects.updateOne({
        demo: true,
        demoSource: SEED_SOURCE,
        demoSeedKey: project.key,
      }, {
        $set: {
          ownerId: clientUser._id,
          terrainId: terrain._id,
          nombre: project.name,
          presupuesto: project.budget,
          habitaciones: project.bedrooms,
          banos: project.bathrooms,
          estado: 'Borrador',
          demo: true,
          demoSource: SEED_SOURCE,
          demoSeedKey: project.key,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      }, { upsert: true });
    }

    console.log('Se sincronizaron 5 usuarios demo (4 arquitectos aprobados y 1 cliente) y 4 proyectos con terrenos.');
    console.log(`Base utilizada: ${databaseName}. No se modificaron documentos sin demo: true.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`Error al gestionar la plataforma demo: ${error.message}`);
  process.exitCode = 1;
});
