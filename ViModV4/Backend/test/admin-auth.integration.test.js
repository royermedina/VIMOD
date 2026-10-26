const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

const runId = `${process.pid}_${Date.now()}`;
const testDatabase = `vimod_admin_auth_test_${runId}`;
const adminPassword = `ViMod-Admin-Test-${runId}!`;
const clientPassword = `ViMod-Client-Test-${runId}!`;

process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27021';
process.env.MONGODB_DATABASE = testDatabase;
process.env.JWT_SECRET = `admin-auth-test-${runId}`;
process.env.CLIENT_ORIGIN = 'http://localhost:5500';
process.env.ROLE_ASSIGNMENTS = '';
process.env.ADMIN_PASSWORD = adminPassword;

const database = require('../Paquetes/Persistencia/AccesoDatos/database');
const app = require('../src/app');
const env = require('../src/config/env');
const { AdminService } = require('../Paquetes/Aplicacion/Administracion');
const { resolveRole } = require('../Paquetes/Aplicacion/Autenticacion/role-assignments');
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
  const payload = response.status === 204 ? null : await response.json();
  return { status: response.status, payload };
}

async function login(identifier, password) {
  return api('POST', '/auth/login', {
    body: { usuario: identifier, password },
  });
}

before(async () => {
  await database.connect();
  connected = true;
  await database.getDb().collection('users').insertOne({
    nombre: env.adminUsername,
    correo: env.adminUsername.toLowerCase(),
    passwordHash: await bcrypt.hash('Previous-Admin-Password!', 4),
    rol: 'admin',
    requestedRole: 'admin',
    accountType: 'admin',
    accountStatus: 'active',
    createdAt: new Date(),
  });
  await new AdminService().provisionConfiguredAdmin();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
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

test('admin login accepts only the provisioned bcrypt password', async () => {
  const result = await login(env.adminUsername, adminPassword);
  assert.equal(result.status, 200);
  assert.equal(result.payload.user.rol, 'admin');
  assert.ok(result.payload.token);

  const storedAdmin = await database.getDb().collection('users').findOne({
    correo: env.adminUsername.toLowerCase(),
  });
  assert.equal(await bcrypt.compare(adminPassword, storedAdmin.passwordHash), true);

  const rejected = await login(env.adminUsername, `${adminPassword}-wrong`);
  assert.equal(rejected.status, 401);
});

test('effective admin role requires an active, authorized MongoDB account', async () => {
  const storedAdmin = await database.getDb().collection('users').findOne({
    correo: env.adminUsername.toLowerCase(),
  });
  assert.equal(resolveRole(storedAdmin), 'admin');
  assert.equal(resolveRole({ ...storedAdmin, accountStatus: 'disabled' }), 'cliente');
  assert.equal(resolveRole({ ...storedAdmin, accountStatus: 'pendiente' }), 'cliente');
  assert.equal(resolveRole({ ...storedAdmin, accountStatus: undefined }), 'cliente');

  const authenticated = await login(env.adminUsername, adminPassword);
  const currentUser = await api('GET', '/auth/me', { token: authenticated.payload.token });
  assert.equal(currentUser.status, 200);
  assert.equal(currentUser.payload.user.rol, 'admin');

  const publicRegistration = await api('POST', '/auth/register', {
    body: {
      nombre: 'Public Admin Attempt',
      correo: `public-admin-${runId}@example.invalid`,
      password: clientPassword,
      rol: 'admin',
    },
  });
  assert.equal(publicRegistration.status, 201);
  assert.equal(publicRegistration.payload.user.rol, 'cliente');
  assert.equal(publicRegistration.payload.user.requestedRole, 'cliente');
});

test('GET /api/admin/role-requests is mounted and requires the effective admin role', async () => {
  const unauthenticated = await api('GET', '/admin/role-requests');
  assert.equal(unauthenticated.status, 401);

  const admin = await login(env.adminUsername, adminPassword);
  const authorized = await api('GET', '/admin/role-requests', { token: admin.payload.token });
  assert.equal(authorized.status, 200);
  assert.ok(Array.isArray(authorized.payload.requests));

  const registration = await api('POST', '/auth/register', {
    body: {
      nombre: 'Regular client',
      correo: `regular-client-${runId}@example.invalid`,
      password: clientPassword,
      rol: 'cliente',
    },
  });
  assert.equal(registration.status, 201);
  const client = await login(`regular-client-${runId}@example.invalid`, clientPassword);
  assert.equal(client.status, 200);
  const forbidden = await api('GET', '/admin/role-requests', { token: client.payload.token });
  assert.equal(forbidden.status, 403);
});
