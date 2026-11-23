const { ObjectId } = require('mongodb');

function isObjectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function toObjectId(value) {
  if (value instanceof ObjectId) return value;
  if (!isObjectId(value)) throw new TypeError('Identificador MongoDB no válido');
  return new ObjectId(value);
}

module.exports = { isObjectId, toObjectId, parseObjectId: toObjectId };
