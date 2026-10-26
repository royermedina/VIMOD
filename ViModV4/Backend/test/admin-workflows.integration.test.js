const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getHomePage } = require('../Nucleo/Frontend/Scripts/role-navigation');

const runId = `${process.pid}_${Date.now()}`;
const testDatabase = `vimod_stage3_test_${runId}`;
const password = 'ViModStage3-Test-123!';
const adminPassword = 'ViModStage3-Admin-Password!';

process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27021';
process.env.MONGODB_DATABASE = testDatabase;
process.env.JWT_SECRET = `stage3-test-only-${runId}`;
process.env.CLIENT_ORIGIN = 'http://localhost:5500';
process.env.ROLE_ASSIGNMENTS = '';
process.env.ADMIN_PASSWORD = adminPassword;
process.env.PAYMENT_PROVIDER = '';
process.env.STRIPE_SECRET_KEY = '';

const database = require('../Paquetes/Persistencia/AccesoDatos/database');
const app = require('../src/app');
const { resolveRole } = require('../Paquetes/Aplicacion/Autenticacion/role-assignments');
let server;
let connected = false;
let baseUrl;

test('server-authorized roles resolve to the correct panel and pending accounts have no landing page', () => {
  assert.equal(getHomePage({ rol: 'cliente', accountStatus: 'active' }), '/Backend/Paquetes/Presentacion/PortalCliente/Vistas/3.%20Panel%20principal%20del%20cliente.html');
  assert.equal(getHomePage({ rol: 'arquitecto', requestedRole: 'arquitecto', accountStatus: 'aprobado' }), '/Backend/Paquetes/Presentacion/PortalArquitecto/Vistas/11.%20Panel%20arquitecto.html');
  assert.equal(getHomePage({ rol: 'constructora', requestedRole: 'constructora', accountStatus: 'aprobado' }), '/Backend/Paquetes/Presentacion/PortalConstructora/Vistas/12.%20Constructora%20mis%20servicios.html');
  assert.equal(getHomePage({ rol: 'admin', accountStatus: 'active' }), '/Backend/Paquetes/Presentacion/PanelAdmin/Vistas/15.%20Consola%20administrativa.html');
  assert.equal(getHomePage({ rol: 'cliente', requestedRole: 'arquitecto', accountStatus: 'pendiente' }), null);
  assert.equal(resolveRole({ rol: 'cliente', requestedRole: 'arquitecto', accountStatus: 'aprobado' }), 'arquitecto');
  assert.equal(resolveRole({ rol: 'arquitecto', requestedRole: 'arquitecto', accountStatus: 'pendiente' }), 'cliente');
});

async function api(method, path, { body, token, origin, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders || {}) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  headers.origin = origin || 'http://127.0.0.1:5500';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? null : await response.json();
  return { status: response.status, payload, headers: response.headers };
}

async function register(email, role) {
  return api('POST', '/auth/register', {
    body: { nombre: `ViMod ${role} ${runId}`, correo: email, password, rol: role },
  });
}

async function login(email, pass = password) {
  const result = await api('POST', '/auth/login', {
    body: { correo: email, password: pass },
  });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  return result.payload;
}

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  if (!connected) return;
  await database.close();
  const cleanupClient = new MongoClient(process.env.MONGODB_URI);
  await cleanupClient.connect();
  await cleanupClient.db(testDatabase).dropDatabase();
  await cleanupClient.close();
});

