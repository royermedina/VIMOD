const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { HttpError, getRuntimeConfig } = require('../../../Nucleo');
const { UserRepository } = require('../../Persistencia/Repositorios');
const { resolveRole } = require('./role-assignments');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PUBLIC_ROLES = new Set(['cliente', 'arquitecto', 'constructora']);

class AuthService {
  constructor(userRepository = new UserRepository()) {
    this.userRepository = userRepository;
  }

  normalizeRequestedRole(role) {
    if (role === undefined || role === null || role === '') return 'cliente';
    if (typeof role !== 'string') throw new HttpError(400, 'El tipo de cuenta no es válido');
    const normalized = role.trim().toLowerCase();
    if (normalized === 'administrador') return 'cliente';
    if (normalized === 'admin') return 'cliente';
    if (!VALID_PUBLIC_ROLES.has(normalized)) {
      throw new HttpError(400, 'El tipo de cuenta no es válido');
    }
    return normalized;
  }

  async register({ nombre, correo, password, rol, requestedRole, tipoCuenta, accountType }) {
    const normalizedName = typeof nombre === 'string' ? nombre.trim() : '';
    const normalizedEmail = typeof correo === 'string' ? correo.trim().toLowerCase() : '';
    const submittedRole = [rol, requestedRole, tipoCuenta, accountType]
      .find((value) => value !== undefined && value !== null && value !== '');
    const requested = this.normalizeRequestedRole(submittedRole);

    if (!normalizedName) throw new HttpError(400, 'El nombre es obligatorio');
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      throw new HttpError(400, 'El correo no tiene un formato válido');
    }
    if (typeof password !== 'string' || password.length < 8) {
      throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
    }
    if (await this.userRepository.findByEmail(normalizedEmail)) {
      throw new HttpError(409, 'El correo ya está registrado');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.userRepository.create({
      nombre: normalizedName,
      correo: normalizedEmail,
      passwordHash,
      rol: requested,
      requestedRole: requested,
      accountStatus: requested === 'cliente' ? 'active' : 'pendiente',
      accountType: requested,
    });
    return this.publicUser(user);
  }

  async login({ correo, usuario, username, password }) {
    const identifier = correo || usuario || username;
    const normalizedEmail = typeof identifier === 'string' ? identifier.trim().toLowerCase() : '';
    const user = await this.userRepository.findByEmail(normalizedEmail);
    const passwordMatches = user && typeof password === 'string' && typeof user.passwordHash === 'string'
      ? await bcrypt.compare(password, user.passwordHash)
      : false;
    if (!user || !passwordMatches) {
      throw new HttpError(401, 'Credenciales no válidas');
    }
    if (['disabled', 'deshabilitado'].includes(String(user.accountStatus || '').toLowerCase())) {
      throw new HttpError(403, 'La cuenta está deshabilitada');
    }

    const env = getRuntimeConfig();
    const token = jwt.sign({ sub: user._id.toHexString() }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn
    });

    return {
      token,
      user: this.publicUser(user)
    };
  }

  async getCurrentUser(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new HttpError(401, 'La sesión no es válida');
    return user;
  }

  async loadAuthenticatedUser(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new HttpError(401, 'Usuario no encontrado');
    if (user.accountStatus === 'disabled' || user.accountStatus === 'deshabilitado') {
      throw new HttpError(403, 'La cuenta está deshabilitada');
    }
    return { ...user, id: user._id.toHexString(), rol: resolveRole(user) };
  }

  publicUser(user) {
    const effectiveRole = resolveRole(user);
    const requestedAccountType = user.requestedRole || user.accountType || user.tipoCuenta;
    const requestedRole = typeof requestedAccountType === 'string'
      && VALID_PUBLIC_ROLES.has(requestedAccountType.trim().toLowerCase())
      ? requestedAccountType.trim().toLowerCase()
      : (effectiveRole === 'cliente' ? 'cliente' : effectiveRole);
    const accountStatus = typeof user.accountStatus === 'string'
      ? user.accountStatus.toLowerCase()
      : (effectiveRole === 'arquitecto' || effectiveRole === 'constructora' ? 'aprobado' : 'active');

    return {
      id: user._id.toHexString(),
      nombre: user.nombre,
      correo: user.correo,
      rol: effectiveRole,
      requestedRole,
      accountType: requestedRole,
      accountStatus,
      created_at: user.createdAt,
    };
  }
}

AuthService.verifyToken = (token) => jwt.verify(token, getRuntimeConfig().jwtSecret);

module.exports = AuthService;
