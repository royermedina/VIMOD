function getMongoClientOptions(config = process.env) {
  const username = config.mongodbUser || config.MONGODB_USER || '';
  const password = config.mongodbPassword || config.MONGODB_PASSWORD || '';
  const authSource = config.mongodbAuthSource || config.MONGODB_AUTH_SOURCE || 'admin';

  if (!username && !password) return {};
  if (!username || !password) {
    throw new Error('MONGODB_USER y MONGODB_PASSWORD deben configurarse juntos');
  }

  return {
    auth: { username, password },
    authSource,
  };
}

module.exports = { getMongoClientOptions };
