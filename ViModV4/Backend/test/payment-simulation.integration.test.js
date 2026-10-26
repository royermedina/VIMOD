const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const runId = `${process.pid}_${Date.now()}`;
const testDatabase = `vimod_stage1_payment_simulation_test_${runId}`;
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27021';
process.env.MONGODB_DATABASE = testDatabase;
process.env.JWT_SECRET = `stage1-payment-simulation-${runId}`;
process.env.CLIENT_ORIGIN = 'http://localhost:5500';
process.env.ROLE_ASSIGNMENTS = '';
process.env.PAYMENT_PROVIDER = '';
process.env.STRIPE_SECRET_KEY = '';

const database = require('../Paquetes/Persistencia/AccesoDatos/database');
const app = require('../src/app');
let server;
let connected = false;
let baseUrl;

function tokenFor(id) {
  return jwt.sign({ sub: id.toHexString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function api(method, path, { body, token, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  if (token) requestHeaders.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, payload: response.status === 204 ? null : await response.json() };
}

async function addUser(name) {
  const result = await database.getDb().collection('users').insertOne({
    nombre: name,
    correo: `${new ObjectId().toHexString()}@example.invalid`,
    rol: 'cliente',
    requestedRole: 'cliente',
    accountType: 'cliente',
    accountStatus: 'activo',
    createdAt: new Date(),
  });
  return { id: result.insertedId, token: tokenFor(result.insertedId) };
}

async function addOffer(ownerId, label) {
  const terrainId = new ObjectId();
  const projectId = new ObjectId();
  const proposalId = new ObjectId();
  const now = new Date();
  const db = database.getDb();
  await db.collection('terrains').insertOne({ _id: terrainId, ownerId, ubicacion: `${label} terrain`, ancho: 12, largo: 20, area: 240, createdAt: now });
  await db.collection('projects').insertOne({
    _id: projectId, ownerId, terrainId, nombre: `${label} project`, presupuesto: 300000000,
    habitaciones: 2, banos: 2, estado: 'Borrador', selectedProposalId: proposalId, createdAt: now, updatedAt: now,
  });
  await db.collection('proposals').insertOne({
    _id: proposalId, ownerId, projectId, name: `${label} proposal`, stale: false,
    estimate: { currency: 'COP', costCop: 215000 }, createdAt: now, updatedAt: now,
  });
  return { projectId };
}

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (!connected) return;
  await database.close();
  const cleanupClient = new MongoClient(process.env.MONGODB_URI);
  await cleanupClient.connect();
  await cleanupClient.db(testDatabase).dropDatabase();
  await cleanupClient.close();
});

test('la pasarela simulada persiste intentos y sincroniza órdenes', async () => {
  await database.connect();
  connected = true;
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const client = await addUser('Cliente simulación');
  const otherClient = await addUser('Otro cliente simulación');
  const offer = await addOffer(client.id, 'approved');
  const order = await api('POST', `/projects/${offer.projectId}/orders`, {
    token: client.token,
    headers: { 'Idempotency-Key': `simulation-order-${runId}` },
    body: {},
  });
  assert.equal(order.status, 201, JSON.stringify(order.payload));
  assert.equal(order.payload.order.paymentStatus, 'created');

  assert.equal((await api('POST', '/orders/not-an-id/payment-session', { token: client.token })).status, 400);
  assert.equal((await api('POST', `/orders/${order.payload.order.id}/payment-session`, { token: otherClient.token })).status, 404);
  const session = await api('POST', `/orders/${order.payload.order.id}/payment-session`, { token: client.token });
  assert.equal(session.status, 200, JSON.stringify(session.payload));
  assert.equal(session.payload.session.simulated, true);
  assert.equal(session.payload.session.amount, 215000);
  assert.equal(session.payload.session.methods.length, 3);
  const repeatedSession = await api('POST', `/orders/${order.payload.order.id}/payment-session`, { token: client.token });
  assert.equal(repeatedSession.payload.session.reference, session.payload.session.reference);

  const paymentId = session.payload.session.paymentId;
  assert.equal((await api('GET', '/payments', { token: otherClient.token })).payload.payments.length, 0);
  assert.equal((await api('POST', `/payments/${paymentId}/resolve`, {
    token: otherClient.token,
    body: { method: 'test_card', result: 'approved' },
  })).status, 404);
  assert.equal((await api('POST', `/payments/${paymentId}/resolve`, {
    token: client.token,
    body: { method: 'unknown_method', result: 'approved' },
  })).status, 400);
  assert.equal((await api('POST', `/payments/${paymentId}/resolve`, {
    token: client.token,
    body: { amount: 1, method: 'test_card', result: 'approved' },
  })).status, 200);
  assert.equal((await api('POST', `/payments/${paymentId}/resolve`, {
    token: client.token,
    body: { method: 'test_card', result: 'approved' },
  })).status, 200);
  const storedOrder = await database.getDb().collection('orders').findOne({ _id: new ObjectId(order.payload.order.id) });
  const storedPayment = await database.getDb().collection('payments').findOne({ _id: new ObjectId(paymentId) });
  assert.equal(storedOrder.paymentStatus, 'approved');
  assert.equal(storedOrder.orderStatus, 'paid');
  assert.equal(storedPayment.amount, 215000);
  assert.equal(storedPayment.simulated, true);
  assert.equal(storedPayment.attempts.length, 1);
  assert.equal(storedPayment.attempts[0].status, 'approved');
  assert.equal((await api('POST', `/payments/${paymentId}/resolve`, {
    token: client.token,
    body: { method: 'test_card', result: 'declined' },
  })).status, 409);
  assert.equal((await api('GET', '/payments', { token: client.token })).payload.payments[0].attempts.length, 1);

  const declinedOffer = await addOffer(client.id, 'declined');
  const declinedOrder = await api('POST', `/projects/${declinedOffer.projectId}/orders`, {
    token: client.token,
    headers: { 'Idempotency-Key': `simulation-declined-${runId}` },
    body: {},
  });
  const declinedSession = await api('POST', `/orders/${declinedOrder.payload.order.id}/payment-session`, { token: client.token });
  const declined = await api('POST', `/payments/${declinedSession.payload.session.paymentId}/resolve`, {
    token: client.token,
    body: { method: 'simulated_transfer', result: 'declined', reason: 'Fondos insuficientes de prueba' },
  });
  assert.equal(declined.status, 200);
  assert.equal(declined.payload.payment.status, 'declined');
  const retry = await api('POST', `/orders/${declinedOrder.payload.order.id}/payment-session`, { token: client.token });
  assert.equal(retry.status, 200);
  assert.notEqual(retry.payload.session.reference, declinedSession.payload.session.reference);
  const cancelled = await api('POST', `/payments/${retry.payload.session.paymentId}/resolve`, {
    token: client.token,
    body: { method: 'test_balance', result: 'cancelled', reason: 'Cancelado en la pantalla de confirmación' },
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.payload.payment.status, 'cancelled');
  assert.equal(cancelled.payload.payment.attempts.length, 2);
  assert.equal(cancelled.payload.orderStatus, 'payment_cancelled');

  const pendingOffer = await addOffer(client.id, 'pending');
  const pendingOrder = await api('POST', `/projects/${pendingOffer.projectId}/orders`, {
    token: client.token,
    headers: { 'Idempotency-Key': `simulation-pending-${runId}` },
    body: {},
  });
  const pendingSession = await api('POST', `/orders/${pendingOrder.payload.order.id}/payment-session`, { token: client.token });
  const pending = await api('POST', `/payments/${pendingSession.payload.session.paymentId}/resolve`, {
    token: client.token,
    body: { method: 'test_balance', result: 'pending' },
  });
  assert.equal(pending.status, 200);
  assert.equal(pending.payload.payment.status, 'pending');
  const pendingApproved = await api('POST', `/payments/${pendingSession.payload.session.paymentId}/resolve`, {
    token: client.token,
    body: { method: 'test_card', result: 'approved' },
  });
  assert.equal(pendingApproved.status, 200);
  assert.equal(pendingApproved.payload.orderStatus, 'paid');
  assert.equal((await api('GET', '/orders', { token: client.token })).payload.orders.length, 3);
});
