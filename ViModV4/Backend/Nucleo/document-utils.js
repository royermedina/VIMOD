function clean(document) {
  if (!document) return null;
  const result = { ...document, id: document._id.toHexString() };
  delete result._id;
  return result;
}

module.exports = { clean };
