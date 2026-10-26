const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');

const runId = `${process.pid}_${Date.now()}`;
const testDatabase = `vimod_stage2_test_${runId}`;
const password = 'ViModStage2-Test-123!';
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27021';
process.env.MONGODB_DATABASE = testDatabase;
process.env.JWT_SECRET = `stage2-test-only-${runId}`;
process.env.CLIENT_ORIGIN = 'http://localhost:5500';
process.env.ROLE_ASSIGNMENTS = '';

const database = require('../Paquetes/Persistencia/AccesoDatos/database');
const app = require('../src/app');
let server;
let connected = false;
let baseUrl;

async function api(method, path, { body, token, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders || {}) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, payload: await response.json() };
}

async function createAccount(email) {
  const registration = await api('POST', '/auth/register', {
    body: { nombre: `HU05-07 ${runId}`, correo: email, password },
  });
  assert.equal(registration.status, 201);
  const login = await api('POST', '/auth/login', {
    body: { correo: email, password },
  });
  assert.equal(login.status, 200);
  return login.payload;
}

async function createTerrain(token, ubicacion, ancho, largo) {
  const response = await api('POST', '/terrains', {
    token,
    body: { ubicacion, ancho, largo },
  });
  assert.equal(response.status, 201, JSON.stringify(response.payload));
  return response.payload.terrain;
}

