const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { stripeReturnUrls } = require('../Nucleo/stripe-return-routes');

const runId = `${process.pid}_${Date.now()}`;
const testDatabase = `vimod_stage5_stripe_test_${runId}`;
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27021';
process.env.MONGODB_DATABASE = testDatabase;
process.env.JWT_SECRET = `stage5-stripe-test-${runId}`;
process.env.CLIENT_ORIGIN = 'http://localhost:5500';
process.env.ROLE_ASSIGNMENTS = '';
process.env.PAYMENT_PROVIDER = '';
process.env.STRIPE_SECRET_KEY = '';

const database = require('../Paquetes/Persistencia/AccesoDatos/database');
const StripePaymentService = require('../Paquetes/Aplicacion/PedidosPagos/stripe-payment-service');
const { WorkflowService } = require('../Paquetes/Aplicacion/PedidosPagos');
const PaymentRepository = require('../Paquetes/Persistencia/Repositorios/payment-repository');
const app = require('../src/app');
let server;
let connected = false;
let baseUrl;

function makeClient() {
  const sessions = new Map();
  const created = [];
  return {
    sessions,
    created,
    checkout: {
      sessions: {
        create: async (parameters) => {
          created.push(parameters);
          const id = `cs_test_${created.length}_${runId}`;
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
        expire: async (id) => {
          const session = sessions.get(id);
          session.status = 'expired';
          return session;
        },
      },
    },
  };
}

function makeStripeService({
  client,
  key = 'sk_test_mock',
  repository,
  frontendUrl = 'http://localhost:5500/HTML',
} = {}) {
  return new StripePaymentService({
    client,
    repository: repository || new PaymentRepository(),
    config: {
      provider: 'stripe',
      secretKey: key,
      copPerUsd: 4000,
      frontendUrl,
      stripeReturnUrls,
    },
  });
}

async function api(method, path, { token, body, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (token) requestHeaders.authorization = `Bearer ${token}`;
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, payload: await response.json() };
}

async function seedOrder(label, ownerId, { offer = false } = {}) {
  const db = database.getDb();
  const projectId = new ObjectId();
  const proposalId = offer ? null : new ObjectId();
  const terrainId = new ObjectId();
  const orderId = new ObjectId();
  const offerId = offer ? new ObjectId() : null;
  const now = new Date();
  await db.collection('projects').insertOne({
    _id: projectId,
    ownerId,
    terrainId,
    nombre: `${label} project`,
    presupuesto: 300000000,
    createdAt: now,
  });
  if (proposalId) {
    await db.collection('proposals').insertOne({
      _id: proposalId,
      ownerId,
      projectId,
      name: `${label} proposal`,
      estimate: { costCop: 300000000, currency: 'COP' },
      createdAt: now,
    });
  }
  await db.collection('orders').insertOne({
    _id: orderId,
    ownerId,
    projectId,
    proposalId,
    offerId,
    amount: 300000000,
    currency: 'COP',
    idempotencyKey: `${label}-${runId}`,
    orderStatus: 'awaiting_payment',
    paymentStatus: 'created',
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  return { projectId, proposalId, orderId };
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

test('Stripe Checkout usa montos del servidor, confirma pagos de forma segura y permite fallback simulado', async () => {
  await database.connect();
  connected = true;
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const ownerId = new ObjectId();
  const otherOwnerId = new ObjectId();
  const ownerToken = jwt.sign({ sub: ownerId.toHexString() }, process.env.JWT_SECRET);
  await database.getDb().collection('users').insertOne({
    _id: ownerId,
    nombre: 'Stripe mock customer',
    correo: `stripe-mock-${runId}@example.invalid`,
    rol: 'cliente',
    requestedRole: 'cliente',
    accountType: 'cliente',
    accountStatus: 'activo',
    createdAt: new Date(),
  });
  await database.getDb().collection('users').insertOne({
    _id: otherOwnerId,
    nombre: 'Other Stripe customer',
    correo: `stripe-other-${runId}@example.invalid`,
    rol: 'cliente',
    requestedRole: 'cliente',
    accountType: 'cliente',
    accountStatus: 'activo',
    createdAt: new Date(),
  });
  const otherOrder = await seedOrder('Other owner', otherOwnerId);
  const paidOrder = await seedOrder('Paid order', ownerId);
  const stripeClient = makeClient();
  const service = makeStripeService({ client: stripeClient });
  assert.throws(() => service.convertAmount(1), (error) => error.status === 400);
  assert.throws(() => service.convertAmount(4000000000), (error) => error.status === 400);

  const checkout = await service.createCheckoutSession(ownerId.toHexString(), paidOrder.orderId.toHexString());
  assert.equal(checkout.amountCop, 300000000);
  assert.equal(checkout.amountUsdCents, 7500000);
  assert.equal(checkout.copPerUsd, 4000);
  assert.equal(checkout.url, stripeClient.sessions.get(checkout.url.split('/').pop()).url);
  assert.equal(stripeClient.created[0].mode, 'payment');
  assert.equal(stripeClient.created[0].line_items[0].price_data.currency, 'usd');
  assert.equal(stripeClient.created[0].line_items[0].price_data.unit_amount, 7500000);
  assert.equal(stripeClient.created[0].line_items[0].price_data.product_data.name, 'Paid order proposal');
  assert.equal(stripeClient.created[0].metadata.orderId, paidOrder.orderId.toHexString());
  assert.equal(stripeClient.created[0].metadata.userId, ownerId.toHexString());
  assert.equal(
    stripeClient.created[0].success_url,
    `http://localhost:5500/Backend/Paquetes/Presentacion/PortalCliente/Vistas/8.%20Detalles%20Propuestas.html?proyecto=${paidOrder.projectId}&propuesta=${paidOrder.proposalId}&pago=exito&session_id={CHECKOUT_SESSION_ID}`,
  );
  assert.equal(
    stripeClient.created[0].cancel_url,
    `http://localhost:5500/Backend/Paquetes/Presentacion/PortalCliente/Vistas/8.%20Detalles%20Propuestas.html?proyecto=${paidOrder.projectId}&propuesta=${paidOrder.proposalId}&pago=cancelado&orden_id=${paidOrder.orderId}`,
  );
  await assert.rejects(
    service.createCheckoutSession(ownerId.toHexString(), otherOrder.orderId.toHexString()),
    (error) => error.status === 404,
  );
  assert.equal(stripeClient.created.length, 1);
  assert.equal((await api('POST', '/payments/stripe/confirm', {
    body: { sessionId: 'cs_test_unauthorized' },
  })).status, 401);

  const sessionId = [...stripeClient.sessions.keys()][0];
  const paidSession = stripeClient.sessions.get(sessionId);
  paidSession.metadata.paymentId = new ObjectId().toHexString();
  await assert.rejects(
    service.confirmSession(ownerId.toHexString(), sessionId),
    (error) => error.status === 403,
  );
  paidSession.metadata.paymentId = stripeClient.created[0].metadata.paymentId;
  paidSession.status = 'complete';
  paidSession.payment_status = 'paid';
  const confirmed = await service.confirmSession(ownerId.toHexString(), sessionId);
  assert.equal(confirmed.status, 'approved');
  assert.equal(confirmed.orderStatus, 'paid');
  assert.equal((await service.confirmSession(ownerId.toHexString(), sessionId)).status, 'approved');
  const paidStoredOrder = await database.getDb().collection('orders').findOne({ _id: paidOrder.orderId });
  const paidStoredPayment = await database.getDb().collection('payments').findOne({ orderId: paidOrder.orderId });
  assert.equal(paidStoredOrder.orderStatus, 'paid');
  assert.equal(paidStoredOrder.paymentStatus, 'approved');
  assert.equal(paidStoredPayment.status, 'approved');
  assert.equal(paidStoredPayment.amountUsdCents, 7500000);
  const paymentHistory = await api('GET', '/payments', { token: ownerToken });
  assert.equal(paymentHistory.status, 200);
  assert.equal(paymentHistory.payload.payments.find((item) => item.id === paidStoredPayment._id.toHexString()).provider, 'stripe');
  assert.equal(paymentHistory.payload.payments.find((item) => item.id === paidStoredPayment._id.toHexString()).status, 'approved');
  const paidProject = await api('GET', `/projects/${paidOrder.projectId}`, { token: ownerToken });
  assert.equal(paidProject.status, 200, JSON.stringify(paidProject.payload));
  assert.equal(paidProject.payload.project.payment.paid, true);
  assert.equal(paidProject.payload.project.payment.proposalId, paidOrder.proposalId.toHexString());
  assert.equal(paidProject.payload.project.payment.orderId, paidOrder.orderId.toHexString());
  assert.equal(paidProject.payload.project.payment.provider, 'stripe');
  assert.equal((await api('POST', `/orders/${paidOrder.orderId}/payment-session`, {
    token: ownerToken,
  })).status, 409);
  const secondOrderResult = await api('POST', `/projects/${paidOrder.projectId}/orders`, {
    token: ownerToken,
    headers: { 'Idempotency-Key': `stripe-second-order-${runId}` },
  });
  assert.equal(secondOrderResult.status, 409, JSON.stringify(secondOrderResult.payload));
  const otherOwnerToken = jwt.sign({ sub: otherOwnerId.toHexString() }, process.env.JWT_SECRET);
  assert.equal((await api('GET', `/projects/${paidOrder.projectId}`, { token: otherOwnerToken })).status, 404);
  assert.equal((await api('POST', `/orders/${paidOrder.orderId}/payment-session`, {
    token: otherOwnerToken,
  })).status, 404);

  const offerOrder = await seedOrder('Offer order', ownerId, { offer: true });
  const offerService = makeStripeService({
    client: stripeClient,
    frontendUrl: 'http://localhost:5500/',
  });
  const offerCheckout = await offerService.createCheckoutSession(
    ownerId.toHexString(),
    offerOrder.orderId.toHexString(),
  );
  assert.ok(offerCheckout.url);
  assert.equal(
    stripeClient.created[1].success_url,
    `http://localhost:5500/Backend/Paquetes/Presentacion/PortalCliente/Vistas/7.%20Propuestas%20Generadas.html?proyecto=${offerOrder.projectId}&pago=exito&session_id={CHECKOUT_SESSION_ID}`,
  );
  assert.equal(
    stripeClient.created[1].cancel_url,
    `http://localhost:5500/Backend/Paquetes/Presentacion/PortalCliente/Vistas/7.%20Propuestas%20Generadas.html?proyecto=${offerOrder.projectId}&pago=cancelado&orden_id=${offerOrder.orderId}`,
  );

  const cancelledOrder = await seedOrder('Cancelled order', ownerId);
  const cancelledCheckout = await service.createCheckoutSession(ownerId.toHexString(), cancelledOrder.orderId.toHexString());
  const cancelledResult = await service.cancelSession(ownerId.toHexString(), cancelledOrder.orderId.toHexString());
  assert.equal(cancelledResult.status, 'cancelled');
  assert.equal(stripeClient.sessions.get(cancelledCheckout.url.split('/').pop()).status, 'expired');
  const cancelledStoredOrder = await database.getDb().collection('orders').findOne({ _id: cancelledOrder.orderId });
  const cancelledStoredPayment = await database.getDb().collection('payments').findOne({ orderId: cancelledOrder.orderId });
  assert.equal(cancelledStoredOrder.orderStatus, 'payment_cancelled');
  assert.equal(cancelledStoredPayment.status, 'cancelled');
  assert.ok(cancelledCheckout.url);

  const expiredOrder = await seedOrder('Expired order', ownerId);
  const expiredCheckout = await service.createCheckoutSession(ownerId.toHexString(), expiredOrder.orderId.toHexString());
  const expiredSessionId = expiredCheckout.url.split('/').pop();
  const expiredSession = stripeClient.sessions.get(expiredSessionId);
  expiredSession.status = 'expired';
  const expiredResult = await service.confirmSession(ownerId.toHexString(), expiredSessionId);
  assert.equal(expiredResult.status, 'expired');
  const expiredStoredOrder = await database.getDb().collection('orders').findOne({ _id: expiredOrder.orderId });
  assert.equal(expiredStoredOrder.orderStatus, 'payment_expired');
  assert.notEqual(expiredStoredOrder.orderStatus, 'paid');

  const wrongAmountOrder = await seedOrder('Wrong amount', ownerId);
  const wrongAmountCheckout = await service.createCheckoutSession(ownerId.toHexString(), wrongAmountOrder.orderId.toHexString());
  const wrongAmountSession = stripeClient.sessions.get(wrongAmountCheckout.url.split('/').pop());
  wrongAmountSession.payment_status = 'paid';
  wrongAmountSession.status = 'complete';
  wrongAmountSession.amount_total += 1;
  await assert.rejects(
    service.confirmSession(ownerId.toHexString(), wrongAmountSession.id),
    (error) => error.status === 403,
  );
  const wrongAmountStoredOrder = await database.getDb().collection('orders').findOne({ _id: wrongAmountOrder.orderId });
  assert.notEqual(wrongAmountStoredOrder.orderStatus, 'paid');

  const liveService = makeStripeService({ client: makeClient(), key: 'sk_live_never_use' });
  await assert.rejects(
    liveService.createCheckoutSession(ownerId.toHexString(), expiredOrder.orderId.toHexString()),
    (error) => error.status === 503 && /sk_test_/.test(error.message),
  );

  const fallbackOrder = await seedOrder('Fallback order', ownerId);
  const missingKeyService = makeStripeService({ client: makeClient(), key: '' });
  const workflow = new WorkflowService(undefined, missingKeyService);
  const simulatedSession = await workflow.createPaymentSession(
    ownerId.toHexString(),
    fallbackOrder.orderId.toHexString(),
  );
  assert.equal(simulatedSession.provider, 'internal_simulation');
  const fallbackPayment = await database.getDb().collection('payments').findOne({ orderId: fallbackOrder.orderId });
  assert.equal(fallbackPayment.provider, 'internal_simulation');
});
