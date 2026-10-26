const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const runId = `${process.pid}_${Date.now()}`;
const testDatabase = `vimod_stage4_offers_test_${runId}`;
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27021';
process.env.MONGODB_DATABASE = testDatabase;
process.env.JWT_SECRET = `stage4-offers-test-${runId}`;
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
  return {
    status: response.status,
    payload: response.status === 204 ? null : await response.json(),
  };
}

async function addUser(name, { role = 'cliente', status = 'activo' } = {}) {
  const id = new ObjectId();
  await database.getDb().collection('users').insertOne({
    _id: id,
    nombre: name,
    correo: `${id.toHexString()}@example.invalid`,
    rol: role === 'cliente' ? 'cliente' : 'cliente',
    requestedRole: role,
    accountType: role,
    accountStatus: status,
    createdAt: new Date(),
  });
  return { id, token: tokenFor(id) };
}

async function createProject(ownerToken) {
  const terrain = await api('POST', '/terrains', {
    token: ownerToken,
    body: { ubicacion: `Offers test terrain ${runId}`, ancho: 12, largo: 20 },
  });
  assert.equal(terrain.status, 201, JSON.stringify(terrain.payload));
  const project = await api('POST', '/projects', {
    token: ownerToken,
    body: {
      nombre: `Offers test project ${runId}`,
      terrain_id: terrain.payload.terrain.id,
      presupuesto: 300000000,
      habitaciones: 4,
      banos: 3,
    },
  });
  assert.equal(project.status, 201, JSON.stringify(project.payload));
  return project.payload.project;
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

test('ofertas requieren constructoras aprobadas, aíslan clientes y crean órdenes con el precio guardado', async () => {
  await database.connect();
  connected = true;
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const owner = await addUser(`Cliente oferta ${runId}`);
  const otherClient = await addUser(`Otro cliente oferta ${runId}`);
  const approvedContractor = await addUser(`Constructora aprobada ${runId}`, {
    role: 'constructora',
    status: 'aprobado',
  });
  const competingContractor = await addUser(`Constructora competidora ${runId}`, {
    role: 'constructora',
    status: 'aprobado',
  });
  const pendingContractor = await addUser(`Constructora pendiente ${runId}`, {
    role: 'constructora',
    status: 'pendiente',
  });
  const project = await createProject(owner.token);

  assert.equal((await api('GET', '/contractor/offer-projects')).status, 401);
  assert.equal((await api('GET', '/contractor/offer-projects', {
    token: owner.token,
  })).status, 403);
  assert.equal((await api('GET', '/contractor/offer-projects', {
    token: pendingContractor.token,
  })).status, 403);
  assert.equal((await api('POST', `/contractor/offers/${project.id}`, {
    token: pendingContractor.token,
    body: { precio: 225000000, plazoDias: 180 },
  })).status, 403);

  const opportunities = await api('GET', '/contractor/offer-projects', {
    token: approvedContractor.token,
  });
  assert.equal(opportunities.status, 200, JSON.stringify(opportunities.payload));
  const opportunity = opportunities.payload.projects.find((item) => item.id === project.id);
  assert.ok(opportunity);
  assert.equal(Object.hasOwn(opportunity, 'ownerId'), false);

  const offerResult = await api('POST', `/contractor/offers/${project.id}`, {
    token: approvedContractor.token,
    body: {
      precio: 225000000,
      plazoDias: 180,
      inclusiones: ['Estructura', 'Instalaciones'],
    },
  });
  assert.equal(offerResult.status, 201, JSON.stringify(offerResult.payload));
  assert.equal(offerResult.payload.offer.estado, 'enviada');
  const duplicateOffer = await api('POST', `/contractor/offers/${project.id}`, {
    token: approvedContractor.token,
    body: { precio: 230000000, plazoDias: 190 },
  });
  assert.equal(duplicateOffer.status, 409);
  const competingOffer = await api('POST', `/contractor/offers/${project.id}`, {
    token: competingContractor.token,
    body: { precio: 230000000, plazoDias: 190 },
  });
  assert.equal(competingOffer.status, 201, JSON.stringify(competingOffer.payload));

  assert.equal((await api('GET', `/projects/${project.id}/offers`, {
    token: otherClient.token,
  })).status, 404);
  const clientOffers = await api('GET', `/projects/${project.id}/offers`, {
    token: owner.token,
  });
  assert.equal(clientOffers.status, 200, JSON.stringify(clientOffers.payload));
  assert.equal(clientOffers.payload.offers.length, 2);
  assert.ok(clientOffers.payload.offers.some((offer) =>
    offer.contractorName === `Constructora aprobada ${runId}`));

  const accepted = await api('POST', `/projects/${project.id}/offers/${offerResult.payload.offer.id}/accept`, {
    token: owner.token,
    body: {},
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.payload));
  assert.equal((await api('POST', `/projects/${project.id}/offers/${competingOffer.payload.offer.id}/accept`, {
    token: owner.token,
    body: {},
  })).status, 200);
  const order = await api('POST', `/projects/${project.id}/orders`, {
    token: owner.token,
    headers: { 'Idempotency-Key': `offer-order-${runId}` },
    body: { offerId: offerResult.payload.offer.id, amount: 1 },
  });
  assert.equal(order.status, 201, JSON.stringify(order.payload));
  assert.equal(order.payload.order.amount, 225000000);
  assert.equal(order.payload.order.amountSource, 'contractor_offer');
  assert.equal(order.payload.order.currency, 'COP');
  const reusedOrder = await api('POST', `/projects/${project.id}/orders`, {
    token: owner.token,
    headers: { 'Idempotency-Key': `offer-order-reuse-${runId}` },
    body: { offerId: offerResult.payload.offer.id },
  });
  assert.equal(reusedOrder.status, 201, JSON.stringify(reusedOrder.payload));
  assert.equal(reusedOrder.payload.order.id, order.payload.order.id);
  const storedOffer = await database.getDb().collection('offers').findOne({
    _id: new ObjectId(offerResult.payload.offer.id),
  });
  assert.equal(storedOffer.status, 'aceptada');
  assert.equal(storedOffer.precio, order.payload.order.amount);

  const paymentSession = await api('POST', `/orders/${order.payload.order.id}/payment-session`, {
    token: owner.token,
  });
  assert.equal(paymentSession.status, 200, JSON.stringify(paymentSession.payload));
  assert.equal(paymentSession.payload.session.simulated, true);
  assert.equal(paymentSession.payload.session.amount, 225000000);
  const approvedPayment = await api('POST', `/payments/${paymentSession.payload.session.paymentId}/resolve`, {
    token: owner.token,
    body: { method: 'test_card', result: 'approved' },
  });
  assert.equal(approvedPayment.status, 200, JSON.stringify(approvedPayment.payload));
  assert.equal(approvedPayment.payload.orderStatus, 'paid');
  const contractedProject = await api('GET', `/projects/${project.id}`, { token: owner.token });
  assert.equal(contractedProject.payload.project.payment.paid, true);
  assert.equal(contractedProject.payload.project.payment.offerId, offerResult.payload.offer.id);
  assert.equal(contractedProject.payload.project.payment.contractorId, approvedContractor.id.toHexString());
  assert.equal(contractedProject.payload.project.payment.amount, 225000000);
  assert.equal(contractedProject.payload.project.payment.provider, 'internal_simulation');
  assert.ok(contractedProject.payload.project.payment.paidAt);
  assert.equal(contractedProject.payload.project.contractedOrderId, order.payload.order.id);
  assert.equal(contractedProject.payload.project.contractedContractorId, approvedContractor.id.toHexString());
  const paidOffer = await database.getDb().collection('offers').findOne({
    _id: new ObjectId(offerResult.payload.offer.id),
  });
  const competitorStoredOffer = await database.getDb().collection('offers').findOne({
    _id: new ObjectId(competingOffer.payload.offer.id),
  });
  assert.equal(paidOffer.status, 'aceptada');
  assert.equal(paidOffer.active, false);
  assert.equal(competitorStoredOffer.status, 'rechazada');
  assert.equal(competitorStoredOffer.active, false);
  assert.equal((await api('POST', `/projects/${project.id}/offers/${competingOffer.payload.offer.id}/accept`, {
    token: owner.token,
    body: {},
  })).status, 409);
  assert.equal((await api('POST', `/projects/${project.id}/orders`, {
    token: owner.token,
    headers: { 'Idempotency-Key': `offer-after-paid-${runId}` },
    body: { offerId: competingOffer.payload.offer.id },
  })).status, 409);
  assert.equal((await api('POST', `/orders/${order.payload.order.id}/payment-session`, {
    token: owner.token,
  })).status, 409);
  const closedOpportunities = await api('GET', '/contractor/offer-projects', {
    token: competingContractor.token,
  });
  assert.equal(closedOpportunities.payload.projects.some((item) => item.id === project.id), false);
  const contractorProjects = await api('GET', '/contractor/offers', {
    token: approvedContractor.token,
  });
  assert.equal(contractorProjects.status, 200, JSON.stringify(contractorProjects.payload));
  assert.ok(Array.isArray(contractorProjects.payload.contractedProjects));
  assert.equal(contractorProjects.payload.contractedProjects.some((item) => item.id === project.id), true);

  const rejectedProject = await createProject(owner.token);
  const rejectedOffer = await api('POST', `/contractor/offers/${rejectedProject.id}`, {
    token: approvedContractor.token,
    body: { precio: 235000000, plazoDias: 195 },
  });
  assert.equal(rejectedOffer.status, 201, JSON.stringify(rejectedOffer.payload));
  assert.equal((await api('POST', `/projects/${rejectedProject.id}/offers/${rejectedOffer.payload.offer.id}/accept`, {
    token: owner.token,
    body: {},
  })).status, 200);
  const rejectedOrder = await api('POST', `/projects/${rejectedProject.id}/orders`, {
    token: owner.token,
    headers: { 'Idempotency-Key': `offer-rejected-${runId}` },
    body: { offerId: rejectedOffer.payload.offer.id },
  });
  assert.equal(rejectedOrder.status, 201, JSON.stringify(rejectedOrder.payload));
  assert.equal(rejectedOrder.payload.order.amount, 235000000);
  const rejectedSession = await api('POST', `/orders/${rejectedOrder.payload.order.id}/payment-session`, {
    token: owner.token,
  });
  assert.equal(rejectedSession.status, 200, JSON.stringify(rejectedSession.payload));
  const declinedPayment = await api('POST', `/payments/${rejectedSession.payload.session.paymentId}/resolve`, {
    token: owner.token,
    body: { method: 'test_card', result: 'declined' },
  });
  assert.equal(declinedPayment.status, 200, JSON.stringify(declinedPayment.payload));
  assert.equal(declinedPayment.payload.orderStatus, 'payment_failed');
});
