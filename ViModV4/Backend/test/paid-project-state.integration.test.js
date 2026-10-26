const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const runId = `${process.pid}_${Date.now()}`;
const testDatabase = `vimod_paid_project_state_test_${runId}`;
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27021';
process.env.MONGODB_DATABASE = testDatabase;
process.env.JWT_SECRET = `paid-project-state-test-${runId}`;
process.env.CLIENT_ORIGIN = 'http://localhost:5500';
process.env.ROLE_ASSIGNMENTS = '';
process.env.PAYMENT_PROVIDER = '';
process.env.STRIPE_SECRET_KEY = '';

const database = require('../Paquetes/Persistencia/AccesoDatos/database');
const PaymentRepository = require('../Paquetes/Persistencia/Repositorios/payment-repository');
const StripePaymentService = require('../Paquetes/Aplicacion/PedidosPagos/stripe-payment-service');
const { stripeReturnUrls } = require('../Nucleo/stripe-return-routes');
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

async function addClient(name) {
  const id = new ObjectId();
  await database.getDb().collection('users').insertOne({
    _id: id,
    nombre: name,
    correo: `${id.toHexString()}@example.invalid`,
    rol: 'cliente',
    requestedRole: 'cliente',
    accountType: 'cliente',
    accountStatus: 'activo',
    createdAt: new Date(),
  });
  return { id, token: tokenFor(id) };
}

async function addContractor(name) {
  const id = new ObjectId();
  await database.getDb().collection('users').insertOne({
    _id: id,
    nombre: name,
    correo: `${id.toHexString()}@example.invalid`,
    rol: 'cliente',
    requestedRole: 'constructora',
    accountType: 'constructora',
    accountStatus: 'aprobado',
    createdAt: new Date(),
  });
  return { id, token: tokenFor(id) };
}

