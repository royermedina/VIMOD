const { HttpError } = require('../../../../Nucleo');

function requireRole(...roles) {
  return function roleMiddleware(req, res, next) {
    if (!req.user) {
      return next(new HttpError(401, 'Autenticación requerida'));
    }
    if (!roles.includes(req.user.rol)) {
      return next(new HttpError(403, 'No tienes permisos para esta operación'));
    }
    next();
  };
}

module.exports = requireRole;
