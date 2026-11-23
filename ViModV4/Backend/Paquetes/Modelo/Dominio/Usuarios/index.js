const ROLES = Object.freeze(['cliente', 'arquitecto', 'constructora', 'admin']);
const ACTIVE_ADMIN_STATES = new Set(['active', 'activo']);
const INACTIVE_STATES = new Set([
  'disabled',
  'deshabilitado',
  'pendiente',
  'pending',
  'rechazado',
  'rejected',
]);

function normalizeRole(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  return normalized === 'administrador' ? 'admin' : normalized;
}

function resolveUserRole(user, roleAssignments = {}) {
  if (!user) return null;
  const normalizedRole = normalizeRole(user.rol);
  const accountStatus = normalizeRole(user.accountStatus || user.estadoCuenta || user.status);
  if (INACTIVE_STATES.has(accountStatus)) return 'cliente';
  if (normalizedRole === 'admin') {
    return ACTIVE_ADMIN_STATES.has(accountStatus) ? 'admin' : 'cliente';
  }

  const requestedRole = normalizeRole(user.requestedRole || user.tipoCuenta || user.accountType);
  const userId = user._id && typeof user._id.toHexString === 'function'
    ? user._id.toHexString().toLowerCase()
    : String(user.id || '').toLowerCase();
  const assignedRole = roleAssignments[userId];
  if (assignedRole) {
    return assignedRole === 'admin' && !ACTIVE_ADMIN_STATES.has(accountStatus)
      ? 'cliente'
      : assignedRole;
  }
  if ((requestedRole === 'arquitecto' || requestedRole === 'constructora')
    && (accountStatus === 'aprobado' || accountStatus === 'approved')) {
    return requestedRole;
  }
  if (ROLES.includes(normalizedRole)) return normalizedRole;
  return 'cliente';
}

function isApprovedContractor(user, roleAssignments = {}) {
  return user
    && resolveUserRole(user, roleAssignments) === 'constructora'
    && ['active', 'activo', 'aprobado', 'approved'].includes(
      String(user.accountStatus || '').toLowerCase(),
    );
}

function isPendingRoleRequest(user) {
  return Boolean(user && user.accountStatus === 'pendiente');
}

module.exports = {
  ROLES,
  normalizeRole,
  resolveUserRole,
  isApprovedContractor,
  isPendingRoleRequest,
};
