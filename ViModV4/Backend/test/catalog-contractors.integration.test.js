const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const runId = `${process.pid}_${Date.now()}`;
const testDatabase = `vimod_stage4_catalog_test_${runId}`;
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27021';
process.env.MONGODB_DATABASE = testDatabase;
process.env.JWT_SECRET = `stage4-catalog-test-only-${runId}`;
process.env.CLIENT_ORIGIN = 'http://localhost:5500';
process.env.ROLE_ASSIGNMENTS = '';

const database = require('../Paquetes/Persistencia/AccesoDatos/database');
const app = require('../src/app');
let server;
let connected = false;
let baseUrl;

function tokenFor(id) {
  return jwt.sign({ sub: id.toHexString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function api(method, path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: response.status === 204 ? null : await response.json(),
  };
}

async function insertUser({ nombre, rol, requestedRole, accountStatus, contractorProfile }) {
  const result = await database.getDb().collection('users').insertOne({
    nombre,
    correo: `${new ObjectId().toHexString()}@example.invalid`,
    rol,
    requestedRole,
    accountType: requestedRole,
    accountStatus,
    contractorProfile,
    createdAt: new Date(),
  });
  return { id: result.insertedId, token: tokenFor(result.insertedId) };
}

const validService = (overrides = {}) => ({
  name: 'Panel modular',
  description: 'Panel para construcción modular',
  category: 'paneleria',
  type: 'servicio',
  unit: 'm²',
  availability: 'disponible',
  estimatedTime: '10 días',
  price: 1250,
  ...overrides,
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (!connected) return;
  await database.close();
  const cleanupClient = new MongoClient(process.env.MONGODB_URI);
  await cleanupClient.connect();
  await cleanupClient.db(testDatabase).dropDatabase();
  await cleanupClient.close();
});

test('catalog lists only approved active publications, filters them and enforces contractor ownership', async () => {
  await database.connect();
  connected = true;
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const contractorA = await insertUser({
    nombre: 'Constructora A',
    rol: 'constructora',
    requestedRole: 'constructora',
    accountStatus: 'aprobado',
    contractorProfile: { commercialName: 'Obras A' },
  });
  const contractorB = await insertUser({
    nombre: 'Constructora B',
    rol: 'constructora',
    requestedRole: 'constructora',
    accountStatus: 'approved',
  });
  const pending = await insertUser({
    nombre: 'Constructora pendiente',
    rol: 'cliente',
    requestedRole: 'constructora',
    accountStatus: 'pendiente',
  });

  assert.equal((await api('POST', '/contractor/services', {
    token: contractorA.token,
    body: validService({ price: 0 }),
  })).status, 400);
  assert.equal((await api('POST', '/contractor/services', {
    token: contractorA.token,
    body: validService({ unit: '' }),
  })).status, 400);
  const serviceA = await api('POST', '/contractor/services', {
    token: contractorA.token,
    body: validService(),
  });
  assert.equal(serviceA.status, 201, JSON.stringify(serviceA.payload));
  const paused = await api('POST', '/contractor/services', {
    token: contractorA.token,
    body: validService({ name: 'Servicio pausado', price: 500 }),
  });
  assert.equal(paused.status, 201, JSON.stringify(paused.payload));
  assert.equal((await api('PATCH', `/contractor/services/${paused.payload.service.id}`, {
    token: contractorA.token,
    body: { ...validService({ name: 'Servicio pausado', price: 500 }), status: 'paused' },
  })).status, 200);
  const serviceB = await api('POST', '/contractor/services', {
    token: contractorB.token,
    body: validService({
      name: 'Material de cubierta',
      type: 'material',
      category: 'cubiertas',
      unit: 'pieza',
      availability: 'no-disponible',
      price: 2500,
    }),
  });
  assert.equal(serviceB.status, 201, JSON.stringify(serviceB.payload));
  assert.equal((await api('POST', '/contractor/services', {
    token: pending.token,
    body: validService(),
  })).status, 403);

  const all = await api('GET', '/services');
  assert.equal(all.status, 200);
  assert.deepEqual(all.payload.services.map((service) => service.id).sort(), [
    serviceA.payload.service.id,
    serviceB.payload.service.id,
  ].sort());
  assert.ok(all.payload.services.every((service) => service.status === 'active'));
  assert.equal((await api('GET', '/services?type=material')).payload.services.length, 1);
  assert.equal((await api('GET', '/services?category=paneleria')).payload.services.length, 1);
  assert.equal((await api('GET', '/services?minPrice=1200&maxPrice=1300')).payload.services.length, 1);
  assert.deepEqual((await api('GET', `/services?contractorId=${contractorA.id}`))
    .payload.services.map((service) => service.id), [serviceA.payload.service.id]);
  assert.deepEqual((await api('GET', '/services?availability=no-disponible'))
    .payload.services.map((service) => service.id), [serviceB.payload.service.id]);
  assert.equal((await api('GET', '/services?minPrice=5000&maxPrice=100')).status, 400);

  const listedContractors = await api('GET', '/contractors');
  assert.equal(listedContractors.payload.contractors.length, 2);
  const missingProfile = await api('GET', `/contractors/${contractorB.id}`);
  assert.equal(missingProfile.payload.profile.commercialName, 'No indicado');
  assert.equal(missingProfile.payload.profile.contact, 'No indicado');
  assert.equal((await api('GET', `/contractors/${pending.id}`)).status, 404);

  assert.equal((await api('PATCH', `/contractor/services/${serviceB.payload.service.id}`, {
    token: contractorA.token,
    body: validService({ name: 'Intento de modificación ajena' }),
  })).status, 404);
  assert.equal((await api('DELETE', `/contractor/services/${serviceB.payload.service.id}`, {
    token: contractorA.token,
  })).status, 404);
  const updatedOwnService = await api('PATCH', `/contractor/services/${serviceA.payload.service.id}`, {
    token: contractorA.token,
    body: validService({ name: 'Panel modular actualizado' }),
  });
  assert.equal(updatedOwnService.status, 200);
  assert.equal(updatedOwnService.payload.service.name, 'Panel modular actualizado');
  assert.equal((await api('DELETE', `/contractor/services/${paused.payload.service.id}`, {
    token: contractorA.token,
  })).status, 204);
  assert.equal((await api('GET', '/contractor/services', { token: pending.token })).status, 403);

  const ownProfile = await api('GET', '/contractor/profile', { token: contractorA.token });
  assert.equal(ownProfile.payload.profile.commercialName, 'Obras A');
  const updatedProfile = await api('PATCH', '/contractor/profile', {
    token: contractorA.token,
    body: {
      commercialName: 'Obras A Modular',
      description: 'Construcción modular',
      coverageZone: 'Zona centro',
      contact: 'contacto@example.invalid',
    },
  });
  assert.equal(updatedProfile.status, 200);
  assert.equal(updatedProfile.payload.profile.coverageZone, 'Zona centro');
  assert.equal((await api('PATCH', '/contractor/profile', {
    token: contractorA.token,
    body: { commercialName: '' },
  })).status, 400);
  assert.equal((await api('PATCH', '/contractor/profile', {
    token: contractorA.token,
    body: { commercialName: 'x'.repeat(121) },
  })).status, 400);
  assert.equal((await api('PATCH', '/contractor/profile', {
    token: pending.token,
    body: { commercialName: 'Pendiente' },
  })).status, 403);
});
