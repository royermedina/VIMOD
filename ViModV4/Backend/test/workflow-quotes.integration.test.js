const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const runId = `${process.pid}_${Date.now()}`;
const testDatabase = `vimod_stage4_quotes_test_${runId}`;
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27021';
process.env.MONGODB_DATABASE = testDatabase;
process.env.JWT_SECRET = `stage4-quotes-test-only-${runId}`;
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

async function addUser(name, role, accountStatus, contractorProfile) {
  const result = await database.getDb().collection('users').insertOne({
    nombre: name,
    correo: `${new ObjectId().toHexString()}@example.invalid`,
    rol: role,
    requestedRole: role,
    accountType: role,
    accountStatus,
    contractorProfile,
    createdAt: new Date(),
  });
  return { id: result.insertedId, token: tokenFor(result.insertedId) };
}

function quotation(items, validUntil) {
  return {
    items,
    estimatedDays: 30,
    validUntil,
    message: 'Alcance de la propuesta.',
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

test('quotes require a selected proposal, isolate contractors, total line items, expire, accept and reject', async () => {
  await database.connect();
  connected = true;
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const client = await addUser('Cliente de cotización', 'cliente', 'active');
  const contractorA = await addUser('Constructora A', 'constructora', 'aprobado', {
    commercialName: 'Obras A',
  });
  const contractorB = await addUser('Constructora B', 'constructora', 'approved', {
    commercialName: 'Obras B',
  });
  const contractorC = await addUser('Constructora C', 'constructora', 'active', {
    commercialName: 'Obras C',
  });
  const projectId = new ObjectId();
  const terrainId = new ObjectId();
  const proposalId = new ObjectId();
  const ownerId = client.id;
  const inputFingerprint = `quotes-${runId}`;
  const db = database.getDb();
  await db.collection('terrains').insertOne({
    _id: terrainId,
    ownerId,
    ubicacion: 'Zona centro',
    ancho: 12,
    largo: 20,
    area: 240,
  });
  await db.collection('projectAnalyses').insertOne({
    projectId,
    ownerId,
    inputFingerprint,
    stale: false,
  });
  await db.collection('proposals').insertOne({
    _id: proposalId,
    projectId,
    ownerId,
    inputFingerprint,
    stale: false,
    name: 'Propuesta seleccionada',
    description: 'Diseño modular para el proyecto.',
    estimate: { costCop: 450000000, currency: 'COP', areaM2: 80 },
  });
  await db.collection('projects').insertOne({
    _id: projectId,
    ownerId,
    nombre: 'Proyecto de prueba',
    presupuesto: 500000,
    habitaciones: 3,
    banos: 2,
    terrainId,
    selectedProposalId: proposalId,
  });
  const serviceId = new ObjectId();
  await db.collection('services').insertOne({
    _id: serviceId,
    ownerId: contractorB.id,
    name: 'Montaje de paneles',
    status: 'active',
    createdAt: new Date(),
  });
  const projectPath = `/projects/${projectId.toHexString()}`;
  const projectWithoutProposal = await db.collection('projects').insertOne({
    ownerId,
    nombre: 'Proyecto sin propuesta',
  });
  assert.equal((await api('POST', `/projects/${projectWithoutProposal.insertedId}/quotes`, {
    token: client.token,
    body: { constructorIds: [contractorA.id.toHexString()] },
  })).status, 409);
  assert.equal((await api('POST', `${projectPath}/quotes`, {
    token: client.token,
    body: {
      constructorIds: [contractorA.id.toHexString()],
      proposalId: new ObjectId().toHexString(),
    },
  })).status, 409);

  const multiRequest = await api('POST', `${projectPath}/quotes`, {
    token: client.token,
    body: {
      constructorIds: [contractorA.id.toHexString(), contractorB.id.toHexString(), contractorC.id.toHexString()],
      notes: 'Considerar acceso al terreno.',
    },
  });
  assert.equal(multiRequest.status, 201, JSON.stringify(multiRequest.payload));
  assert.equal(multiRequest.payload.quotes.length, 3);
  assert.ok(multiRequest.payload.quotes.every((quote) => quote.proposalId === proposalId.toHexString()));
  assert.ok(multiRequest.payload.quotes.every((quote) => quote.notes === 'Considerar acceso al terreno.'));
  assert.equal((await api('POST', `${projectPath}/quotes`, {
    token: client.token,
    body: { constructorIds: [contractorA.id.toHexString()] },
  })).status, 409);

  const aList = await api('GET', '/contractor/quotes', { token: contractorA.token });
  const bList = await api('GET', '/contractor/quotes', { token: contractorB.token });
  const cList = await api('GET', '/contractor/quotes', { token: contractorC.token });
  assert.equal(aList.payload.quotes.length, 1);
  assert.equal(bList.payload.quotes.length, 1);
  assert.equal(cList.payload.quotes.length, 1);
  assert.equal(aList.payload.quotes[0].id, multiRequest.payload.quotes[0].id);
  assert.equal(aList.payload.quotes[0].project.terrain.ubicacion, 'Zona centro');
  assert.equal(aList.payload.quotes[0].proposal.nombre, 'Propuesta seleccionada');

  const aQuote = multiRequest.payload.quotes.find((quote) => quote.contractorId === contractorA.id.toHexString());
  const bQuote = multiRequest.payload.quotes.find((quote) => quote.contractorId === contractorB.id.toHexString());
  const cQuote = multiRequest.payload.quotes.find((quote) => quote.contractorId === contractorC.id.toHexString());
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  assert.equal((await api('PATCH', `/contractor/quotes/${aQuote.id}`, {
    token: contractorA.token,
    body: quotation([{ concept: 'Sin precio', quantity: 1, unitPrice: 0 }], future),
  })).status, 400);
  const aResponse = await api('PATCH', `/contractor/quotes/${aQuote.id}`, {
    token: contractorA.token,
    body: {
      ...quotation([
        { concept: 'Fabricación', quantity: 2, unitPrice: 100 },
        { concept: 'Montaje', quantity: 1, unitPrice: 50 },
      ], future),
      amount: 1,
    },
  });
  assert.equal(aResponse.status, 200, JSON.stringify(aResponse.payload));
  assert.equal(aResponse.payload.quote.response.amount, 250);
  assert.equal(aResponse.payload.quote.response.items[1].subtotal, 50);
  assert.equal((await api('PATCH', `/contractor/quotes/${aQuote.id}`, {
    token: contractorB.token,
    body: quotation([{ concept: 'No propio', quantity: 1, unitPrice: 1 }], future),
  })).status, 404);

  const bResponse = await api('PATCH', `/contractor/quotes/${bQuote.id}`, {
    token: contractorB.token,
    body: quotation([{ concept: 'Cubierta', quantity: 1, unitPrice: 800 }], future),
  });
  assert.equal(bResponse.status, 200);
  await db.collection('quoteRequests').updateOne(
    { _id: new ObjectId(bQuote.id) },
    { $set: { 'response.validUntil': new Date(Date.now() - 1000) } },
  );
  const cResponse = await api('PATCH', `/contractor/quotes/${cQuote.id}`, {
    token: contractorC.token,
    body: quotation([{ concept: 'Suministro', quantity: 2, unitPrice: 40 }], future),
  });
  assert.equal(cResponse.status, 200);
  const replaced = await api('PATCH', `/contractor/quotes/${cQuote.id}`, {
    token: contractorC.token,
    body: quotation([{ concept: 'Suministro actualizado', quantity: 2, unitPrice: 45 }], future),
  });
  assert.equal(replaced.payload.quote.response.amount, 90);
  assert.equal(replaced.payload.quote.response.items.length, 1);

  const clientQuotes = await api('GET', `${projectPath}/quotes`, { token: client.token });
  assert.equal(clientQuotes.payload.quotes.find((quote) => quote.id === bQuote.id).status, 'expired');
  assert.equal((await api('POST', `${projectPath}/quotes/${bQuote.id}/accept`, {
    token: client.token,
  })).status, 409);
  assert.equal((await api('POST', `${projectPath}/quotes/${aQuote.id}/accept`, {
    token: client.token,
  })).status, 200);
  assert.equal((await api('POST', `${projectPath}/quotes/${cQuote.id}/reject`, {
    token: client.token,
  })).status, 200);
  const finalQuotes = await api('GET', `${projectPath}/quotes`, { token: client.token });
  assert.equal(finalQuotes.payload.quotes.find((quote) => quote.id === aQuote.id).status, 'accepted');
  assert.equal(finalQuotes.payload.quotes.find((quote) => quote.id === bQuote.id).status, 'expired');
  assert.equal(finalQuotes.payload.quotes.find((quote) => quote.id === cQuote.id).status, 'rejected');

  const simultaneous = await Promise.all([
    api('POST', `${projectPath}/quotes`, {
      token: client.token,
      body: { constructorIds: [contractorA.id.toHexString()] },
    }),
    api('POST', `${projectPath}/quotes`, {
      token: client.token,
      body: { constructorIds: [contractorA.id.toHexString()] },
    }),
  ]);
  assert.deepEqual(simultaneous.map((result) => result.status).sort(), [201, 409]);
  const reopenedQuote = simultaneous.find((result) => result.status === 201).payload.quote;
  assert.equal((await api('POST', `${projectPath}/quotes/${reopenedQuote.id}/reject`, {
    token: client.token,
  })).status, 409);
  const reopenedResponse = await api('PATCH', `/contractor/quotes/${reopenedQuote.id}`, {
    token: contractorA.token,
    body: quotation([{ concept: 'Nueva solicitud', quantity: 1, unitPrice: 10 }], future),
  });
  assert.equal(reopenedResponse.status, 200);
  assert.equal((await api('POST', `${projectPath}/quotes/${reopenedQuote.id}/reject`, {
    token: client.token,
  })).status, 200);

  const serviceRequest = await api('POST', `${projectPath}/quotes`, {
    token: client.token,
    body: { serviceId: serviceId.toHexString(), notes: 'Solo esta publicación.' },
  });
  assert.equal(serviceRequest.status, 201, JSON.stringify(serviceRequest.payload));
  assert.equal(serviceRequest.payload.quote.contractorId, contractorB.id.toHexString());
  assert.equal(serviceRequest.payload.quote.serviceName, 'Montaje de paneles');
});
