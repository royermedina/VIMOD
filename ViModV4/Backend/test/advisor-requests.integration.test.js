const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const runId = `${process.pid}_${Date.now()}`;
const testDatabase = `vimod_stage1_advisor_test_${runId}`;
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27021';
process.env.MONGODB_DATABASE = testDatabase;
process.env.JWT_SECRET = `stage1-advisor-test-only-${runId}`;
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

async function addUser(name, role) {
  const result = await database.getDb().collection('users').insertOne({
    nombre: name,
    correo: `${new ObjectId().toHexString()}@example.invalid`,
    rol: role,
    requestedRole: role,
    accountType: role,
    accountStatus: 'active',
    createdAt: new Date(),
  });
  return { id: result.insertedId, token: tokenFor(result.insertedId) };
}

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

test('advisor requests persist, prevent active duplicates and are manageable by admins', async () => {
  await database.connect();
  connected = true;
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const client = await addUser('Cliente asesoría', 'cliente');
  const admin = await addUser('Administrador asesoría', 'admin');
  const projectId = new ObjectId();
  await database.getDb().collection('projects').insertOne({
    _id: projectId,
    ownerId: client.id,
    nombre: 'Casa modular de prueba',
    estado: 'Borrador',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const invalid = await api('POST', '/advisor-requests', {
    token: client.token,
    body: { topic: 'Ayuda', message: 'corto' },
  });
  assert.equal(invalid.status, 400);

  const created = await api('POST', '/advisor-requests', {
    token: client.token,
    body: {
      projectId: projectId.toHexString(),
      topic: 'Comparar constructoras',
      message: 'Necesito orientación para comparar cobertura y transporte.',
      contactMethod: 'email',
      contact: 'cliente@example.invalid',
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal(created.payload.request.status, 'pending');
  assert.equal(created.payload.request.projectName, 'Casa modular de prueba');

  const duplicate = await api('POST', '/advisor-requests', {
    token: client.token,
    body: {
      projectId: projectId.toHexString(),
      topic: 'Otra consulta',
      message: 'Esta solicitud activa no debería duplicarse.',
    },
  });
  assert.equal(duplicate.status, 409);

  const listed = await api('GET', '/advisor-requests', { token: client.token });
  assert.equal(listed.status, 200);
  assert.equal(listed.payload.requests.length, 1);
  assert.equal((await api('GET', '/advisor-requests', { token: admin.token })).status, 403);

  const adminList = await api('GET', '/admin/advisor-requests', { token: admin.token });
  assert.equal(adminList.status, 200);
  assert.equal(adminList.payload.items.length, 1);
  assert.equal(adminList.payload.items[0].owner.nombre, 'Cliente asesoría');

  const updated = await api('PATCH', `/admin/advisor-requests/${created.payload.request.id}`, {
    token: admin.token,
    body: { status: 'attended', adminNote: 'Se revisó el alcance solicitado.' },
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.payload));

  const afterUpdate = await api('GET', '/advisor-requests', { token: client.token });
  assert.equal(afterUpdate.payload.requests[0].status, 'attended');
  assert.equal(afterUpdate.payload.requests[0].adminNote, 'Se revisó el alcance solicitado.');

  const simultaneous = await Promise.all([
    api('POST', '/advisor-requests', {
      token: client.token,
      body: { topic: 'Consulta general', message: 'Necesito orientación general para mi siguiente paso.' },
    }),
    api('POST', '/advisor-requests', {
      token: client.token,
      body: { topic: 'Consulta general duplicada', message: 'Esta solicitud compite con la anterior.' },
    }),
  ]);
  assert.deepEqual(simultaneous.map((result) => result.status).sort(), [201, 409]);
});
