const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');

const runId = `${process.pid}_${Date.now()}`;
const testDatabase = `vimod_stage1_test_${runId}`;
const architectId = '64b000000000000000000001';
const constructorId = '64b000000000000000000002';
const testPassword = 'ViModStage1-Test-123!';
const architectEmail = `architect.${runId}@example.invalid`;
const constructorEmail = `constructor.${runId}@example.invalid`;

process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27021';
process.env.MONGODB_DATABASE = testDatabase;
process.env.JWT_SECRET = `test-only-${runId}-secret`;
process.env.CLIENT_ORIGIN = 'http://localhost:5500';
process.env.ROLE_ASSIGNMENTS = `${architectId}=arquitecto;${constructorId}=constructora`;

const database = require('../Paquetes/Persistencia/AccesoDatos/database');
const app = require('../src/app');
let server;
let connected = false;
let baseUrl;

async function api(method, path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function register(email, extra = {}) {
  return api('POST', '/auth/register', {
    body: {
      nombre: `HU04 ${runId}`,
      correo: email,
      password: testPassword,
      ...extra,
    },
  });
}

async function login(email) {
  const result = await api('POST', '/auth/login', {
    body: { correo: email, password: testPassword },
  });
  assert.equal(result.status, 200);
  return result.payload;
}

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (connected) await database.close();

  if (connected) {
    const cleanupClient = new MongoClient(process.env.MONGODB_URI);
    await cleanupClient.connect();
    await cleanupClient.db(testDatabase).dropDatabase();
    await cleanupClient.close();
  }
});

