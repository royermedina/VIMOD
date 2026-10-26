const { HttpError } = require('../../../../Nucleo');
const { verifyToken } = require('../../../Aplicacion/Autenticacion');

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Autenticación requerida'));
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub };
    next();
  } catch (error) {
    next(new HttpError(401, 'Token no válido o expirado'));
  }
}

module.exports = { requireAuth };
