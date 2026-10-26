const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { HttpError, isObjectId, getRuntimeConfig } = require('../../../Nucleo');
const { isPendingRoleRequest } = require('../../Dominio/Usuarios');
const { resolveRole } = require('../Autenticacion');
const {
  AdminAuditRepository,
  AdvisorRequestRepository,
  OrderRepository,
  PaymentRepository,
  ProjectRepository,
  ProposalRepository,
  QuoteRequestRepository,
  ReviewRequestRepository,
  ServiceRepository,
  UserRepository,
} = require('../../Persistencia/Repositorios');

const PUBLIC_ROLES = new Set(['cliente', 'arquitecto', 'constructora']);
const ACTIVE_STATES = new Set(['active', 'activo', 'aprobado', 'approved']);

function cleanUser(user) {
  const effectiveRole = resolveRole(user);
  const requestedRole = String(user.requestedRole || user.accountType || '').toLowerCase();
  return {
    id: user._id.toHexString(),
    nombre: user.nombre || '',
    correo: user.correo || '',
    requestedRole: PUBLIC_ROLES.has(requestedRole)
      ? requestedRole
      : (effectiveRole === 'cliente' ? 'cliente' : effectiveRole),
    rol: effectiveRole,
    accountStatus: user.accountStatus || 'active',
    createdAt: user.createdAt || null,
    roleDecision: user.roleDecision || null,
  };
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class AdminService {
  constructor() {
    this.adminAuditRepository = new AdminAuditRepository();
    this.advisorRequestRepository = new AdvisorRequestRepository();
    this.orderRepository = new OrderRepository();
    this.paymentRepository = new PaymentRepository();
    this.projectRepository = new ProjectRepository();
    this.proposalRepository = new ProposalRepository();
    this.quoteRequestRepository = new QuoteRequestRepository();
    this.reviewRequestRepository = new ReviewRequestRepository();
    this.serviceRepository = new ServiceRepository();
    this.userRepository = new UserRepository();
  }

  async provisionConfiguredAdmin() {
    const env = getRuntimeConfig();
    if (!env.adminPassword) return false;

    const correo = env.adminUsername.toLowerCase();
    const existing = await this.userRepository.findByEmail(correo);
    if (existing) {
      if (resolveRole(existing) !== 'admin') {
        throw new Error('La cuenta configurada para administración ya pertenece a un usuario no administrador');
      }
      if (typeof existing.passwordHash === 'string'
        && await bcrypt.compare(env.adminPassword, existing.passwordHash)) {
        return true;
      }

      const passwordHash = await bcrypt.hash(env.adminPassword, 12);
      const updated = await this.userRepository.updateConfiguredAdminPassword(
        existing._id,
        existing.rol,
        existing.accountStatus,
        passwordHash,
      );
      if (updated.modifiedCount !== 1) {
        throw new Error('No se pudo actualizar la contraseña de la cuenta administrativa configurada');
      }
      return true;
    }

    const passwordHash = await bcrypt.hash(env.adminPassword, 12);
    const now = new Date();
    const adminId = await this.userRepository.createConfiguredAdmin({
      nombre: env.adminUsername,
      correo,
      passwordHash,
      rol: 'admin',
      requestedRole: 'admin',
      accountType: 'admin',
      accountStatus: 'active',
      createdAt: now,
    });
    await this.adminAuditRepository.create({
      adminId,
      action: 'configuredAdminCreated',
      entityType: 'user',
      entityId: adminId.toHexString(),
      details: {},
      createdAt: now,
    });
    return true;
  }

  async writeAudit(adminId, action, entityType, entityId, details = {}) {
    await this.adminAuditRepository.create({
      adminId: new ObjectId(adminId),
      action,
      entityType,
      entityId: String(entityId),
      details,
      createdAt: new Date(),
    });
  }

  async overview() {
    const [users, projects, reviews, quotes, services, payments, operations, advisorRequests] = await Promise.all([
      this.userRepository.listForOverview(),
      this.projectRepository.countAll(),
      this.reviewRequestRepository.countAll(),
      this.quoteRequestRepository.countAll(),
      this.serviceRepository.countAll(),
      this.paymentRepository.countAll(),
      this.orderRepository.countAll(),
      this.advisorRequestRepository.countAll(),
    ]);
    const countRole = (role, status) => users.filter((user) => {
      const requested = String(user.requestedRole || user.accountType || resolveRole(user)).toLowerCase();
      const state = String(user.accountStatus || 'active').toLowerCase();
      return requested === role && (!status || state === status);
    }).length;

    return {
      users: users.length,
      activeClients: users.filter((user) => resolveRole(user) === 'cliente'
        && ACTIVE_STATES.has(String(user.accountStatus || 'active').toLowerCase())).length,
      architects: {
        pending: countRole('arquitecto', 'pendiente'),
        approved: countRole('arquitecto', 'aprobado'),
        rejected: countRole('arquitecto', 'rechazado'),
      },
      constructors: {
        pending: countRole('constructora', 'pendiente'),
        approved: countRole('constructora', 'aprobado'),
        rejected: countRole('constructora', 'rechazado'),
      },
      projects,
      reviewRequests: reviews,
      quoteRequests: quotes,
      services,
      operations,
      payments,
      advisorRequests,
    };
  }

  async listUsers({ search, type, status }) {
    const users = await this.userRepository.listForAdmin();
    const query = typeof search === 'string' && search.trim()
      ? new RegExp(regexEscape(search.trim()), 'i')
      : null;
    return users.map(cleanUser).filter((user) => {
      return (!query || query.test(user.nombre) || query.test(user.correo))
        && (!type || user.requestedRole === type)
        && (!status || String(user.accountStatus).toLowerCase() === status.toLowerCase());
    });
  }

  async listRoleRequests() {
    const users = await this.listUsers({ status: 'pendiente' });
    return users.filter((user) => user.requestedRole === 'arquitecto'
      || user.requestedRole === 'constructora');
  }

  async decideRoleRequest(adminId, id, decision, reason) {
    if (!isObjectId(id)) throw new HttpError(400, 'Identificador de usuario no válido');
    if (decision !== 'approve' && decision !== 'reject') {
      throw new HttpError(400, 'La decisión debe ser approve o reject');
    }
    const user = await this.userRepository.findDocumentById(new ObjectId(id));
    const requestedRole = String(user && (user.requestedRole || user.accountType) || '').toLowerCase();
    if (!user || !['arquitecto', 'constructora'].includes(requestedRole)) {
      throw new HttpError(404, 'Solicitud privilegiada no encontrada');
    }
    if (!isPendingRoleRequest(user)) {
      throw new HttpError(409, 'La solicitud ya fue resuelta');
    }

    const approved = decision === 'approve';
    const decidedAt = new Date();
    const result = await this.userRepository.updateRoleDecision(
      user._id,
      approved ? requestedRole : 'cliente',
      approved ? 'aprobado' : 'rechazado',
      decision,
      typeof reason === 'string' ? reason.trim().slice(0, 1000) : '',
      decidedAt,
      new ObjectId(adminId),
    );
    if (result.modifiedCount !== 1) throw new HttpError(409, 'La solicitud ya fue resuelta');
    await this.writeAudit(adminId, decision, 'roleRequest', id, { role: requestedRole });
    return cleanUser({ ...user, ...await this.userRepository.findDocumentById(user._id) });
  }

  async setUserStatus(adminId, id, status) {
    if (!isObjectId(id)) throw new HttpError(400, 'Identificador de usuario no válido');
    if (status !== 'active' && status !== 'disabled') {
      throw new HttpError(400, 'El estado debe ser active o disabled');
    }
    const user = await this.userRepository.findDocumentById(new ObjectId(id));
    if (!user) throw new HttpError(404, 'Usuario no encontrado');
    if (resolveRole(user) === 'admin') {
      throw new HttpError(403, 'Las cuentas administrativas no se pueden modificar desde esta operación');
    }
    await this.userRepository.updateAccountStatus(user._id, status);
    await this.writeAudit(adminId, 'accountStatusChanged', 'user', id, { status });
    return cleanUser({ ...user, accountStatus: status });
  }

  async listCollection(name, limit = 200) {
    const allowed = new Set(['projects', 'reviewRequests', 'quoteRequests', 'services', 'payments', 'orders', 'advisorRequests']);
    if (!allowed.has(name)) throw new HttpError(400, 'Consulta administrativa no válida');
    const listByEntity = {
      projects: () => this.projectRepository.listForAdmin(limit),
      reviewRequests: () => this.reviewRequestRepository.listForAdmin(limit),
      quoteRequests: () => this.quoteRequestRepository.listForAdmin(limit),
      services: () => this.serviceRepository.listForAdmin(limit),
      payments: () => this.paymentRepository.listForAdmin(limit),
      orders: () => this.orderRepository.listForAdmin(limit),
      advisorRequests: () => this.advisorRequestRepository.listForAdmin(limit),
    };
    const items = await listByEntity[name]();
    return Promise.all(items.map(async (item) => {
      const result = { ...item, id: item._id.toHexString() };
      delete result._id;
      delete result.passwordHash;
      delete result.token;
      if (name === 'projects') {
        const [owner, proposal] = await Promise.all([
          item.ownerId ? this.userRepository.findAdminSummaryById(item.ownerId) : null,
          item.selectedProposalId
            ? this.proposalRepository.findAdminSummaryById(item.selectedProposalId, item._id)
            : null,
        ]);
        result.owner = owner ? { id: owner._id.toHexString(), nombre: owner.nombre, correo: owner.correo } : null;
        result.selectedProposal = proposal ? {
          id: proposal._id.toHexString(),
          name: proposal.name,
          estimate: proposal.estimate,
        } : null;
      } else if (name === 'reviewRequests' || name === 'quoteRequests') {
        const [project, owner] = await Promise.all([
          item.projectId ? this.projectRepository.findAdminSummaryById(item.projectId) : null,
          item.ownerId ? this.userRepository.findAdminSummaryById(item.ownerId) : null,
        ]);
        result.project = project ? { id: project._id.toHexString(), nombre: project.nombre, estado: project.estado } : null;
        result.owner = owner ? { id: owner._id.toHexString(), nombre: owner.nombre, correo: owner.correo } : null;
        if (name === 'quoteRequests' && item.contractorId) {
          const contractor = await this.userRepository.findNameById(item.contractorId);
          result.contractorName = contractor ? contractor.nombre : null;
        }
      } else if (name === 'advisorRequests') {
        const [project, owner] = await Promise.all([
          item.projectId ? this.projectRepository.findAdminSummaryById(item.projectId) : null,
          item.ownerId ? this.userRepository.findAdminSummaryById(item.ownerId) : null,
        ]);
        result.project = project ? { id: project._id.toHexString(), nombre: project.nombre, estado: project.estado } : null;
        result.owner = owner ? { id: owner._id.toHexString(), nombre: owner.nombre, correo: owner.correo } : null;
      } else if (name === 'services' && item.ownerId) {
        const owner = await this.userRepository.findNameById(item.ownerId);
        result.contractorName = owner ? owner.nombre : null;
      } else if ((name === 'payments' || name === 'orders') && item.ownerId) {
        const owner = await this.userRepository.findAdminSummaryById(item.ownerId);
        result.owner = owner ? { id: owner._id.toHexString(), nombre: owner.nombre, correo: owner.correo } : null;
      }
      return result;
    }));
  }

  async updateAdvisorRequest(adminId, id, status, adminNote) {
    if (!isObjectId(id)) throw new HttpError(400, 'Identificador de solicitud no válido');
    const allowedStatuses = new Set(['pending', 'in_progress', 'attended', 'cancelled']);
    if (!allowedStatuses.has(status)) throw new HttpError(400, 'El estado de asesoría no es válido');
    const note = typeof adminNote === 'string' ? adminNote.trim() : '';
    if (note.length > 2000) throw new HttpError(400, 'La nota no puede superar 2000 caracteres');
    const now = new Date();
    const result = await this.advisorRequestRepository.updateStatus(
      new ObjectId(id),
      status,
      note,
      now,
    );
    if (!result) throw new HttpError(404, 'Solicitud de asesoría no encontrada');
    await this.writeAudit(adminId, 'advisorRequestUpdated', 'advisorRequest', id, { status });
    return result;
  }

  async listAudit() {
    const events = await this.adminAuditRepository.listRecent();
    return events.map((event) => ({
      id: event._id.toHexString(),
      adminId: event.adminId.toHexString(),
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      details: event.details,
      createdAt: event.createdAt,
    }));
  }

  async assignReview(adminId, reviewId, architectId) {
    if (!isObjectId(reviewId) || !isObjectId(architectId)) {
      throw new HttpError(400, 'Identificadores no válidos');
    }
    const architect = await this.userRepository.findDocumentById(new ObjectId(architectId));
    if (!architect || resolveRole(architect) !== 'arquitecto'
      || !['aprobado', 'approved', 'active', 'activo'].includes(
        String(architect.accountStatus || '').toLowerCase(),
      )) {
      throw new HttpError(400, 'El usuario no es un arquitecto autorizado');
    }
    const result = await this.reviewRequestRepository.updateForAdminAssignment(
      new ObjectId(reviewId),
      architect._id,
    );
    if (!result.modifiedCount) throw new HttpError(409, 'La solicitud no está disponible para asignación');
    await this.writeAudit(adminId, 'reviewAssigned', 'reviewRequest', reviewId, { architectId });
  }
}

module.exports = AdminService;