test('HU-04 project persistence, validation, ownership and role authorization', async () => {
  await database.connect();
  connected = true;

  const users = database.getDb().collection('users');
  const passwordHash = await bcrypt.hash(testPassword, 10);
  await users.insertMany([
    {
      _id: new ObjectId(architectId),
      nombre: 'Assigned Architect',
      correo: architectEmail,
      passwordHash,
      rol: 'cliente',
      createdAt: new Date(),
    },
    {
      _id: new ObjectId(constructorId),
      nombre: 'Assigned Constructor',
      correo: constructorEmail,
      passwordHash,
      rol: 'cliente',
      createdAt: new Date(),
    },
  ]);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const ownerEmail = `owner.${runId}@example.invalid`;
  const otherEmail = `other.${runId}@example.invalid`;
  const ownerRegistration = await register(ownerEmail, { rol: 'arquitecto' });
  const otherRegistration = await register(otherEmail);
  assert.equal(ownerRegistration.status, 201);
  assert.equal(ownerRegistration.payload.user.rol, 'cliente');
  assert.equal('passwordHash' in ownerRegistration.payload.user, false);
  assert.equal('password' in ownerRegistration.payload.user, false);
  assert.equal(otherRegistration.status, 201);

  const owner = await login(ownerEmail);
  const other = await login(otherEmail);
  const architect = await login(architectEmail);
  const constructor = await login(constructorEmail);

  assert.equal((await api('GET', '/projects')).status, 401);
  assert.equal((await api('GET', '/terrains', { token: architect.token })).status, 403);
  assert.equal((await api('POST', '/projects', {
    token: constructor.token,
    body: {},
  })).status, 403);

  const architectMe = await api('GET', '/auth/me', { token: architect.token });
  const constructorMe = await api('GET', '/auth/me', { token: constructor.token });
  assert.equal(architectMe.payload.user.rol, 'arquitecto');
  assert.equal(constructorMe.payload.user.rol, 'constructora');

  const terrainOwner = await api('POST', '/terrains', {
    token: owner.token,
    body: { ubicacion: `Owner terrain ${runId}`, ancho: 12, largo: 20 },
  });
  const terrainOther = await api('POST', '/terrains', {
    token: other.token,
    body: { ubicacion: `Other terrain ${runId}`, ancho: 10, largo: 18 },
  });
  assert.equal(terrainOwner.status, 201, JSON.stringify(terrainOwner.payload));
  assert.equal(terrainOther.status, 201);

  const validProject = {
    nombre: `HU04 complete project ${runId}`,
    terrain_id: terrainOwner.payload.terrain.id,
    presupuesto: 350000,
    habitaciones: 3,
    banos: 2,
    ownerId: other.user.id,
    user_id: other.user.id,
  };

  for (const invalid of [
    { ...validProject, presupuesto: 0 },
    { ...validProject, presupuesto: undefined },
    { ...validProject, habitaciones: 0 },
    { ...validProject, habitaciones: 2.5 },
    { ...validProject, habitaciones: 7 },
    { ...validProject, banos: 0 },
    { ...validProject, banos: 0.5 },
    { ...validProject, banos: 1.5 },
    { ...validProject, banos: 2.25 },
    { ...validProject, banos: 4.5 },
    { ...validProject, banos: 7 },
  ]) {
    const response = await api('POST', '/projects', { token: owner.token, body: invalid });
    assert.equal(response.status, 400);
  }

  const wrongTerrain = await api('POST', '/projects', {
    token: owner.token,
    body: { ...validProject, terrain_id: terrainOther.payload.terrain.id },
  });
  assert.equal(wrongTerrain.status, 403);

  const created = await api('POST', '/projects', { token: owner.token, body: validProject });
  assert.equal(created.status, 201);
  assert.equal(created.payload.project.habitaciones, 3);
  assert.equal(created.payload.project.banos, 2);
  assert.equal(created.payload.project.estado, 'Borrador');
  assert.equal(created.payload.project.user_id, owner.user.id);
  assert.equal((await api('GET', `/projects/${created.payload.project.id}`, {
    token: owner.token,
  })).status, 200);
  const emptyProposals = await api('GET', `/projects/${created.payload.project.id}/proposals`, {
    token: owner.token,
  });
  assert.equal(emptyProposals.status, 200);
  assert.equal(emptyProposals.payload.requiresGeneration, true);
  assert.deepEqual(emptyProposals.payload.proposals, []);

  const saved = await database.getDb().collection('projects').findOne({
    _id: new ObjectId(created.payload.project.id),
  });
  assert.equal(saved.ownerId.toHexString(), owner.user.id);
  assert.equal(saved.terrainId.toHexString(), terrainOwner.payload.terrain.id);
  assert.equal(saved.habitaciones, 3);
  assert.equal(saved.banos, 2);
  assert.equal(saved.estado, 'Borrador');

  assert.equal((await api('POST', `/projects/${created.payload.project.id}/analyze`, {
    token: owner.token,
  })).status, 200);

  const updated = await api('PATCH', `/projects/${created.payload.project.id}`, {
    token: owner.token,
    body: {
      ...validProject,
      nombre: `Updated project ${runId}`,
      presupuesto: 410000,
      habitaciones: 4,
      banos: 2,
    },
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.payload));
  assert.equal(updated.payload.project.nombre, `Updated project ${runId}`);
  assert.equal(updated.payload.project.presupuesto, 410000);
  assert.equal(updated.payload.project.habitaciones, 4);
  assert.equal(updated.payload.project.banos, 2);
  const updatedDocument = await database.getDb().collection('projects').findOne({
    _id: new ObjectId(created.payload.project.id),
  });
  assert.equal(updatedDocument.banos, 2);
  assert.equal(updatedDocument.habitaciones, 4);
  assert.equal((await api('GET', `/projects/${created.payload.project.id}/analysis`, {
    token: owner.token,
  })).status, 404);
  assert.equal((await api('PATCH', `/projects/${created.payload.project.id}`, {
    token: owner.token,
    body: { ...validProject, banos: 1.25 },
  })).status, 400);

  const ownerGet = await api('GET', `/projects/${created.payload.project.id}`, { token: owner.token });
  const otherGet = await api('GET', `/projects/${created.payload.project.id}`, { token: other.token });
  assert.equal(ownerGet.status, 200);
  assert.equal(ownerGet.payload.project.banos, 2);
  assert.equal(otherGet.status, 404);
  const listedProjects = await api('GET', '/projects', { token: owner.token });
  assert.equal(listedProjects.payload.projects.find(
    (project) => project.id === created.payload.project.id,
  ).banos, 2);
  assert.equal((await api('PATCH', `/projects/${created.payload.project.id}`, {
    token: other.token,
    body: validProject,
  })).status, 404);

  const emptyDraft = await api('POST', '/projects', { token: owner.token, body: validProject });
  assert.equal(emptyDraft.status, 201);
  const deleted = await api('DELETE', `/projects/${emptyDraft.payload.project.id}`, {
    token: owner.token,
  });
  assert.equal(deleted.status, 200, JSON.stringify(deleted.payload));
  assert.equal((await api('GET', `/projects/${emptyDraft.payload.project.id}`, {
    token: owner.token,
  })).status, 404);

  const activityProject = await api('POST', '/projects', {
    token: owner.token,
    body: { ...validProject, nombre: `Review activity ${runId}` },
  });
  assert.equal(activityProject.status, 201);
  const activityProjectId = new ObjectId(activityProject.payload.project.id);
  await database.getDb().collection('reviewRequests').insertOne({
    projectId: activityProjectId,
    ownerId: new ObjectId(owner.user.id),
    active: false,
    status: 'completed',
    createdAt: new Date(),
  });
  const blockedDelete = await api('DELETE', `/projects/${activityProjectId}`, {
    token: owner.token,
  });
  assert.equal(blockedDelete.status, 409);
  const archived = await api('PATCH', `/projects/${activityProjectId}/archive`, {
    token: owner.token,
  });
  assert.equal(archived.status, 200, JSON.stringify(archived.payload));
  assert.equal(archived.payload.project.estado, 'Archivado');
  const archivedDocument = await database.getDb().collection('projects').findOne({
    _id: activityProjectId,
  });
  assert.equal(archivedDocument.estado, 'Archivado');

  const selectedProject = await api('POST', '/projects', {
    token: owner.token,
    body: { ...validProject, nombre: `Selected activity ${runId}` },
  });
  const selectedId = new ObjectId(selectedProject.payload.project.id);
  await database.getDb().collection('projects').updateOne(
    { _id: selectedId },
    { $set: { selectedProposalId: new ObjectId() } },
  );
  assert.equal((await api('DELETE', `/projects/${selectedId}`, {
    token: owner.token,
  })).status, 409);

  const quoteProject = await api('POST', '/projects', {
    token: owner.token,
    body: { ...validProject, nombre: `Quote activity ${runId}` },
  });
  const quoteProjectId = new ObjectId(quoteProject.payload.project.id);
  await database.getDb().collection('quoteRequests').insertOne({
    projectId: quoteProjectId,
    ownerId: new ObjectId(owner.user.id),
    active: false,
    status: 'responded',
    createdAt: new Date(),
  });
  assert.equal((await api('DELETE', `/projects/${quoteProjectId}`, {
    token: owner.token,
  })).status, 409);
  assert.equal((await api('PATCH', `/projects/${quoteProjectId}/archive`, {
    token: owner.token,
  })).payload.project.estado, 'Archivado');

  const legacyId = new ObjectId();
  await database.getDb().collection('projects').insertOne({
    _id: legacyId,
    ownerId: new ObjectId(owner.user.id),
    terrainId: new ObjectId(terrainOwner.payload.terrain.id),
    nombre: `Legacy project ${runId}`,
    presupuesto: 100000,
    habitaciones: 2,
    banos: 2.5,
    estado: 'Borrador',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const legacyGet = await api('GET', `/projects/${legacyId.toHexString()}`, { token: owner.token });
  assert.equal(legacyGet.status, 200);
  assert.equal(legacyGet.payload.project.habitaciones, 2);
  assert.equal(legacyGet.payload.project.banos, 2.5);

  assert.equal((await api('GET', '/projects/not-an-object-id', { token: owner.token })).status, 400);

  const activeTerrainDelete = await api('DELETE', `/terrains/${terrainOwner.payload.terrain.id}`, {
    token: owner.token,
  });
  assert.equal(activeTerrainDelete.status, 409);
  assert.match(activeTerrainDelete.payload.error, /Updated project/);
  assert.equal((await api('DELETE', `/terrains/${terrainOwner.payload.terrain.id}`, {
    token: other.token,
  })).status, 404);

  const unusedTerrain = await api('POST', '/terrains', {
    token: owner.token,
    body: { ubicacion: `Unused terrain ${runId}`, ancho: 10, largo: 12 },
  });
  assert.equal(unusedTerrain.status, 201);
  assert.equal((await api('DELETE', `/terrains/${unusedTerrain.payload.terrain.id}`, {
    token: other.token,
  })).status, 404);
  assert.equal((await api('DELETE', `/terrains/${unusedTerrain.payload.terrain.id}`, {
    token: owner.token,
  })).status, 200);
  assert.equal((await api('GET', `/terrains/${unusedTerrain.payload.terrain.id}`, {
    token: owner.token,
  })).status, 404);
});