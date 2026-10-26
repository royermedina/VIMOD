const { HealthRepository } = require('../../Persistencia/Repositorios');

async function health(repository = new HealthRepository()) {
  const connected = await repository.ping();
  return {
    status: connected ? 'ok' : 'error',
    database: connected ? 'connected' : 'disconnected',
  };
}

module.exports = { health };
