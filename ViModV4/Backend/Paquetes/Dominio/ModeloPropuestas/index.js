function proposalCostInCop(proposal) {
  if (!proposal || !proposal.estimate || proposal.estimate.currency !== 'COP') return null;
  const amount = Number(proposal.estimate.costCop);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function calculateProposalCost(model, bedrooms, bathrooms) {
  return Math.round(Number(model.baseCostCop)
    + bedrooms * Number(model.costPerBedroomCop || 0)
    + bathrooms * Number(model.costPerBathroomCop || 0));
}

module.exports = {
  proposalCostInCop,
  calculateProposalCost,
  modularCatalog: require('./modular-catalog'),
};
