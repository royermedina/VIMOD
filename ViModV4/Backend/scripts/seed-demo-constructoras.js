const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');
const env = require('../src/config/env');

const SEED_SOURCE = 'vimod-demo-constructoras-v1';
const contractors = [
  {
    key: 'cimientos',
    name: 'Cimientos del Altiplano Demo',
    email: 'demo.cimientos@example.invalid',
    profile: {
      commercialName: 'Cimientos del Altiplano',
      description: 'Demostración académica de cimentaciones y obra civil.',
      coverageZone: 'Bogotá y Sabana Centro',
      contact: '+57 300 000 0001',
    },
    services: [
      ['Excavación para cimentación', 'Retiro manual de material para zapatas y vigas de amarre.', 'Cimentaciones', 'm³', 95000, 'servicio'],
      ['Concreto para elemento de cimentación', 'Suministro y colocación de concreto como valor académico de referencia.', 'Obra civil', 'm³', 620000, 'servicio'],
      ['Acero de refuerzo figurado', 'Corte y figurado de acero de refuerzo.', 'Cimentaciones', 'kg', 9200, 'material'],
    ],
  },
  {
    key: 'cubiertas',
    name: 'Cubiertas Andinas Demo',
    email: 'demo.cubiertas@example.invalid',
    profile: {
      commercialName: 'Cubiertas Andinas',
      description: 'Demostración académica de soluciones para cubiertas y techos.',
      coverageZone: 'Medellín y Valle de Aburrá',
      contact: '+57 300 000 0002',
    },
    services: [
      ['Cubierta metálica liviana', 'Suministro de cubierta liviana, sin cálculo estructural.', 'Cubiertas y techos', 'm²', 185000, 'material'],
      ['Instalación de cubierta', 'Montaje referencial de cubierta sobre estructura existente.', 'Cubiertas y techos', 'm²', 98000, 'servicio'],
      ['Impermeabilización de cubierta', 'Aplicación de sistema impermeabilizante de mantenimiento.', 'Impermeabilización', 'm²', 72000, 'servicio'],
    ],
  },
  {
    key: 'agregados',
    name: 'Agregados del Valle Demo',
    email: 'demo.agregados@example.invalid',
    profile: {
      commercialName: 'Agregados del Valle',
      description: 'Demostración académica de agregados y materiales de construcción.',
      coverageZone: 'Cali y municipios del Valle del Cauca',
      contact: '+57 300 000 0003',
    },
    services: [
      ['Arena lavada', 'Precio indicativo por volumen; transporte no incluido.', 'Agregados', 'm³', 145000, 'material'],
      ['Cemento gris', 'Bulto de 50 kg para fines de demostración.', 'Cementantes', 'bulto', 38000, 'material'],
      ['Gravilla triturada', 'Agregado grueso para mezclas de concreto.', 'Agregados', 'm³', 168000, 'material'],
    ],
  },
  {
    key: 'metalicas',
    name: 'Estructuras Metálicas Demo',
    email: 'demo.metalicas@example.invalid',
    profile: {
      commercialName: 'Estructuras Metálicas',
      description: 'Demostración académica de estructuras metálicas y tornillería.',
      coverageZone: 'Barranquilla y área metropolitana',
      contact: '+57 300 000 0004',
    },
    services: [
      ['Perfil estructural liviano', 'Suministro referencial de perfil metálico para sistemas livianos.', 'Estructuras metálicas', 'kg', 18500, 'material'],
      ['Tornillo autoperforante', 'Tornillería galvanizada para fijaciones livianas.', 'Tornillería', 'unidad', 1800, 'material'],
      ['Armado de estructura liviana', 'Servicio referencial de ensamble; requiere diseño profesional.', 'Estructuras metálicas', 'm²', 210000, 'servicio'],
    ],
  },
  {
    key: 'carpinteria',
    name: 'Carpintería y Acabados Demo',
    email: 'demo.carpinteria@example.invalid',
    profile: {
      commercialName: 'Carpintería y Acabados',
      description: 'Demostración académica de carpintería arquitectónica y acabados.',
      coverageZone: 'Bucaramanga y área metropolitana',
      contact: '+57 300 000 0005',
    },
    services: [
      ['Puerta interior en madera', 'Puerta de dimensiones estándar como valor indicativo.', 'Carpintería', 'unidad', 780000, 'material'],
      ['Mueble bajo de cocina', 'Módulo de carpintería con acabado básico.', 'Carpintería', 'm²', 690000, 'servicio'],
      ['Pintura interior', 'Aplicación de pintura en superficie preparada.', 'Acabados', 'm²', 32000, 'servicio'],
    ],
  },
  {
    key: 'instalaciones',
    name: 'Instalaciones Integrales Demo',
    email: 'demo.instalaciones@example.invalid',
    profile: {
      commercialName: 'Instalaciones Integrales',
      description: 'Demostración académica de instalaciones eléctricas e hidrosanitarias.',
      coverageZone: 'Pereira y Eje Cafetero',
      contact: '+57 300 000 0006',
    },
    services: [
      ['Punto eléctrico residencial', 'Instalación referencial de punto; requiere validación de diseño.', 'Instalaciones eléctricas', 'unidad', 125000, 'servicio'],
      ['Tubería hidrosanitaria', 'Tubería para redes internas, sin accesorios especiales.', 'Instalaciones hidrosanitarias', 'm', 28000, 'material'],
      ['Montaje de aparato sanitario', 'Instalación referencial de aparato con punto existente.', 'Instalaciones hidrosanitarias', 'unidad', 165000, 'servicio'],
    ],
  },
];

