const { ObjectId } = require('mongodb');
const HttpError = require('./http-error');

function isObjectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function parseObjectId(value, label = 'Identificador') {
  if (!isObjectId(value)) {
    throw new HttpError(400, `${label} no es válido`);
  }
  return new ObjectId(value);
}

module.exports = { isObjectId, parseObjectId };