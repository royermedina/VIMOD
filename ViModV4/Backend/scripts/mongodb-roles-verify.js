const passwords = {
  root: process.env.VIMOD_ROOT_PWD,
  analyst: process.env.VIMOD_ANALISTA_PWD,
  catalog: process.env.VIMOD_CATALOGO_PWD,
  app: process.env.VIMOD_APP_PWD,
  test: process.env.VIMOD_TEST_PWD,
};

const required = ['root', 'analyst', 'catalog', 'app'];
const missing = required.filter((name) => !passwords[name]);

if (missing.length > 0) {
  throw new Error(`Falta la contraseña de verificación para: ${missing.join(', ')}`);
}

const baseUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27021';
const marker = `vimod_authz_verify_${Date.now()}_${Math.random().toString(16).slice(2)}`;
let failures = 0;
const cleanupIds = {
  analyst: `${marker}_analyst`,
  catalog: `${marker}_catalog`,
  catalogUser: `${marker}_catalog_user`,
  app: `${marker}_app`,
};

function connectAs(username, password) {
  const separator = baseUri.includes('?') ? '&' : '?';
  const credentials = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
  const uri = baseUri.replace(/^mongodb:\/\//, `mongodb://${credentials}@`)
    + `${separator}authSource=admin`;
  return new Mongo(uri);
}

function report(name, passed, error) {
  if (passed) {
    print(`PASS ${name}`);
    return;
  }

  failures += 1;
  const code = error && (error.codeName || error.code);
  print(`FAIL ${name}${code ? ` (MongoDB ${code})` : ''}`);
}

function run(name, action) {
  try {
    action();
    report(name, true);
  } catch (error) {
    report(name, false, error);
  }
}

function expectUnauthorized(action) {
  try {
    action();
  } catch (error) {
    if (error.code === 13 || error.codeName === 'Unauthorized') return;
    throw error;
  }
  throw new Error('La operación inesperadamente fue autorizada');
}

const rootClient = connectAs('vimod_root', passwords.root);
const analystClient = connectAs('vimod_analista', passwords.analyst);
const catalogClient = connectAs('vimod_catalogo', passwords.catalog);
const appClient = connectAs('vimod_app', passwords.app);
const rootDb = rootClient.getDB('admin');
const vimodDb = rootClient.getDB('vimod');
const analystDb = analystClient.getDB('vimod');
const catalogDb = catalogClient.getDB('vimod');
const appDb = appClient.getDB('vimod');

try {
  run('vimod_root autentica y consulta usuarios MongoDB', () => {
    const result = rootDb.runCommand({ usersInfo: 1 });
    if (result.ok !== 1) throw new Error('No se pudo consultar la lista de usuarios');
  });

  run('vimod_analista puede leer users y ejecutar aggregate en vimod', () => {
    analystDb.collection('users').findOne({});
    analystDb.collection('users').aggregate([{ $limit: 1 }]).toArray();
  });

  run('vimod_analista no puede insertar en users', () => {
    expectUnauthorized(() => analystDb.collection('users').insertOne({
      _id: cleanupIds.analyst,
      authzVerification: marker,
    }));
  });

  run('vimod_catalogo puede insertar y actualizar services', () => {
    const services = catalogDb.collection('services');
    services.insertOne({
      _id: cleanupIds.catalog,
      name: marker,
      authzVerification: marker,
    });
    const updated = services.updateOne({ _id: cleanupIds.catalog }, { $set: { verified: true } });
    if (updated.matchedCount !== 1) throw new Error('No se pudo actualizar el documento temporal');
  });

  run('vimod_catalogo no puede insertar en users', () => {
    expectUnauthorized(() => catalogDb.collection('users').insertOne({
      _id: cleanupIds.catalogUser,
      authzVerification: marker,
    }));
  });

  run('vimod_app puede leer y escribir en vimod', () => {
    appDb.collection('services').insertOne({
      _id: cleanupIds.app,
      name: marker,
      authzVerification: marker,
    });
    if (!appDb.collection('services').findOne({ _id: cleanupIds.app })) {
      throw new Error('No se pudo leer el documento temporal');
    }
  });

  run('vimod_app no puede leer admin.system.version', () => {
    expectUnauthorized(() => appClient.getDB('admin').collection('system.version').findOne({}));
  });

  if (passwords.test) {
    const testClient = connectAs('vimod_test', passwords.test);
    const testDbName = `${marker}_test`;
    run('vimod_test puede crear una base temporal', () => {
      testClient.getDB(testDbName).createCollection('probe');
    });
  } else {
    print('SKIP vimod_test: VIMOD_TEST_PWD no está definida.');
  }
} finally {
  run('limpieza de vimod.users como vimod_root', () => {
    vimodDb.collection('users').deleteMany({ authzVerification: marker });
  });
  run('limpieza de vimod.services como vimod_root', () => {
    vimodDb.collection('services').deleteMany({ authzVerification: marker });
  });
  if (passwords.test) {
    run('limpieza de la base temporal como vimod_root', () => {
      rootClient.getDB(`${marker}_test`).dropDatabase();
    });
  }

  [rootClient, analystClient, catalogClient, appClient].forEach((client) => client.close());
}

if (failures > 0) {
  print(`Resultado: ${failures} caso(s) fallido(s).`);
  quit(1);
}

print('Resultado: todos los casos ejecutados pasaron.');
quit(0);