function requireDemoDatabase() {
  const databaseName = process.env.DEMO_MONGODB_DATABASE;
  if (!databaseName || !/^vimod_(demo|stage)/i.test(databaseName)) {
    throw new Error('Define DEMO_MONGODB_DATABASE con un nombre vimod_demo_* o vimod_stage*; nunca se usa la base vimod.');
  }
  return databaseName;
}

function serviceDocument(ownerId, contractor, service, index, now) {
  const [name, description, category, unit, price, type] = service;
  return {
    ownerId,
    name,
    description,
    category,
    estimatedTime: 'Valor de demostración, sujeto a cotización',
    type,
    unit,
    availability: 'disponible',
    price,
    currency: 'COP',
    status: 'active',
    demo: true,
    demoSource: SEED_SOURCE,
    demoSeedKey: `${contractor.key}-service-${index + 1}`,
    updatedAt: now,
  };
}

async function main() {
  const removeOnly = process.argv.slice(2).includes('--remove');
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--remove') || args.filter((arg) => arg === '--remove').length > 1) {
    throw new Error('Uso: node scripts\\seed-demo-constructoras.js [--remove]');
  }
  const password = process.env.DEMO_SEED_PASSWORD;
  if (!removeOnly && !password) {
    throw new Error('Falta DEMO_SEED_PASSWORD en el entorno; no se crearon documentos.');
  }
  if (!removeOnly && password.length < 8) {
    throw new Error('DEMO_SEED_PASSWORD debe tener al menos 8 caracteres.');
  }
  const databaseName = requireDemoDatabase();

  const client = new MongoClient(process.env.DEMO_MONGODB_URI || env.mongodbUri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db(databaseName);
    const users = db.collection('users');
    const services = db.collection('services');

    if (removeOnly) {
      const deletedServices = await services.deleteMany({
        demo: true,
        demoSource: SEED_SOURCE,
      });
      const deletedUsers = await users.deleteMany({
        demo: true,
        demoSource: SEED_SOURCE,
      });
      console.log(`Datos demo eliminados: ${deletedUsers.deletedCount} constructoras y ${deletedServices.deletedCount} publicaciones.`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    for (const contractor of contractors) {
      const userFilter = { demo: true, demoSource: SEED_SOURCE, demoSeedKey: contractor.key };
      await users.updateOne(userFilter, {
        $set: {
          nombre: contractor.name,
          correo: contractor.email,
          rol: 'constructora',
          requestedRole: 'constructora',
          accountType: 'constructora',
          accountStatus: 'aprobado',
          contractorProfile: contractor.profile,
          demo: true,
          demoSource: SEED_SOURCE,
          demoSeedKey: contractor.key,
          updatedAt: now,
        },
        $setOnInsert: {
          passwordHash,
          createdAt: now,
        },
      }, { upsert: true });
      const user = await users.findOne(userFilter, { projection: { _id: 1 } });
      if (!user) throw new Error(`No se pudo guardar el perfil de demostración ${contractor.key}.`);

      for (const [index, service] of contractor.services.entries()) {
        const document = serviceDocument(user._id, contractor, service, index, now);
        await services.updateOne({
          demo: true,
          ownerId: user._id,
          demoSeedKey: document.demoSeedKey,
        }, {
          $set: { ...document, updatedAt: now },
          $setOnInsert: { createdAt: now },
        }, { upsert: true });
      }
    }
    console.log('Se sincronizaron 6 constructoras de demostración y 18 publicaciones. No se modificaron documentos sin demo: true.');
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`Error al gestionar las constructoras demo: ${error.message}`);
  process.exitCode = 1;
});
