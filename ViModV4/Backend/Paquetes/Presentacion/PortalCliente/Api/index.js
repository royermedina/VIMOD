const { asyncHandler } = require('../../../../Nucleo/HTTP');

module.exports = {
  asyncHandler,
  requireAuth: require('./auth').requireAuth,
  loadUser: require('./load-user'),
  requireRole: require('./role'),
};
