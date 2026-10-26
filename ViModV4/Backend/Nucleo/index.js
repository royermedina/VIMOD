const { ObjectId } = require('mongodb');
const HttpError = require('./http-error');
const { clean } = require('./document-utils');
const { isObjectId } = require('./object-id');

function objectId(id, label) {
  if (!isObjectId(id)) throw new HttpError(400, `${label} no válido`);
  return new ObjectId(id);
}

module.exports = {
  HttpError,
  clean,
  isObjectId,
  objectId,
  ...require('./runtime-config'),
};