async function createProject(token, terrainId, { presupuesto, habitaciones = 3, banos = 2 }) {
  const response = await api('POST', '/projects', {
    token,
    body: {
      nombre: `HU05-07 project ${runId}`,
      terrain_id: terrainId,
      presupuesto,
      habitaciones,
      banos,
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.payload));
  return response.payload.project;
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

test('HU-05/06/07 analysis, feasible proposals, estimates and idempotent persistence', async () => {
  await database.connect();
  connected = true;
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  assert.equal((await api('POST', '/projects/unauthed/analyze', { body: {} })).status, 401);

  const owner = await createAccount(`stage2.owner.${runId}@example.invalid`);
  const other = await createAccount(`stage2.other.${runId}@example.invalid`);
  const spaciousTerrain = await createTerrain(owner.token, `Stage2 terrain ${runId}`, 12, 20);
  const validProject = await createProject(owner.token, spaciousTerrain.id, { presupuesto: 350000000 });
  assert.equal((await api('GET', `/projects/${validProject.id}`, { token: owner.token })).status, 200);
  const beforeAnalysisProposals = await api('GET', `/projects/${validProject.id}/proposals`, {
    token: owner.token,
  });
  assert.equal(beforeAnalysisProposals.status, 200);
  assert.equal(beforeAnalysisProposals.payload.requiresGeneration, true);

  const analyzed = await api('POST', `/projects/${validProject.id}/analyze`, {
    token: owner.token,
  });
  assert.equal(analyzed.status, 200, JSON.stringify(analyzed.payload));
  assert.equal(analyzed.payload.analysis.inputs.widthM, 12);
  assert.equal(analyzed.payload.analysis.inputs.lengthM, 20);
  assert.equal(analyzed.payload.analysis.inputs.budgetCop, 350000000);
  assert.equal(analyzed.payload.analysis.inputs.bedrooms, 3);
  assert.equal(analyzed.payload.analysis.preliminary.status, 'layout_capacity_available');
  assert.equal(analyzed.payload.analysis.assumptions.soilStudyIncluded, false);

  const persistedAnalysis = await database.getDb().collection('projectAnalyses').findOne({
    projectId: new ObjectId(validProject.id),
    ownerId: new ObjectId(owner.user.id),
  });
  assert.ok(persistedAnalysis);
  assert.equal(persistedAnalysis.inputs.widthM, 12);
  const analysisGet = await api('GET', `/projects/${validProject.id}/analysis`, { token: owner.token });
  assert.equal(analysisGet.status, 200);
  assert.equal(analysisGet.payload.analysis.inputFingerprint, analyzed.payload.analysis.inputFingerprint);
  assert.equal((await api('GET', `/projects/${validProject.id}/analysis`, { token: other.token })).status, 404);

  const generated = await api('POST', `/projects/${validProject.id}/proposals`, {
    token: owner.token,
    body: {},
  });
  assert.equal(generated.status, 200, JSON.stringify(generated.payload));
  assert.equal(generated.payload.viable, true);
  assert.ok(generated.payload.proposals.length >= 1);
  const catalog = require('../Paquetes/Dominio/ModeloPropuestas/modular-catalog');
  for (const proposal of generated.payload.proposals) {
    const { estimate, layout } = proposal;
    assert.equal(proposal.bedrooms, validProject.habitaciones);
    assert.equal(proposal.bathrooms, validProject.banos);
    assert.equal(proposal.viable, estimate.costCop <= validProject.presupuesto);
    assert.equal(estimate.currency, 'COP');
    assert.ok(layout.footprintWidthM <= 12);
    assert.ok(layout.footprintLengthM <= 20);
    assert.ok(estimate.areaM2 >= proposal.modules.reduce(
      (sum, module) => sum + module.count * module.areaM2PerModule,
      0,
    ));
    assert.equal(estimate.energyUnit, 'kWh/año');
    assert.equal(estimate.energyKwhPerYear, Object.entries(estimate.parameters.moduleCounts)
      .reduce((sum, [type, count]) => sum + count * catalog.annualEnergyKwh[type], 0));
    assert.equal(estimate.executionDays, catalog.executionDays.setup
      + estimate.parameters.moduleCount * catalog.executionDays.perModule);
    assert.equal(estimate.parameters.budgetCop, validProject.presupuesto);
    assert.match(estimate.assumptions, /académica preliminar/);
  }

  const proposalCountBefore = await database.getDb().collection('proposals').countDocuments({
    projectId: new ObjectId(validProject.id),
    ownerId: new ObjectId(owner.user.id),
  });
  const repeated = await api('POST', `/projects/${validProject.id}/proposals`, {
    token: owner.token,
    body: {},
  });
  assert.equal(repeated.status, 200);
  assert.deepEqual(
    repeated.payload.proposals.map((proposal) => proposal.id),
    generated.payload.proposals.map((proposal) => proposal.id),
  );
  const [concurrentOne, concurrentTwo] = await Promise.all([
    api('POST', `/projects/${validProject.id}/proposals`, { token: owner.token, body: {} }),
    api('POST', `/projects/${validProject.id}/proposals`, { token: owner.token, body: {} }),
  ]);
  assert.equal(concurrentOne.status, 200);
  assert.equal(concurrentTwo.status, 200);
  assert.deepEqual(
    concurrentOne.payload.proposals.map((proposal) => proposal.id),
    concurrentTwo.payload.proposals.map((proposal) => proposal.id),
  );
  const regenerated = await api('POST', `/projects/${validProject.id}/proposals/regenerate`, {
    token: owner.token,
  });
  assert.equal(regenerated.status, 200);
  assert.equal(await database.getDb().collection('proposals').countDocuments({
    projectId: new ObjectId(validProject.id),
    ownerId: new ObjectId(owner.user.id),
  }), proposalCountBefore);

  const list = await api('GET', `/projects/${validProject.id}/proposals`, { token: owner.token });
  assert.equal(list.status, 200);
  assert.equal(list.payload.proposals.length, generated.payload.proposals.length);
  const firstProposal = list.payload.proposals[0];
  const detail = await api('GET', `/projects/${validProject.id}/proposals/${firstProposal.id}`, {
    token: owner.token,
  });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.payload.proposal.estimate, firstProposal.estimate);
  assert.equal((await api('GET', `/projects/${validProject.id}/proposals`, { token: other.token })).status, 404);

  const casaLaMaria = await createProject(owner.token, spaciousTerrain.id, {
    presupuesto: 300000000,
    habitaciones: 4,
    banos: 3,
  });
  const casaProposals = await api('POST', `/projects/${casaLaMaria.id}/proposals`, {
    token: owner.token,
    body: {},
  });
  assert.equal(casaProposals.status, 200, JSON.stringify(casaProposals.payload));
  assert.ok(casaProposals.payload.proposals.filter((proposal) => proposal.viable).length > 1);
  assert.ok(casaProposals.payload.proposals.every((proposal) =>
    proposal.projectId === casaLaMaria.id
      && proposal.bedrooms === 4
      && proposal.bathrooms === 3));

  const naranjitas = await createProject(owner.token, spaciousTerrain.id, {
    presupuesto: 70000000,
    habitaciones: 2,
    banos: 2,
  });
  const naranjitasProposals = await api('POST', `/projects/${naranjitas.id}/proposals`, {
    token: owner.token,
    body: {},
  });
  assert.equal(naranjitasProposals.status, 200, JSON.stringify(naranjitasProposals.payload));
  assert.ok(naranjitasProposals.payload.proposals.every((proposal) =>
    proposal.projectId === naranjitas.id
      && proposal.bedrooms === 2
      && proposal.bathrooms === 2));
  assert.notDeepEqual(
    casaProposals.payload.proposals.map((proposal) => proposal.id),
    naranjitasProposals.payload.proposals.map((proposal) => proposal.id),
  );
  assert.equal((await api('GET', `/projects/${naranjitas.id}/proposals/${casaProposals.payload.proposals[0].id}`, {
    token: owner.token,
  })).status, 404);

  const affordableProposal = casaProposals.payload.proposals.find((proposal) => proposal.viable);
  assert.ok(affordableProposal);
  assert.equal((await api('POST', `/projects/${casaLaMaria.id}/select-proposal`, {
    token: owner.token,
    body: { proposalId: affordableProposal.id },
  })).status, 200);
  const orderKey = `proposal-order-${runId}`;
  const createdOrder = await api('POST', `/projects/${casaLaMaria.id}/orders`, {
    token: owner.token,
    headers: { 'Idempotency-Key': orderKey },
    body: { amount: 1 },
  });
  assert.equal(createdOrder.status, 201, JSON.stringify(createdOrder.payload));
  assert.equal(createdOrder.payload.order.amount, affordableProposal.estimate.costCop);
  assert.equal(createdOrder.payload.order.amountSource, 'academic_estimate');

  const legacyCurrencyProposalId = new ObjectId();
  await database.getDb().collection('proposals').insertOne({
    _id: legacyCurrencyProposalId,
    projectId: new ObjectId(validProject.id),
    ownerId: new ObjectId(owner.user.id),
    terrainId: new ObjectId(spaciousTerrain.id),
    inputFingerprint: analyzed.payload.analysis.inputFingerprint,
    code: 'LEGACY-MXN',
    stale: false,
    name: 'Propuesta heredada incompatible',
    estimate: { costMxn: 175000, currency: 'MXN', areaM2: 96 },
  });
  assert.equal((await api('POST', `/projects/${validProject.id}/select-proposal`, {
    token: owner.token,
    body: { proposalId: legacyCurrencyProposalId.toHexString() },
  })).status, 409);

  const editableProject = await createProject(owner.token, spaciousTerrain.id, { presupuesto: 350000000 });
  const editableGeneration = await api('POST', `/projects/${editableProject.id}/proposals`, {
    token: owner.token,
    body: {},
  });
  const selectedId = editableGeneration.payload.proposals[0].id;
  assert.equal((await api('POST', `/projects/${editableProject.id}/select-proposal`, {
    token: owner.token,
    body: { proposalId: selectedId },
  })).status, 200);
  const selected = await api('GET', `/projects/${editableProject.id}/selected-proposal`, {
    token: owner.token,
  });
  assert.equal(selected.payload.proposal.id, selectedId);

  const edited = await api('PATCH', `/projects/${editableProject.id}`, {
    token: owner.token,
    body: {
      nombre: editableProject.nombre,
      terrain_id: spaciousTerrain.id,
      presupuesto: 360000000,
      habitaciones: 2,
      banos: 3,
    },
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.payload));
  const outdated = await api('GET', `/projects/${editableProject.id}/proposals`, {
    token: owner.token,
  });
  assert.equal(outdated.status, 200);
  assert.equal(outdated.payload.outdated, true);
  assert.equal(outdated.payload.proposals[0].stale, true);
  assert.equal((await api('GET', `/projects/${editableProject.id}/selected-proposal`, {
    token: owner.token,
  })).payload.proposal, null);
  assert.equal((await api('POST', `/projects/${editableProject.id}/select-proposal`, {
    token: owner.token,
    body: { proposalId: selectedId },
  })).status, 409);

  const currentGeneration = await api('POST', `/projects/${editableProject.id}/proposals/regenerate`, {
    token: owner.token,
  });
  assert.equal(currentGeneration.status, 200);
  assert.equal(currentGeneration.payload.proposals[0].bedrooms, 2);
  assert.equal(currentGeneration.payload.proposals[0].bathrooms, 3);
  assert.ok(!currentGeneration.payload.proposals.some((proposal) => proposal.id === selectedId));
  assert.equal(await database.getDb().collection('proposals').countDocuments({
    projectId: new ObjectId(editableProject.id),
    ownerId: new ObjectId(owner.user.id),
  }), currentGeneration.payload.proposals.length);

  const exhaustedProject = await createProject(owner.token, spaciousTerrain.id, { presupuesto: 350000000 });
  const priorGeneration = await api('POST', `/projects/${exhaustedProject.id}/proposals`, {
    token: owner.token,
    body: {},
  });
  assert.ok(priorGeneration.payload.proposals.length > 0);
  const lowerBudget = await api('PATCH', `/projects/${exhaustedProject.id}`, {
    token: owner.token,
    body: {
      nombre: exhaustedProject.nombre,
      terrain_id: spaciousTerrain.id,
      presupuesto: 50000000,
      habitaciones: exhaustedProject.habitaciones,
      banos: exhaustedProject.banos,
    },
  });
  assert.equal(lowerBudget.status, 200);
  const exhaustedRegeneration = await api('POST', `/projects/${exhaustedProject.id}/proposals/regenerate`, {
    token: owner.token,
  });
  assert.equal(exhaustedRegeneration.status, 200);
  assert.equal(exhaustedRegeneration.payload.viable, false);
  assert.ok(exhaustedRegeneration.payload.proposals.length > 0);
  assert.ok(exhaustedRegeneration.payload.proposals.every((proposal) => proposal.viable === false));
  assert.equal(await database.getDb().collection('proposals').countDocuments({
    projectId: new ObjectId(exhaustedProject.id),
    ownerId: new ObjectId(owner.user.id),
  }), exhaustedRegeneration.payload.proposals.length);

  const legacyProjectId = new ObjectId();
  await database.getDb().collection('projects').insertOne({
    _id: legacyProjectId,
    ownerId: new ObjectId(owner.user.id),
    terrainId: new ObjectId(spaciousTerrain.id),
    nombre: `Legacy incomplete ${runId}`,
    presupuesto: 200000000,
    estado: 'Borrador',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  assert.equal((await api('POST', `/projects/${legacyProjectId}/analyze`, { token: owner.token })).status, 422);

  const tinyTerrain = await createTerrain(owner.token, `Stage2 tiny terrain ${runId}`, 3, 3);
  const tinyProject = await createProject(owner.token, tinyTerrain.id, { presupuesto: 350000000 });
  const tinyAnalysis = await api('POST', `/projects/${tinyProject.id}/analyze`, { token: owner.token });
  assert.equal(tinyAnalysis.status, 200);
  assert.equal(tinyAnalysis.payload.analysis.preliminary.status, 'insufficient_dimensions_for_standard_modules');
  const tinyProposals = await api('POST', `/projects/${tinyProject.id}/proposals`, {
    token: owner.token,
    body: {},
  });
  assert.equal(tinyProposals.status, 200);
  assert.equal(tinyProposals.payload.viable, false);
  assert.equal(tinyProposals.payload.reason, 'terrain_too_small');
  assert.equal(tinyProposals.payload.proposals.length, 0);
  assert.equal(await database.getDb().collection('proposals').countDocuments({
    projectId: new ObjectId(tinyProject.id),
  }), 0);

  const lowBudgetProject = await createProject(owner.token, spaciousTerrain.id, { presupuesto: 100000000 });
  const lowBudgetResult = await api('POST', `/projects/${lowBudgetProject.id}/proposals`, {
    token: owner.token,
    body: {},
  });
  assert.equal(lowBudgetResult.status, 200);
  assert.equal(lowBudgetResult.payload.viable, true);
  assert.ok(lowBudgetResult.payload.proposals.some((proposal) =>
    proposal.viable && proposal.estimate.costCop <= lowBudgetProject.presupuesto));

  const twoByTwoProject = await createProject(owner.token, spaciousTerrain.id, {
    presupuesto: 70000000,
    habitaciones: 2,
    banos: 2,
  });
  const twoByTwoResult = await api('POST', `/projects/${twoByTwoProject.id}/proposals`, {
    token: owner.token,
    body: {},
  });
  assert.equal(twoByTwoResult.status, 200);
  assert.equal(twoByTwoResult.payload.viable, true);
  assert.ok(twoByTwoResult.payload.proposals.some((proposal) => proposal.viable));
  assert.ok(twoByTwoResult.payload.proposals.length > 1);
});
