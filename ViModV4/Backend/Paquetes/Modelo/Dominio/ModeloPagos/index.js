const ORDER_STATUS = Object.freeze({
  AWAITING_PAYMENT: 'awaiting_payment',
  AWAITING_PAYMENT_CONFIGURATION: 'awaiting_payment_configuration',
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_CANCELLED: 'payment_cancelled',
  PAYMENT_EXPIRED: 'payment_expired',
  PAID: 'paid',
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});
const RETRYABLE_ORDER_STATUSES = Object.freeze([
  ORDER_STATUS.AWAITING_PAYMENT,
  ORDER_STATUS.AWAITING_PAYMENT_CONFIGURATION,
  ORDER_STATUS.PAYMENT_PENDING,
  ORDER_STATUS.PAYMENT_FAILED,
  ORDER_STATUS.PAYMENT_CANCELLED,
  ORDER_STATUS.PAYMENT_EXPIRED,
]);
const SIMULATION_SESSION_ORDER_STATUSES = Object.freeze([
  ORDER_STATUS.AWAITING_PAYMENT,
  ORDER_STATUS.AWAITING_PAYMENT_CONFIGURATION,
  ORDER_STATUS.PAYMENT_PENDING,
  ORDER_STATUS.PAYMENT_FAILED,
  ORDER_STATUS.PAYMENT_CANCELLED,
]);

function isValidIdempotencyKey(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,100}$/.test(value);
}

function simulationTransition(result) {
  const transitions = {
    approved: { paymentStatus: PAYMENT_STATUS.APPROVED, orderStatus: ORDER_STATUS.PAID },
    declined: { paymentStatus: PAYMENT_STATUS.DECLINED, orderStatus: ORDER_STATUS.PAYMENT_FAILED },
    cancelled: { paymentStatus: PAYMENT_STATUS.CANCELLED, orderStatus: ORDER_STATUS.PAYMENT_CANCELLED },
    pending: { paymentStatus: PAYMENT_STATUS.PENDING, orderStatus: ORDER_STATUS.PAYMENT_PENDING },
  };
  return transitions[result] || null;
}

function convertCopToUsdCents(amountCop, copPerUsd) {
  const amount = Number(amountCop);
  const rate = Number(copPerUsd);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RangeError('El importe en COP debe ser positivo');
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new RangeError('COP_PER_USD debe ser una tasa positiva');
  }
  return Math.round((amount / rate) * 100);
}

module.exports = {
  ORDER_STATUS,
  PAYMENT_STATUS,
  RETRYABLE_ORDER_STATUSES,
  SIMULATION_SESSION_ORDER_STATUSES,
  convertCopToUsdCents,
  isValidIdempotencyKey,
  simulationTransition,
};
