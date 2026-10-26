const OFFER_STATUS = Object.freeze({
  SUBMITTED: 'enviada',
  ACCEPTED: 'aceptada',
  REJECTED: 'rechazada',
});

const QUOTE_STATUS = Object.freeze({
  PENDING: 'pending',
  SUBMITTED: 'submitted',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
});

function isPositiveCopAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function normalizeOfferInput(data = {}) {
  const price = Number(data.precio);
  const plazoDias = Number(data.plazoDias);
  if (!isPositiveCopAmount(price)) return { error: 'El precio debe ser mayor que cero' };
  if (!Number.isInteger(plazoDias) || plazoDias < 1 || plazoDias > 3650) {
    return { error: 'El plazo debe ser un entero entre 1 y 3650 días' };
  }
  const inclusiones = Array.isArray(data.inclusiones)
    ? data.inclusiones.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
    : [];
  if (inclusiones.length > 20 || inclusiones.some((item) => item.length > 160)) {
    return { error: 'Las inclusiones no son válidas' };
  }
  return {
    value: {
      precio: Math.round(price * 100) / 100,
      plazoDias,
      inclusiones,
    },
  };
}

function normalizeAdvisorRequest(data = {}) {
  const topic = typeof data.topic === 'string' ? data.topic.trim() : '';
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  const contactMethod = typeof data.contactMethod === 'string'
    ? data.contactMethod.trim().toLowerCase() : 'email';
  const contact = typeof data.contact === 'string' ? data.contact.trim() : '';
  if (!topic || topic.length > 120) {
    return { error: 'El motivo debe tener entre 1 y 120 caracteres' };
  }
  if (!message || message.length < 10 || message.length > 2000) {
    return { error: 'La descripción debe tener entre 10 y 2000 caracteres' };
  }
  if (!['email', 'phone'].includes(contactMethod)) {
    return { error: 'El medio de contacto no es válido' };
  }
  if (contact.length > 160) {
    return { error: 'El contacto no puede superar 160 caracteres' };
  }
  return { value: { topic, message, contactMethod, contact } };
}

function canTransitionQuote(from, to) {
  const transitions = {
    requested: ['responded', 'rejected', 'expired', 'cancelled'],
    responded: ['accepted', 'rejected', 'expired', 'cancelled'],
    accepted: [],
    rejected: [],
    expired: [],
    cancelled: [],
  };
  return Boolean(transitions[from] && transitions[from].includes(to));
}

module.exports = {
  OFFER_STATUS,
  QUOTE_STATUS,
  isPositiveCopAmount,
  normalizeOfferInput,
  normalizeAdvisorRequest,
  canTransitionQuote,
};
