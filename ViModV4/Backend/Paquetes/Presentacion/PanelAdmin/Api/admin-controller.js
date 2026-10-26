const { AdminService } = require('../../../Aplicacion/Administracion');

const adminService = new AdminService();

async function overview(req, res) {
  res.json({ overview: await adminService.overview() });
}

async function users(req, res) {
  res.json({ users: await adminService.listUsers(req.query) });
}

async function roleRequests(req, res) {
  res.json({ requests: await adminService.listRoleRequests() });
}

async function decideRoleRequest(req, res) {
  const user = await adminService.decideRoleRequest(
    req.user.id,
    req.params.id,
    req.body && req.body.decision,
    req.body && req.body.reason,
  );
  res.json({ user });
}

async function setUserStatus(req, res) {
  const user = await adminService.setUserStatus(req.user.id, req.params.id, req.body && req.body.status);
  res.json({ user });
}

async function collection(req, res) {
  res.json({ items: await adminService.listCollection(req.params.name) });
}

async function audit(req, res) {
  res.json({ events: await adminService.listAudit() });
}

async function assignReview(req, res) {
  await adminService.assignReview(req.user.id, req.params.id, req.body && req.body.architectId);
  res.json({ message: 'Solicitud asignada' });
}

async function advisorRequests(req, res) {
  res.json({ items: await adminService.listCollection('advisorRequests') });
}

async function updateAdvisorRequest(req, res) {
  const item = await adminService.updateAdvisorRequest(
    req.user.id,
    req.params.id,
    req.body && req.body.status,
    req.body && req.body.adminNote,
  );
  res.json({ item });
}

module.exports = {
  overview, users, roleRequests, decideRoleRequest, setUserStatus, collection, audit,
  assignReview, advisorRequests, updateAdvisorRequest,
};
