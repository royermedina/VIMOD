const HttpError = require('../../../Nucleo/http-error');

function notFound(req, res, next) {
  next(new HttpError(404, 'Endpoint no encontrado'));
}

module.exports = notFound;
