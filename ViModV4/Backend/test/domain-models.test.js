const test = require('node:test');
const assert = require('node:assert/strict');
const {
  convertCopToUsdCents,
  PAYMENT_STATUS,
  isValidIdempotencyKey,
  simulationTransition,
} = require('../Paquetes/Dominio/ModeloPagos');
const {
  normalizeRole,
  ROLES,
  isApprovedContractor,
  isPendingRoleRequest,
} = require('../Paquetes/Dominio/Usuarios');
const {
  mostRecentPaidOrder,
  isPaidOrder,
  contractedProjectFields,
  normalizeProjectInput,
  normalizeTerrainInput,
  validateProjectNeeds,
} = require('../Paquetes/Dominio/ModeloProyectos');
const { proposalCostInCop, calculateProposalCost, modularCatalog } = require('../Paquetes/Dominio/ModeloPropuestas');
const {
  normalizeOfferInput,
  normalizeAdvisorRequest,
  canTransitionQuote,
} = require('../Paquetes/Dominio/ModeloComercial');
const { canTransitionReview, isReviewEligible } = require('../Paquetes/Dominio/ModeloRevisiones');

test('domain models expose pure role, proposal, payment and contracted-state rules', () => {
  assert.deepEqual(ROLES, ['cliente', 'arquitecto', 'constructora', 'admin']);
  assert.equal(normalizeRole(' Administrador '), 'admin');
  assert.equal(proposalCostInCop({ estimate: { currency: 'COP', costCop: '90000000' } }), 90000000);
  assert.equal(proposalCostInCop({ estimate: { currency: 'USD', costCop: 90000000 } }), null);
  assert.equal(convertCopToUsdCents(90000000, 4000), 2250000);
  assert.equal(PAYMENT_STATUS.APPROVED, 'approved');
  assert.equal(isValidIdempotencyKey('payment-request-001'), true);
  assert.equal(isValidIdempotencyKey('bad key'), false);
  assert.deepEqual(simulationTransition('approved'), { paymentStatus: 'approved', orderStatus: 'paid' });
  assert.equal(simulationTransition('unknown'), null);
  assert.equal(isApprovedContractor({ requestedRole: 'constructora', accountStatus: 'approved' }), true);
  assert.equal(isPendingRoleRequest({ accountStatus: 'pending' }), false);
  assert.deepEqual(normalizeProjectInput({
    nombre: ' Casa ', terrain_id: 'terrain-id', presupuesto: '300000000', habitaciones: '4', banos: '3',
  }).value, {
    nombre: 'Casa', terrainId: 'terrain-id', presupuesto: 300000000, habitaciones: 4, banos: 3,
  });
  assert.equal(normalizeProjectInput({
    nombre: 'Casa', terrain_id: 'terrain-id', presupuesto: 300000000, habitaciones: 4, banos: 1.5,
  }).error, 'Los baños deben ser un número entero entre 1 y 6');
  assert.deepEqual(normalizeTerrainInput({ ubicacion: ' Norte ', ancho: 10, largo: 20 }).value, {
    ubicacion: 'Norte', ancho: 10, largo: 20,
  });
  assert.equal(validateProjectNeeds({
    presupuesto: 300000000, habitaciones: 4, banos: 3,
  }), null);
  assert.equal(calculateProposalCost({
    baseCostCop: 100, costPerBedroomCop: 10, costPerBathroomCop: 5,
  }, 4, 3), 155);
  assert.equal(modularCatalog.currency, 'COP');
  assert.equal(normalizeOfferInput({ precio: 1000, plazoDias: 30 }).value.precio, 1000);
  assert.equal(normalizeAdvisorRequest({
    topic: 'Ayuda', message: 'Necesito asesoría', contactMethod: 'email', contact: '',
  }).value.contactMethod, 'email');
  assert.equal(canTransitionQuote('responded', 'accepted'), true);
  assert.equal(canTransitionQuote('accepted', 'responded'), false);
  assert.equal(canTransitionReview('in_progress', 'completed'), true);
  assert.equal(isReviewEligible({ selectedProposalId: 'proposal' }, null), true);
  assert.equal(isReviewEligible({ selectedProposalId: 'old' }, { paid: true, proposalId: null }), false);

  const older = { order: { createdAt: '2026-01-01T00:00:00Z' }, payment: null };
  const newer = { order: { createdAt: '2026-02-01T00:00:00Z' }, payment: null };
  assert.equal(mostRecentPaidOrder([older, newer]), newer);
  assert.equal(isPaidOrder({ orderStatus: 'paid' }, null), true);
  assert.equal(isPaidOrder({ orderStatus: 'awaiting_payment' }, { status: 'pending' }), false);
  assert.deepEqual(contractedProjectFields({
    proposalId: 'proposal-id',
    offerId: null,
    contractorId: null,
    orderId: 'order-id',
    amount: 90000000,
    paidAt: new Date('2026-02-01T00:00:00Z'),
    provider: 'stripe',
  }, 'internal_simulation', new Date('2026-02-01T00:00:00Z')), {
    contracted: true,
    contractedProposalId: 'proposal-id',
    contractedOfferId: null,
    contractedContractorId: null,
    contractedOrderId: 'order-id',
    contractedAmount: 90000000,
    contractedPaidAt: new Date('2026-02-01T00:00:00Z'),
    contractedProvider: 'stripe',
    offersOpen: false,
    estado: 'Contratado',
    updatedAt: new Date('2026-02-01T00:00:00Z'),
  });
});
