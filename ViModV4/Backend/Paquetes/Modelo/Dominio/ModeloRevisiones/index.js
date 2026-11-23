const REVIEW_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  ASSIGNED: 'assigned',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
});

const REVIEW_CRITERIA = Object.freeze([
  Object.freeze({ id: 'structure', label: 'Cimentación y estructura' }),
  Object.freeze({ id: 'functionality', label: 'Distribución y funcionalidad' }),
  Object.freeze({ id: 'regulations', label: 'Cumplimiento normativo (NSR-10)' }),
  Object.freeze({ id: 'budget', label: 'Presupuesto coherente' }),
  Object.freeze({ id: 'terrain', label: 'Adecuación al terreno' }),
]);

const REVIEW_CRITERIA_STATUSES = Object.freeze([
  'complies',
  'complies_with_observations',
  'not_compliant',
]);

function validateReviewVerdict(opinion, criteria) {
  if (criteria === undefined) return { criteria: null };
  if (!Array.isArray(criteria) || criteria.length !== REVIEW_CRITERIA.length) {
    return { error: 'El dictamen debe incluir los cinco criterios técnicos' };
  }

  const byId = new Map(criteria.map((criterion) => [criterion && criterion.id, criterion]));
  if (byId.size !== REVIEW_CRITERIA.length
    || REVIEW_CRITERIA.some((criterion) => !byId.has(criterion.id))) {
    return { error: 'Los criterios técnicos están incompletos o repetidos' };
  }

  const normalized = [];
  for (const criterion of REVIEW_CRITERIA) {
    const submitted = byId.get(criterion.id);
    const comment = typeof submitted.comment === 'string' ? submitted.comment.trim() : '';
    if (!REVIEW_CRITERIA_STATUSES.includes(submitted.status)) {
      return { error: 'Selecciona un estado para cada criterio técnico' };
    }
    if (comment.length > 1000) {
      return { error: 'Los comentarios de los criterios no pueden superar 1000 caracteres' };
    }
    normalized.push({
      id: criterion.id,
      label: criterion.label,
      status: submitted.status,
      comment,
    });
  }

  const nonCompliant = normalized.filter((criterion) => criterion.status === 'not_compliant');
  if (opinion === 'approved' && normalized.some((criterion) => criterion.status !== 'complies')) {
    return { error: 'Un dictamen aprobado requiere que todos los criterios cumplan' };
  }
  if (opinion === 'approved_with_observations'
    && nonCompliant.some((criterion) => !criterion.comment)) {
    return { error: 'Agrega una observación a cada criterio que no cumple' };
  }
  return { criteria: normalized };
}

function canTransitionReview(from, to) {
  const transitions = {
    pending: ['in_progress', 'assigned', 'cancelled', 'rejected'],
    in_progress: ['assigned', 'completed', 'cancelled', 'rejected'],
    assigned: ['in_progress', 'completed', 'cancelled', 'rejected'],
    completed: [],
    cancelled: [],
    rejected: [],
  };
  return Boolean(transitions[from] && transitions[from].includes(to));
}

function isReviewEligible(project, paymentState) {
  return Boolean(project && (paymentState && paymentState.paid
    ? paymentState.proposalId
    : project.selectedProposalId));
}

module.exports = {
  REVIEW_STATUS,
  REVIEW_CRITERIA,
  REVIEW_CRITERIA_STATUSES,
  validateReviewVerdict,
  canTransitionReview,
  isReviewEligible,
};
