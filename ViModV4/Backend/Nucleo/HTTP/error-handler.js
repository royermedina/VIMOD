const HttpError = require('../http-error');

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let status = error.status || 500;
  let message = error.message || 'Error interno del servidor';

  if (error.code === 11000) {
    status = 409;
    message = error.keyPattern && error.keyPattern.correo
      ? 'El correo ya está registrado'
      : 'El recurso ya existe';
  } else if (!(error instanceof HttpError)) {
    console.error(error);
    status = 500;
    message = 'Error interno del servidor';
  }

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
