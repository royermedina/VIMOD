const { getRuntimeConfig } = require('../../../Nucleo');
const { isApprovedContractor: isApprovedContractorUser, resolveUserRole } = require('../../Dominio/Usuarios');

function resolveRole(user) {
  return resolveUserRole(user, getRuntimeConfig().roleAssignments);
}

function isApprovedContractor(user) {
  return isApprovedContractorUser(user, getRuntimeConfig().roleAssignments);
}

module.exports = { resolveRole, isApprovedContractor };