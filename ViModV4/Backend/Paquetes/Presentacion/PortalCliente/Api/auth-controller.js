const { AuthService } = require('../../../Aplicacion/Autenticacion');

const authService = new AuthService();

async function register(req, res) {
  const user = await authService.register(req.body || {});
  res.status(201).json({ user });
}

async function login(req, res) {
  const result = await authService.login(req.body || {});
  res.json(result);
}

async function me(req, res) {
  res.json({ user: authService.publicUser(req.user) });
}

module.exports = { register, login, me };
