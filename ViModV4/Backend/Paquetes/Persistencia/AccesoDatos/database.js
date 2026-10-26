const { MongoClient } = require('mongodb');
const { getRuntimeConfig } = require('../../../Nucleo/runtime-config');

let settings = {
  mongodbUri: 'mongodb://127.0.0.1:27021',
  mongodbDatabase: 'vimod',
};

let client;
let database;

async function connect(options = {}) {
  if (database) return database;

  const runtimeConfig = getRuntimeConfig();
  settings = {
    ...settings,
    mongodbUri: runtimeConfig.mongodbUri,
    mongodbDatabase: runtimeConfig.mongodbDatabase,
    ...options,
  };
  client = new MongoClient(settings.mongodbUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  database = client.db(settings.mongodbDatabase);

  await Promise.all([
    database.collection('users').createIndex(
      { correo: 1 },
      { unique: true, name: 'users_correo_unique' },
    ),
    database.collection('terrains').createIndex(
      { ownerId: 1, createdAt: -1 },
      { name: 'terrains_owner_created' },
    ),
    database.collection('projects').createIndex(
      { ownerId: 1, createdAt: -1 },
      { name: 'projects_owner_created' },
    ),
    database.collection('projects').createIndex(
      { terrainId: 1 },
      { name: 'projects_terrain' },
    ),
    database.collection('advisorRequests').createIndex(
      { ownerId: 1, status: 1, createdAt: -1 },
      { name: 'advisor_requests_owner_status_created' },
    ),
    database.collection('advisorRequests').createIndex(
      { ownerId: 1, projectId: 1 },
      {
        unique: true,
        name: 'advisor_requests_active_owner_project_unique',
        partialFilterExpression: { status: { $in: ['pending', 'in_progress'] } },
      },
    ),
    database.collection('projectAnalyses').createIndex(
      { ownerId: 1, projectId: 1 },
      { unique: true, name: 'analysis_owner_project_unique' },
    ),
    database.collection('proposals').createIndex(
      { ownerId: 1, projectId: 1, inputFingerprint: 1, code: 1 },
      { unique: true, name: 'proposal_project_fingerprint_code_unique' },
    ),
    database.collection('proposals').createIndex(
      { ownerId: 1, projectId: 1, inputFingerprint: 1 },
      { name: 'proposal_project_generation' },
    ),
    database.collection('proposalModels').createIndex(
      { contractorId: 1, modelKey: 1 },
      { unique: true, name: 'proposal_models_contractor_key_unique' },
    ),
    database.collection('proposalModels').createIndex(
      { seed: 1, seedBatch: 1 },
      { name: 'proposal_models_seed_batch' },
    ),
    database.collection('offers').createIndex(
      { projectId: 1, contractorId: 1, active: 1 },
      {
        unique: true,
        name: 'offers_active_project_contractor_unique',
        partialFilterExpression: { active: true },
      },
    ),
    database.collection('offers').createIndex(
      { projectId: 1, createdAt: -1 },
      { name: 'offers_project_created' },
    ),
    database.collection('reviewRequests').createIndex(
      { projectId: 1, ownerId: 1, active: 1 },
      {
        unique: true,
        name: 'review_active_project_unique',
        partialFilterExpression: { active: true },
      },
    ),
    database.collection('quoteRequests').createIndex(
      { projectId: 1, ownerId: 1, contractorId: 1, active: 1 },
      {
        unique: true,
        name: 'quote_active_project_contractor_unique',
        partialFilterExpression: { active: true },
      },
    ),
    database.collection('orders').createIndex(
      { ownerId: 1, idempotencyKey: 1 },
      { unique: true, name: 'orders_owner_idempotency_unique' },
    ),
    database.collection('orders').createIndex(
      { ownerId: 1, projectId: 1, proposalId: 1, quoteId: 1, active: 1 },
      {
        unique: true,
        name: 'orders_active_offer_unique',
        partialFilterExpression: { active: true },
      },
    ),
    database.collection('payments').createIndex(
      { orderId: 1 },
      { unique: true, name: 'payments_order_unique' },
    ),
    database.collection('payments').createIndex(
      { reference: 1 },
      {
        unique: true,
        partialFilterExpression: { reference: { $type: 'string' } },
        name: 'payments_simulation_reference_unique',
      },
    ),
  ]);

  return database;
}

function getDb() {
  if (!database) throw new Error('MongoDB todavía no está conectado');
  return database;
}

async function ping() {
  if (!database) return false;
  try {
    await database.command({ ping: 1 });
    return true;
  } catch (error) {
    return false;
  }
}

async function close() {
  if (!client) return;
  const currentClient = client;
  client = null;
  database = null;
  await currentClient.close();
}

module.exports = { connect, getDb, ping, close };
