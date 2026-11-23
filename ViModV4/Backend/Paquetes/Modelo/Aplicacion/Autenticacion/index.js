const AuthService = require('./auth-service');
const roleAssignments = require('./role-assignments');

module.exports = {
  AuthService,
  ...roleAssignments,
  verifyToken: AuthService.verifyToken,
};
