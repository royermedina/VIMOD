const { AuthService } = require('../../../Aplicacion/Autenticacion');
const authService = new AuthService();

async function loadUser(req, res, next) {
  try {
    req.user = await authService.loadAuthenticatedUser(req.user.id);
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = loadUser;
