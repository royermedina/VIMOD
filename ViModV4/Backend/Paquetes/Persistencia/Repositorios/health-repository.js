const { ping } = require('../AccesoDatos');

class HealthRepository {
  async ping() {
    return ping();
  }
}

module.exports = HealthRepository;
