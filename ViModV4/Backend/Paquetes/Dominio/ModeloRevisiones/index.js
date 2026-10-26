const REVIEW_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  ASSIGNED: 'assigned',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
});

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

module.exports = { REVIEW_STATUS, canTransitionReview, isReviewEligible };
