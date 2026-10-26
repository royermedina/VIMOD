function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function paidOrderTimestamp(record) {
  const values = [
    record && record.payment && record.payment.updatedAt,
    record && record.order && record.order.paidAt,
    record && record.order && record.order.updatedAt,
    record && record.order && record.order.createdAt,
  ];
  for (const value of values) {
    if (!value) continue;
    const date = normalizeDate(value);
    if (date) return date;
  }
  return null;
}

function mostRecentPaidOrder(records) {
  return [...records].sort((first, second) => {
    const firstTime = paidOrderTimestamp(first);
    const secondTime = paidOrderTimestamp(second);
    return (secondTime ? secondTime.getTime() : 0) - (firstTime ? firstTime.getTime() : 0);
  })[0] || null;
}

function isPaidOrder(order, payment) {
  return Boolean(order && (
    order.paymentStatus === 'approved'
    || order.orderStatus === 'paid'
    || (payment && payment.status === 'approved')
  ));
}

function contractedProjectFields(paymentState, provider, paidAt) {
  return {
    contracted: true,
    contractedProposalId: paymentState.proposalId || null,
    contractedOfferId: paymentState.offerId || null,
    contractedContractorId: paymentState.contractorId || null,
    contractedOrderId: paymentState.orderId,
    contractedAmount: paymentState.amount,
    contractedPaidAt: paymentState.paidAt || paidAt,
    contractedProvider: paymentState.provider || provider || 'internal_simulation',
    offersOpen: false,
    estado: 'Contratado',
    updatedAt: paidAt,
  };
}

function normalizeProjectInput(data = {}) {
  const nombre = typeof data.nombre === 'string' ? data.nombre.trim() : '';
  const terrainId = typeof data.terrain_id === 'string' ? data.terrain_id.trim() : '';
  const presupuesto = data.presupuesto === undefined || data.presupuesto === null || data.presupuesto === ''
    ? NaN
    : Number(data.presupuesto);
  const habitaciones = Number(data.habitaciones);
  const banos = Number(data.banos);
  if (!nombre) return { error: 'El nombre del proyecto es obligatorio' };
  if (nombre.length > 120) return { error: 'El nombre no puede superar los 120 caracteres' };
  if (!terrainId) return { error: 'terrain_id es obligatorio' };
  if (!Number.isFinite(presupuesto) || presupuesto <= 0) {
    return { error: 'El presupuesto debe ser mayor que cero' };
  }
  if (!Number.isInteger(habitaciones) || habitaciones < 1 || habitaciones > 6) {
    return { error: 'Las habitaciones deben ser un número entero entre 1 y 6' };
  }
  if (!Number.isInteger(banos) || banos < 1 || banos > 6) {
    return { error: 'Los baños deben ser un número entero entre 1 y 6' };
  }
  return { value: { terrainId, nombre, presupuesto, habitaciones, banos } };
}

function normalizeTerrainInput(data = {}) {
  const ubicacion = typeof data.ubicacion === 'string' ? data.ubicacion.trim() : '';
  const ancho = Number(data.ancho);
  const largo = Number(data.largo);
  if (!ubicacion) return { error: 'La ubicación es obligatoria' };
  if (!Number.isFinite(ancho) || ancho <= 0 || !Number.isFinite(largo) || largo <= 0) {
    return { error: 'Las dimensiones deben ser mayores que cero' };
  }
  return { value: { ubicacion, ancho, largo } };
}

function validateProjectNeeds(project) {
  if (!Number.isFinite(Number(project.presupuesto)) || Number(project.presupuesto) <= 0) {
    return 'El proyecto no tiene un presupuesto válido para analizar';
  }
  if (!Number.isInteger(project.habitaciones) || project.habitaciones < 1 || project.habitaciones > 6) {
    return 'El proyecto no tiene habitaciones válidas para analizar';
  }
  if (!Number.isInteger(project.banos) || project.banos < 1 || project.banos > 6) {
    return 'El proyecto no tiene baños válidos para analizar';
  }
  return null;
}

module.exports = {
  normalizeDate,
  paidOrderTimestamp,
  mostRecentPaidOrder,
  isPaidOrder,
  contractedProjectFields,
  normalizeProjectInput,
  normalizeTerrainInput,
  validateProjectNeeds,
};
