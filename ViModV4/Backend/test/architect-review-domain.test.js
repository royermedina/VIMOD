const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  REVIEW_CRITERIA,
  validateReviewVerdict,
} = require('../Paquetes/Modelo/Dominio/ModeloRevisiones');

function criteria(status = 'complies', comment = '') {
  return REVIEW_CRITERIA.map((criterion) => ({
    id: criterion.id,
    status,
    comment,
  }));
}

test('structured reviews reject inconsistent approval and require notes for noncompliant criteria', () => {
  assert.equal(validateReviewVerdict('approved', criteria()).error, undefined);
  const noncompliant = criteria();
  noncompliant[0].status = 'not_compliant';
  assert.match(validateReviewVerdict('approved', noncompliant).error, /todos los criterios/);
  assert.match(
    validateReviewVerdict('approved_with_observations', noncompliant).error,
    /Agrega una observación/,
  );
  noncompliant[0].comment = 'Requiere ajuste de cálculo.';
  assert.equal(validateReviewVerdict('approved_with_observations', noncompliant).error, undefined);
});

test('legacy opinions without structured criteria remain accepted', () => {
  assert.deepEqual(validateReviewVerdict('requires_adjustments', undefined), { criteria: null });
});