async function seedProject(ownerId, name, contractorId = null) {
  const db = database.getDb();
  const projectId = new ObjectId();
  const proposalId = new ObjectId();
  const terrainId = new ObjectId();
  const fingerprint = `paid-project-${name}-${runId}`;
  await db.collection('projects').insertOne({
    _id: projectId,
    ownerId,
    terrainId,
    nombre: name,
    presupuesto: 300000000,
    habitaciones: 4,
    banos: 3,
    selectedProposalId: proposalId,
    estado: 'Borrador',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.collection('projectAnalyses').insertOne({
    projectId,
    ownerId,
    inputFingerprint: fingerprint,
    stale: false,
    createdAt: new Date(),
  });
  await db.collection('proposals').insertOne({
    _id: proposalId,
    ownerId,
    projectId,
    terrainId,
    inputFingerprint: fingerprint,
    code: 'A',
    name: `${name} - propuesta A`,
    estimate: { currency: 'COP', costCop: 90000000, areaM2: 70 },
    viable: true,
    stale: false,
    ...(contractorId ? { contractorId } : {}),
    createdAt: new Date(),
  });
  return { projectId, proposalId, terrainId };
}

function mockStripeClient() {
  const sessions = new Map();
  return {
    sessions,
    checkout: {
      sessions: {
        create: async (parameters) => {
          const id = `cs_test_paid_${sessions.size + 1}_${runId}`;
          const session = {
            id,
            url: `https://checkout.stripe.test/${id}`,
            status: 'open',
            payment_status: 'unpaid',
            currency: parameters.line_items[0].price_data.currency,
            amount_total: parameters.line_items[0].price_data.unit_amount,
            metadata: { ...parameters.metadata },
          };
          sessions.set(id, session);
          return session;
        },
        retrieve: async (id) => {
          const session = sessions.get(id);
          if (!session) throw new Error('Mock session missing');
          return session;
        },
      },
    },
  };
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

test('las compras consolidadas aíslan, derivan, reutilizan y bloquean el proyecto', async () => {
  await database.connect();
  connected = true;
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const owner = await addClient(`Paid project client ${runId}`);
  const otherClient = await addClient(`Other paid project client ${runId}`);
  const modelContractor = await addContractor(`Model contractor ${runId}`);
  const project = await seedProject(owner.id, `Stripe project ${runId}`, modelContractor.id);
  const unpaidProject = await api('GET', `/projects/${project.projectId}`, { token: owner.token });
  assert.equal(unpaidProject.payload.project.payment.paid, false);
  const unpaidProposals = await api('GET', `/projects/${project.projectId}/proposals`, { token: owner.token });
  assert.equal(unpaidProposals.payload.projectPayment.paid, false);
  const createOrder = (key) => api('POST', `/projects/${project.projectId}/orders`, {
    token: owner.token,
    headers: { 'Idempotency-Key': key },
  });
  const firstOrder = await createOrder(`paid-first-${runId}`);
  assert.equal(firstOrder.status, 201, JSON.stringify(firstOrder.payload));
  const reusedOrder = await createOrder(`paid-reuse-${runId}`);
  assert.equal(reusedOrder.status, 201, JSON.stringify(reusedOrder.payload));
  assert.equal(reusedOrder.payload.order.id, firstOrder.payload.order.id);

  const stripeClient = mockStripeClient();
  const stripe = new StripePaymentService({
    client: stripeClient,
    repository: new PaymentRepository(),
    config: {
      provider: 'stripe',
      secretKey: 'sk_test_mock',
      copPerUsd: 4000,
      frontendUrl: 'http://localhost:5500/HTML',
      stripeReturnUrls,
    },
  });
  const session = await stripe.createCheckoutSession(
    owner.id.toHexString(),
    firstOrder.payload.order.id,
  );
  const stripeSession = stripeClient.sessions.get(session.url.split('/').pop());
  stripeSession.status = 'complete';
  stripeSession.payment_status = 'paid';
  assert.equal((await stripe.confirmSession(owner.id.toHexString(), stripeSession.id)).status, 'approved');
  assert.equal((await stripe.confirmSession(owner.id.toHexString(), stripeSession.id)).status, 'approved');

  const projectResponse = await api('GET', `/projects/${project.projectId}`, { token: owner.token });
  assert.equal(projectResponse.status, 200, JSON.stringify(projectResponse.payload));
  assert.equal(projectResponse.payload.project.paid, true);
  assert.equal(projectResponse.payload.project.payment.proposalId, project.proposalId.toHexString());
  assert.equal(projectResponse.payload.project.payment.orderId, firstOrder.payload.order.id);
  assert.equal(projectResponse.payload.project.payment.amount, 90000000);
  assert.equal(projectResponse.payload.project.payment.provider, 'stripe');
  assert.equal(projectResponse.payload.project.contractedOrderId, firstOrder.payload.order.id);
  assert.ok(projectResponse.payload.project.contractedPaidAt);
  assert.equal(projectResponse.payload.project.estado, 'Contratado');
  const contractorProjects = await api('GET', '/contractor/offers', { token: modelContractor.token });
  assert.equal(contractorProjects.status, 200, JSON.stringify(contractorProjects.payload));
  assert.equal(contractorProjects.payload.contractedProjects.some((item) =>
    item.id === project.projectId.toHexString()), true);
  const proposals = await api('GET', `/projects/${project.projectId}/proposals`, { token: owner.token });
  assert.equal(proposals.payload.projectPayment.paid, true);
  assert.equal(proposals.payload.proposals[0].contracted, true);
  assert.equal((await api('POST', `/projects/${project.projectId}/select-proposal`, {
    token: owner.token,
    body: { proposalId: project.proposalId.toHexString() },
  })).status, 409);
  assert.equal((await createOrder(`paid-again-${runId}`)).status, 409);
  assert.equal((await api('POST', `/orders/${firstOrder.payload.order.id}/payment-session`, {
    token: owner.token,
  })).status, 409);
  assert.equal((await api('POST', `/orders/${firstOrder.payload.order.id}/payment-session`, {
    token: otherClient.token,
  })).status, 404);
  assert.equal((await api('GET', `/projects/${project.projectId}`, {
    token: otherClient.token,
  })).status, 404);
  assert.equal((await api('GET', '/orders', { token: otherClient.token })).payload.orders.length, 0);
  assert.equal((await api('GET', '/payments', { token: otherClient.token })).payload.payments.length, 0);

  const legacy = await seedProject(owner.id, `Legacy project ${runId}`);
  const db = database.getDb();
  const olderAt = new Date('2025-01-01T12:00:00Z');
  const newerAt = new Date('2025-02-01T12:00:00Z');
  const oldOrderId = new ObjectId();
  const newOrderId = new ObjectId();
  for (const [orderId, proposalId, amount, paidAt] of [
    [oldOrderId, legacy.proposalId, 70000000, olderAt],
    [newOrderId, legacy.proposalId, 80000000, newerAt],
  ]) {
    await db.collection('orders').insertOne({
      _id: orderId,
      ownerId: owner.id,
      projectId: legacy.projectId,
      proposalId,
      idempotencyKey: `legacy-${orderId.toHexString()}`,
      amount,
      currency: 'COP',
      orderStatus: 'awaiting_payment',
      paymentStatus: 'created',
      active: false,
      createdAt: paidAt,
      updatedAt: paidAt,
    });
    await db.collection('payments').insertOne({
      _id: new ObjectId(),
      ownerId: owner.id,
      orderId,
      status: 'approved',
      provider: 'internal_simulation',
      updatedAt: paidAt,
    });
  }
  const legacyResponse = await api('GET', `/projects/${legacy.projectId}`, { token: owner.token });
  assert.equal(legacyResponse.payload.project.payment.orderId, newOrderId.toHexString());
  assert.equal(legacyResponse.payload.project.payment.amount, 80000000);
  const rawLegacyProject = await db.collection('projects').findOne({ _id: legacy.projectId });
  assert.equal(Object.hasOwn(rawLegacyProject, 'contractedOrderId'), false);
});