test('configured admin login, role approval, HU-08..12, quotes, order idempotency and payment authorization', async () => {
  await database.connect();
  connected = true;
  const { AdminService } = require('../Paquetes/Aplicacion/Administracion');
  const adminService = new AdminService();
  const existingPasswordHash = await bcrypt.hash('Old-Isolated-Admin-Password', 4);
  const existingAdmin = await database.getDb().collection('users').insertOne({
    nombre: 'RoyeryAngel',
    correo: 'royeryangel',
    passwordHash: existingPasswordHash,
    rol: 'admin',
    requestedRole: 'admin',
    accountType: 'admin',
    accountStatus: 'active',
    createdAt: new Date(),
  });
  assert.equal(await adminService.provisionConfiguredAdmin(), true);
  assert.equal(await adminService.provisionConfiguredAdmin(), true);
  const adminDocument = await database.getDb().collection('users').findOne({ correo: 'royeryangel' });
  assert.equal(adminDocument._id.toHexString(), existingAdmin.insertedId.toHexString());
  assert.equal(adminDocument.rol, 'admin');
  assert.notEqual(adminDocument.passwordHash, existingPasswordHash);
  assert.equal(await bcrypt.compare(adminPassword, adminDocument.passwordHash), true);
  assert.equal(await bcrypt.compare('Old-Isolated-Admin-Password', adminDocument.passwordHash), false);
  const provisionedPasswordHash = adminDocument.passwordHash;
  assert.equal(await adminService.provisionConfiguredAdmin(), true);
  assert.equal(
    (await database.getDb().collection('users').findOne({ correo: 'royeryangel' })).passwordHash,
    provisionedPasswordHash,
  );
  assert.equal(await database.getDb().collection('users').countDocuments({
    correo: 'royeryangel',
  }), 1);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  for (const origin of ['http://localhost:5500', 'http://127.0.0.1:5500']) {
    const preflight = await api('OPTIONS', '/auth/register', {
      origin,
      headers: { 'access-control-request-method': 'POST' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  }
  const orderPreflight = await api('OPTIONS', '/projects/sample/orders', {
    headers: {
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,authorization,idempotency-key',
    },
  });
  assert.equal(orderPreflight.status, 204);
  assert.match(orderPreflight.headers.get('access-control-allow-headers'), /Idempotency-Key/i);
  const deniedOrigin = await api('OPTIONS', '/auth/register', {
    origin: 'http://malicious.example',
    headers: { 'access-control-request-method': 'POST' },
  });
  assert.equal(deniedOrigin.status, 403);
  assert.equal(deniedOrigin.headers.get('access-control-allow-origin'), null);

  const clientEmail = `customer.${runId}@example.invalid`;
  const architectEmail = `architect.${runId}@example.invalid`;
  const otherArchitectEmail = `architect-other.${runId}@example.invalid`;
  const architectRejectEmail = `architect-reject.${runId}@example.invalid`;
  const contractorEmail = `contractor.${runId}@example.invalid`;
  const contractorRejectEmail = `contractor-reject.${runId}@example.invalid`;
  const otherContractorEmail = `contractor-other.${runId}@example.invalid`;

  for (const [email, role] of [
    [clientEmail, 'cliente'],
    [architectEmail, 'arquitecto'],
    [otherArchitectEmail, 'arquitecto'],
    [architectRejectEmail, 'arquitecto'],
    [contractorEmail, 'constructora'],
    [contractorRejectEmail, 'constructora'],
    [otherContractorEmail, 'constructora'],
  ]) {
    const registration = await register(email, role);
    assert.equal(registration.status, 201, JSON.stringify(registration.payload));
    assert.equal(registration.payload.user.requestedRole, role);
    assert.equal(registration.payload.user.accountType, role);
    assert.equal(registration.payload.user.rol, role === 'cliente' ? 'cliente' : 'cliente');
    assert.equal(registration.payload.user.accountStatus, role === 'cliente' ? 'active' : 'pendiente');
    const storedUser = await database.getDb().collection('users').findOne({ correo: email });
    assert.equal(storedUser.rol, role);
    assert.equal(storedUser.requestedRole, role);
    assert.equal(storedUser.accountType, role);
  }

  const adminHijack = await register(`admin-hijack.${runId}@example.invalid`, 'admin');
  assert.equal(adminHijack.status, 201);
  assert.equal(adminHijack.payload.user.rol, 'cliente');
  assert.equal(adminHijack.payload.user.requestedRole, 'cliente');

  assert.equal((await api('POST', '/auth/admin/setup', { body: {} })).status, 401);
  const invalidAdminLogin = await api('POST', '/auth/login', {
    body: { correo: 'RoyeryAngel', password: `${adminPassword}-invalid` },
  });
  assert.equal(invalidAdminLogin.status, 401);
  const admin = await login('RoyeryAngel', adminPassword);
  assert.equal(admin.user.rol, 'admin');
  assert.equal(admin.user.correo, 'royeryangel');
  assert.equal((await api('GET', '/auth/me', { token: admin.token })).payload.user.rol, 'admin');
  assert.equal((await api('POST', '/auth/admin/setup', {
    token: admin.token,
    body: {},
  })).status, 404);
  const client = await login(clientEmail);
  const pendingArchitect = await login(architectEmail);
  const pendingContractor = await login(contractorEmail);
  assert.equal(pendingArchitect.user.rol, 'cliente');
  assert.equal(pendingArchitect.user.requestedRole, 'arquitecto');
  assert.equal(pendingArchitect.user.accountStatus, 'pendiente');
  assert.equal(pendingContractor.user.rol, 'cliente');
  assert.equal(pendingContractor.user.requestedRole, 'constructora');
  assert.equal(pendingContractor.user.accountStatus, 'pendiente');
  assert.equal(getHomePage(pendingArchitect.user), null);
  assert.equal((await api('GET', '/admin/overview', { token: client.token })).status, 403);
  assert.equal((await api('GET', '/admin/overview', { token: pendingArchitect.token })).status, 403);
  assert.equal((await api('GET', '/admin/overview')).status, 401);
  const pendingRequests = await api('GET', '/admin/role-requests', { token: admin.token });
  assert.equal(pendingRequests.status, 200);
  assert.equal(pendingRequests.payload.requests.length, 6);
  const pendingSession = await api('GET', '/auth/me', { token: pendingArchitect.token });
  assert.equal(pendingSession.status, 200);
  assert.equal(pendingSession.payload.user.rol, 'cliente');
  assert.equal(pendingSession.payload.user.requestedRole, 'arquitecto');
  const forgedAdminToken = jwt.sign({ sub: client.user.id, rol: 'admin' }, process.env.JWT_SECRET);
  assert.equal((await api('GET', '/admin/overview', { token: forgedAdminToken })).status, 403);

  const decisionByEmail = async (email, decision) => {
    const user = (await api('GET', `/admin/users?search=${encodeURIComponent(email)}`, { token: admin.token })).payload.users[0];
    assert.ok(user);
    return api('PATCH', `/admin/role-requests/${user.id}`, {
      token: admin.token,
      body: { decision, reason: `stage3 ${decision}` },
    });
  };

  for (const [email, decision] of [
    [architectEmail, 'approve'],
    [otherArchitectEmail, 'approve'],
    [architectRejectEmail, 'reject'],
    [contractorEmail, 'approve'],
    [contractorRejectEmail, 'reject'],
    [otherContractorEmail, 'approve'],
  ]) {
    assert.equal((await decisionByEmail(email, decision)).status, 200);
    assert.equal((await decisionByEmail(email, decision)).status, 409);
  }

  const authorizedArchitect = await login(architectEmail);
  const otherArchitect = await login(otherArchitectEmail);
  const authorizedContractor = await login(contractorEmail);
  const rejectedArchitect = await login(architectRejectEmail);
  const rejectedContractor = await login(contractorRejectEmail);
  assert.equal(authorizedArchitect.user.rol, 'arquitecto');
  assert.equal(authorizedArchitect.user.accountStatus, 'aprobado');
  assert.equal(getHomePage(authorizedArchitect.user), '/Backend/Paquetes/Presentacion/PortalArquitecto/Vistas/11.%20Panel%20arquitecto.html');
  assert.equal(getHomePage(authorizedContractor.user), '/Backend/Paquetes/Presentacion/PortalConstructora/Vistas/12.%20Constructora%20mis%20servicios.html');
  assert.equal(getHomePage(admin.user), '/Backend/Paquetes/Presentacion/PanelAdmin/Vistas/15.%20Consola%20administrativa.html');
  assert.equal((await api('GET', '/admin/overview', { token: admin.token })).status, 200);
  assert.equal(rejectedArchitect.user.rol, 'cliente');
  assert.equal(rejectedContractor.user.rol, 'cliente');
  assert.equal((await api('GET', '/architect/reviews', { token: rejectedArchitect.token })).status, 403);
  const stillPendingEmail = `architect-still-pending.${runId}@example.invalid`;
  assert.equal((await register(stillPendingEmail, 'arquitecto')).status, 201);
  const stillPendingArchitect = await login(stillPendingEmail);
  assert.equal(stillPendingArchitect.user.accountStatus, 'pendiente');
  assert.equal((await api('GET', '/architect/reviews', { token: stillPendingArchitect.token })).status, 403);
  const savedProfile = await api('PATCH', '/architect/profile', {
    token: authorizedArchitect.token,
    body: {
      nombre: 'Arquitecta de Prueba',
      especialidad: 'Estructuras',
      anosExperiencia: 8,
      zona: 'Centro',
      honorarioBase: 2500,
    },
  });
  assert.equal(savedProfile.status, 200, JSON.stringify(savedProfile.payload));
  assert.equal(savedProfile.payload.profile.anosExperiencia, 8);
  assert.equal(savedProfile.payload.profile.ratingAverage, null);
  assert.equal(savedProfile.payload.profile.ratingCount, 0);
  assert.equal((await api('GET', '/architect/profile', { token: authorizedArchitect.token }))
    .payload.profile.nombre, 'Arquitecta de Prueba');
  assert.equal((await api('GET', '/architects', { token: client.token })).payload.architects.length, 2);
  assert.equal((await api('GET', '/architects', { token: stillPendingArchitect.token })).status, 200);
  assert.equal((await api('GET', '/contractor/services', { token: rejectedContractor.token })).status, 403);
  assert.equal((await api('GET', '/terrains', { token: authorizedArchitect.token })).status, 403);
  assert.equal((await api('GET', '/projects', { token: authorizedArchitect.token })).status, 403);
  assert.equal((await api('GET', '/terrains', { token: authorizedContractor.token })).status, 403);
  assert.equal((await api('GET', '/projects', { token: authorizedContractor.token })).status, 403);
  assert.equal((await api('PATCH', `/admin/users/${admin.user.id}/status`, {
    token: admin.token,
    body: { status: 'disabled' },
  })).status, 403);

  const client2 = await login(`admin-hijack.${runId}@example.invalid`);
  const terrain = await api('POST', '/terrains', {
    token: client.token,
    body: { ubicacion: `stage3 terrain ${runId}`, ancho: 12, largo: 20 },
  });
  assert.equal(terrain.status, 201, JSON.stringify(terrain.payload));
  assert.equal((await api('GET', '/terrains', { token: client2.token })).payload.terrains.length, 0);
  assert.equal((await api('GET', `/terrains/${terrain.payload.terrain.id}`, { token: client2.token })).status, 404);
  const project = await api('POST', '/projects', {
    token: client.token,
    body: {
      nombre: `stage3 project ${runId}`,
      terrain_id: terrain.payload.terrain.id,
      presupuesto: 350000000,
      habitaciones: 3,
      banos: 2,
    },
  });
  assert.equal(project.status, 201, JSON.stringify(project.payload));
  assert.equal((await api('GET', '/projects', { token: client2.token })).payload.projects.length, 0);
  assert.equal((await api('GET', `/projects/${project.payload.project.id}`, { token: client2.token })).status, 404);
  const generated = await api('POST', `/projects/${project.payload.project.id}/proposals`, {
    token: client.token,
    body: {},
  });
  assert.equal(generated.status, 200);
  const proposalId = generated.payload.proposals[0].id;

  assert.equal((await api('POST', `/projects/${project.payload.project.id}/select-proposal`, {
    token: client2.token,
    body: { proposalId },
  })).status, 404);
  const selected = await api('POST', `/projects/${project.payload.project.id}/select-proposal`, {
    token: client.token,
    body: { proposalId },
  });
  assert.equal(selected.status, 200);
  const storedSelection = await database.getDb().collection('projects').findOne(
    { _id: new ObjectId(project.payload.project.id) },
    { projection: { selectedProposalId: 1 } },
  );
  assert.equal(storedSelection.selectedProposalId.toHexString(), proposalId);
  assert.equal((await api('GET', `/projects/${project.payload.project.id}/selected-proposal`, {
    token: client.token,
  })).payload.proposal.id, proposalId);
  const proposalsAfterReload = await api('GET', `/projects/${project.payload.project.id}/proposals`, {
    token: client.token,
  });
  assert.equal(proposalsAfterReload.status, 200);
  assert.ok(proposalsAfterReload.payload.proposals.some((proposal) => proposal.id === proposalId));
  assert.equal((await api('POST', `/projects/${project.payload.project.id}/select-proposal`, {
    token: client.token,
    body: { proposalId: 'not-an-object-id' },
  })).status, 400);

  const review = await api('POST', `/projects/${project.payload.project.id}/reviews`, {
    token: client.token,
    body: {},
  });
  assert.equal(review.status, 201, JSON.stringify(review.payload));
  assert.equal((await api('PATCH', `/admin/reviews/${review.payload.review.id}/assign`, {
    token: admin.token,
    body: { architectId: authorizedArchitect.user.id },
  })).status, 200);
  assert.equal((await api('POST', `/projects/${project.payload.project.id}/reviews`, {
    token: client.token,
    body: {},
  })).status, 409);
  const assigned = await api('GET', '/architect/reviews', { token: authorizedArchitect.token });
  assert.equal(assigned.status, 200);
  assert.ok(assigned.payload.reviews.some((item) => item.id === review.payload.review.id));
  const otherArchitectReviews = await api('GET', '/architect/reviews', { token: otherArchitect.token });
  assert.equal(otherArchitectReviews.status, 200);
  assert.equal(otherArchitectReviews.payload.reviews.length, 0);
  assert.equal((await api('POST', `/reviews/${review.payload.review.id}/observations`, {
    token: otherArchitect.token,
    body: { observation: 'Intento sobre revisión no asignada.' },
  })).status, 404);
  assert.equal((await api('POST', `/reviews/${review.payload.review.id}/observations`, {
    token: authorizedArchitect.token,
    body: { observation: '   ' },
  })).status, 400);
  assert.equal((await api('POST', `/reviews/${review.payload.review.id}/start`, {
    token: otherArchitect.token,
  })).status, 409);
  assert.equal((await api('POST', `/reviews/${review.payload.review.id}/start`, {
    token: authorizedArchitect.token,
  })).status, 204);
  const observation = await api('POST', `/reviews/${review.payload.review.id}/observations`, {
    token: authorizedArchitect.token,
    body: { observation: 'Revisar orientación y ventilación.' },
  });
  assert.equal(observation.status, 201);
  const clientReviews = await api('GET', `/projects/${project.payload.project.id}/reviews`, { token: client.token });
  assert.equal(clientReviews.payload.observations.length, 1);
  assert.equal((await api('GET', `/projects/${project.payload.project.id}/reviews`, { token: client2.token })).status, 404);

  async function createSelectedProject(name) {
    const createdProject = await api('POST', '/projects', {
      token: client.token,
      body: {
        nombre: `${name} ${runId}`,
        terrain_id: terrain.payload.terrain.id,
        presupuesto: 350000000,
        habitaciones: 3,
        banos: 2,
      },
    });
    assert.equal(createdProject.status, 201, JSON.stringify(createdProject.payload));
    const generatedProposals = await api(
      'POST',
      `/projects/${createdProject.payload.project.id}/proposals`,
      { token: client.token, body: {} },
    );
    assert.equal(generatedProposals.status, 200);
    const selectedProposal = generatedProposals.payload.proposals[0];
    assert.equal((await api(
      'POST',
      `/projects/${createdProject.payload.project.id}/select-proposal`,
      { token: client.token, body: { proposalId: selectedProposal.id } },
    )).status, 200);
    return createdProject.payload.project;
  }

  const directedProject = await createSelectedProject('Directed review project');
  const directedReview = await api('POST', `/projects/${directedProject.id}/reviews`, {
    token: client.token,
    body: { mode: 'directed', architectId: authorizedArchitect.user.id },
  });
  assert.equal(directedReview.status, 201, JSON.stringify(directedReview.payload));
  assert.equal(directedReview.payload.review.status, 'directed');
  assert.equal((await api('POST', `/projects/${directedProject.id}/reviews`, {
    token: client.token,
    body: { mode: 'open' },
  })).status, 409);
  assert.equal((await api('POST', `/reviews/${directedReview.payload.review.id}/accept`, {
    token: otherArchitect.token,
  })).status, 409);
  assert.equal((await api('POST', `/reviews/${directedReview.payload.review.id}/accept`, {
    token: stillPendingArchitect.token,
  })).status, 403);
  assert.equal((await api('POST', `/reviews/${directedReview.payload.review.id}/accept`, {
    token: authorizedArchitect.token,
  })).payload.review.status, 'assigned');
  const assignedDirected = await api('GET', '/architect/reviews', { token: authorizedArchitect.token });
  assert.ok(assignedDirected.payload.reviews.some((item) => item.id === directedReview.payload.review.id));
  assert.equal((await api('GET', '/architect/reviews', { token: otherArchitect.token }))
    .payload.reviews.some((item) => item.id === directedReview.payload.review.id), false);
  assert.equal((await api('POST', `/projects/${directedProject.id}/reviews/${directedReview.payload.review.id}/cancel`, {
    token: client2.token,
  })).status, 404);
  assert.equal((await api('POST', `/projects/${directedProject.id}/reviews/${directedReview.payload.review.id}/cancel`, {
    token: client.token,
  })).status, 204);

  const rejectedProject = await createSelectedProject('Rejected review project');
  const rejectedReview = await api('POST', `/projects/${rejectedProject.id}/reviews`, {
    token: client.token,
    body: { mode: 'directed', architectId: otherArchitect.user.id },
  });
  assert.equal(rejectedReview.status, 201);
  assert.equal((await api('POST', `/reviews/${rejectedReview.payload.review.id}/reject`, {
    token: otherArchitect.token,
  })).payload.review.status, 'rejected');

  const openProject = await createSelectedProject('Open review project');
  const openReview = await api('POST', `/projects/${openProject.id}/reviews`, {
    token: client.token,
    body: { mode: 'open' },
  });
  assert.equal(openReview.status, 201, JSON.stringify(openReview.payload));
  assert.equal(openReview.payload.review.status, 'open');
  assert.equal((await api('POST', `/reviews/${openReview.payload.review.id}/applications`, {
    token: stillPendingArchitect.token,
    body: { amount: 1000, message: 'Cuenta pendiente no postula.' },
  })).status, 403);
  assert.equal((await api('POST', `/reviews/${openReview.payload.review.id}/applications`, {
    token: authorizedArchitect.token,
    body: { amount: 3000, message: 'Experiencia en vivienda modular.' },
  })).status, 201);
  assert.equal((await api('POST', `/reviews/${openReview.payload.review.id}/applications`, {
    token: authorizedArchitect.token,
    body: { amount: 3100, message: 'Postulación repetida.' },
  })).status, 409);
  assert.equal((await api('POST', `/reviews/${openReview.payload.review.id}/applications`, {
    token: otherArchitect.token,
    body: { amount: 2800, message: 'Revisión de estructura.' },
  })).status, 201);
  const openForArchitect = await api('GET', '/architect/reviews', { token: authorizedArchitect.token });
  assert.ok(openForArchitect.payload.reviews.some((item) => item.id === openReview.payload.review.id));
  const openForOtherArchitect = await api('GET', '/architect/reviews', { token: otherArchitect.token });
  assert.ok(openForOtherArchitect.payload.reviews.some((item) => item.id === openReview.payload.review.id));
  const openClientView = await api('GET', `/projects/${openProject.id}/reviews`, { token: client.token });
  const openClientReview = openClientView.payload.reviews.find((item) => item.id === openReview.payload.review.id);
  assert.equal(openClientReview.applications.length, 2);
  assert.ok(openClientReview.applications.every((application) => application.architect.nombre));
  const selectedApplication = openClientReview.applications.find(
    (application) => application.architect.id === otherArchitect.user.id,
  );
  const assignedOpenReview = await api(
    'POST',
    `/projects/${openProject.id}/reviews/${openReview.payload.review.id}/assign`,
    { token: client.token, body: { applicationId: selectedApplication.id } },
  );
  assert.equal(assignedOpenReview.status, 200, JSON.stringify(assignedOpenReview.payload));
  assert.equal(assignedOpenReview.payload.review.status, 'assigned');
  const assignedApplications = assignedOpenReview.payload.review.applications;
  assert.equal(assignedApplications.filter((application) => application.status === 'closed').length, 1);
  assert.equal((await api('POST', `/reviews/${openReview.payload.review.id}/start`, {
    token: authorizedArchitect.token,
  })).status, 409);
  assert.equal((await api('POST', `/reviews/${openReview.payload.review.id}/start`, {
    token: stillPendingArchitect.token,
  })).status, 403);
  assert.equal((await api('POST', `/projects/${openProject.id}/reviews/${openReview.payload.review.id}/rating`, {
    token: client.token,
    body: { rating: 5 },
  })).status, 409);
  assert.equal((await api('POST', `/reviews/${openReview.payload.review.id}/start`, {
    token: otherArchitect.token,
  })).status, 204);
  assert.equal((await api('POST', `/reviews/${openReview.payload.review.id}/observations`, {
    token: otherArchitect.token,
    body: { observation: 'Dictamen técnico emitido.' },
  })).status, 201);
  assert.equal((await api('POST', `/reviews/${openReview.payload.review.id}/deliver`, {
    token: otherArchitect.token,
    body: {
      dictamen: 'approved_with_observations',
      observation: 'Recomendable con ajuste de ventilación.',
    },
  })).status, 204);
  assert.equal((await api('POST', `/reviews/${openReview.payload.review.id}/deliver`, {
    token: otherArchitect.token,
    body: {
      dictamen: 'requires_adjustments',
      observation: 'No debe poder duplicarse.',
    },
  })).status, 409);
  const deliveredReviewList = await api('GET', `/projects/${openProject.id}/reviews`, { token: client.token });
  const deliveredReview = deliveredReviewList.payload.reviews.find(
    (item) => item.id === openReview.payload.review.id,
  );
  assert.equal(deliveredReview.status, 'delivered');
  assert.equal(deliveredReview.dictamen, 'approved_with_observations');
  assert.equal(deliveredReview.dictamenObservation, 'Recomendable con ajuste de ventilación.');
  assert.ok(deliveredReviewList.payload.observations.some(
    (item) => item.reviewId === openReview.payload.review.id
      && item.observation === 'Recomendable con ajuste de ventilación.',
  ));
  assert.equal((await api('POST', `/projects/${openProject.id}/reviews/${openReview.payload.review.id}/rating`, {
    token: client2.token,
    body: { rating: 5 },
  })).status, 404);
  assert.equal((await api('POST', `/projects/${openProject.id}/reviews/${openReview.payload.review.id}/rating`, {
    token: client.token,
    body: { rating: 6 },
  })).status, 400);
  assert.equal((await api('POST', `/projects/${openProject.id}/reviews/${openReview.payload.review.id}/rating`, {
    token: client.token,
    body: { rating: 5 },
  })).status, 204);
  assert.equal((await api('POST', `/projects/${openProject.id}/reviews/${openReview.payload.review.id}/rating`, {
    token: client.token,
    body: { rating: 4 },
  })).status, 409);
  const secondRatingProject = await createSelectedProject('Second rated review project');
  const secondRatedReview = await api('POST', `/projects/${secondRatingProject.id}/reviews`, {
    token: client.token,
    body: { mode: 'directed', architectId: otherArchitect.user.id },
  });
  assert.equal(secondRatedReview.status, 201);
  assert.equal((await api('POST', `/reviews/${secondRatedReview.payload.review.id}/accept`, {
    token: otherArchitect.token,
  })).status, 200);
  assert.equal((await api('POST', `/reviews/${secondRatedReview.payload.review.id}/start`, {
    token: otherArchitect.token,
  })).status, 204);
  assert.equal((await api('POST', `/reviews/${secondRatedReview.payload.review.id}/deliver`, {
    token: otherArchitect.token,
    body: { dictamen: 'requires_adjustments', observation: 'Ajustar el acceso.' },
  })).status, 204);
  assert.equal((await api('POST', `/projects/${secondRatingProject.id}/reviews/${secondRatedReview.payload.review.id}/rating`, {
    token: client.token,
    body: { rating: 3 },
  })).status, 204);
  const ratedProfile = await api('GET', '/architect/profile', { token: otherArchitect.token });
  assert.equal(ratedProfile.payload.profile.ratingAverage, 4);
  assert.equal(ratedProfile.payload.profile.ratingCount, 2);
  assert.equal((await api('GET', `/projects/${openProject.id}/reviews`, { token: client2.token })).status, 404);
  const concurrentProject = await createSelectedProject('Concurrent review project');
  const concurrentRequests = await Promise.all([
    api('POST', `/projects/${concurrentProject.id}/reviews`, {
      token: client.token,
      body: { mode: 'open' },
    }),
    api('POST', `/projects/${concurrentProject.id}/reviews`, {
      token: client.token,
      body: { mode: 'open' },
    }),
  ]);
  assert.deepEqual(
    concurrentRequests.map((result) => result.status).sort(),
    [201, 409],
  );
  const concurrentReview = concurrentRequests.find((result) => result.status === 201);
  assert.equal((await api('POST', `/projects/${concurrentProject.id}/reviews/${concurrentReview.payload.review.id}/cancel`, {
    token: client.token,
  })).status, 204);

  const service = await api('POST', '/contractor/services', {
    token: authorizedContractor.token,
    body: {
      name: `Servicio ${runId}`,
      category: 'paneleria',
      description: 'Panelería modular y montaje.',
      type: 'servicio',
      unit: 'm²',
      availability: 'disponible',
      price: 120000,
    },
  });
  assert.equal(service.status, 201, JSON.stringify(service.payload));
  assert.equal((await api('GET', '/contractor/services', {
    token: (await login(otherContractorEmail)).token,
  })).payload.services.length, 0);
  const service2 = await api('POST', '/contractor/services', {
    token: (await login(otherContractorEmail)).token,
    body: {
      name: 'Otro',
      category: 'montaje',
      description: 'Servicio de otra empresa.',
      type: 'servicio',
      unit: 'unidad',
      availability: 'disponible',
      price: 1000,
    },
  });
  assert.equal(service2.status, 201);
  assert.equal((await api('PATCH', `/contractor/services/${service.payload.service.id}`, {
    token: (await login(otherContractorEmail)).token,
    body: { name: 'Servicio ajeno', category: 'fraude', description: 'No autorizado.' },
  })).status, 404);
  assert.equal((await api('PATCH', `/contractor/services/${service.payload.service.id}`, {
    token: client.token,
    body: { name: 'Manipulación', category: 'fraude', description: 'No autorizado.' },
  })).status, 403);
  const publicServices = await api('GET', '/services');
  assert.ok(publicServices.payload.services.some((item) => item.id === service.payload.service.id));

  const quote = await api('POST', `/projects/${project.payload.project.id}/quotes`, {
    token: client.token,
    body: { constructorId: authorizedContractor.user.id, serviceId: service.payload.service.id },
  });
  assert.equal(quote.status, 201, JSON.stringify(quote.payload));
  assert.equal((await api('GET', '/contractor/quotes', {
    token: (await login(otherContractorEmail)).token,
  })).payload.quotes.length, 0);
  const contractorQuotes = await api('GET', '/contractor/quotes', {
    token: authorizedContractor.token,
  });
  const contractorQuote = contractorQuotes.payload.quotes.find(
    (item) => item.id === quote.payload.quote.id,
  );
  assert.equal(contractorQuote.project.terrain.ubicacion, `stage3 terrain ${runId}`);
  assert.equal(contractorQuote.project.terrain.ancho, 12);
  assert.equal(contractorQuote.project.terrain.largo, 20);
  assert.ok(contractorQuote.proposal);
  assert.equal((await api('POST', `/projects/${project.payload.project.id}/quotes`, {
    token: client.token,
    body: { constructorId: authorizedContractor.user.id },
  })).status, 409);
  assert.equal((await api('GET', `/projects/${project.payload.project.id}/quotes`, { token: client2.token })).status, 404);
  const quoteResponse = await api('PATCH', `/contractor/quotes/${quote.payload.quote.id}`, {
    token: authorizedContractor.token,
    body: {
      items: [{ concept: 'Fabricación y montaje', quantity: 1, unitPrice: 215000 }],
      currency: 'COP',
      estimatedDays: 45,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      message: 'Cotización de prueba',
    },
  });
  assert.equal(quoteResponse.status, 200);
  assert.equal((await api('PATCH', `/contractor/quotes/${quote.payload.quote.id}`, {
    token: (await login(otherContractorEmail)).token,
    body: {
      items: [{ concept: 'Manipulación', quantity: 1, unitPrice: 1 }],
      estimatedDays: 1,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })).status, 404);

  const key = `stage3-order-${runId}`;
  const order = await api('POST', `/projects/${project.payload.project.id}/orders`, {
    token: client.token,
    headers: { 'Idempotency-Key': key },
    body: { quoteId: quote.payload.quote.id },
  });
  assert.equal(order.status, 201, JSON.stringify(order.payload));
  assert.equal(order.payload.order.amount, 215000);
  assert.equal(order.payload.order.paymentStatus, 'created');
  const simulationSession = await api('POST', `/orders/${order.payload.order.id}/payment-session`, {
    token: client.token,
    body: {},
  });
  assert.equal(simulationSession.status, 200);
  assert.equal(simulationSession.payload.session.simulated, true);
  assert.equal((await api('POST', `/payments/${simulationSession.payload.session.paymentId}/resolve`, {
    token: client.token,
    body: { method: 'test_card', result: 'approved' },
  })).status, 200);
  const duplicateOrder = await api('POST', `/projects/${project.payload.project.id}/orders`, {
    token: client.token,
    headers: { 'Idempotency-Key': key },
    body: { quoteId: quote.payload.quote.id },
  });
  assert.equal(duplicateOrder.status, 201);
  assert.equal(duplicateOrder.payload.order.id, order.payload.order.id);
  assert.equal((await api('POST', `/projects/${project.payload.project.id}/orders`, {
    token: client.token,
    headers: { 'Idempotency-Key': `different-key-${runId}` },
    body: { quoteId: quote.payload.quote.id },
  })).status, 409);
  assert.equal((await api('POST', `/payments/${order.payload.order.paymentId}/confirm`, {
    token: client.token,
    body: { status: 'paid' },
  })).status, 403);
  assert.equal((await api('GET', '/orders', { token: client.token })).payload.orders.length, 1);
  assert.equal((await database.getDb().collection('orders').countDocuments({ ownerId: (await database.getDb().collection('users').findOne({ correo: clientEmail }))._id })).toString(), '1');

  const overview = await api('GET', '/admin/overview', { token: admin.token });
  assert.equal(overview.status, 200);
  assert.ok(overview.payload.overview.users >= 7);
  for (const path of ['/admin/projects', '/admin/orders', '/admin/reviews', '/admin/services', '/admin/quotes', '/admin/payments']) {
    const result = await api('GET', path, { token: admin.token });
    assert.equal(result.status, 200, `${path}: ${JSON.stringify(result.payload)}`);
  }
  assert.equal((await api('GET', '/admin/audit', { token: admin.token })).payload.events.length >= 5, true);
  const closeForOtherClient = await api('PATCH', `/projects/${project.payload.project.id}/close`, {
    token: client2.token,
  });
  assert.equal(closeForOtherClient.status, 404);
  const closedProject = await api('PATCH', `/projects/${project.payload.project.id}/close`, {
    token: client.token,
  });
  assert.equal(closedProject.status, 200);
  assert.equal(closedProject.payload.project.estado, 'Cerrado');
  assert.ok(closedProject.payload.project.fecha_cierre);
  const persistedProject = await database.getDb().collection('projects').findOne({
    _id: new ObjectId(project.payload.project.id),
  });
  assert.equal(persistedProject.estado, 'Cerrado');
  const originalCloseDate = persistedProject.fechaCierre;
  const repeatedClose = await api('PATCH', `/projects/${project.payload.project.id}/close`, {
    token: client.token,
  });
  assert.equal(repeatedClose.status, 200);
  assert.equal(new Date(repeatedClose.payload.project.fecha_cierre).getTime(), originalCloseDate.getTime());
  assert.equal((await database.getDb().collection('projects').findOne({
    _id: new ObjectId(project.payload.project.id),
  })).fechaCierre.getTime(), originalCloseDate.getTime());
  const adminUsers = await api('GET', '/admin/users', { token: admin.token });
  assert.equal(adminUsers.status, 200);
  assert.equal(adminUsers.payload.users.some((user) => 'passwordHash' in user), false);
  const disableClient = await api('PATCH', `/admin/users/${client2.user.id}/status`, {
    token: admin.token,
    body: { status: 'disabled' },
  });
  assert.equal(disableClient.status, 200);
  assert.equal((await api('GET', '/admin/overview', { token: client2.token })).status, 403);
  assert.equal((await api('POST', '/auth/login', {
    body: { correo: `admin-hijack.${runId}@example.invalid`, password },
  })).status, 403);
});
