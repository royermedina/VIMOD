const express = require('express');
const authRoutes = require('./PortalCliente/Api/auth-routes');
const terrainRoutes = require('./PortalCliente/Api/terrain-routes');
const projectRoutes = require('./PortalCliente/Api/project-routes');
const adminRoutes = require('./PanelAdmin/Api/admin-routes');
const publicWorkflowRoutes = require('./PortalCliente/Api/public-workflow-routes');
const clientWorkflowRoutes = require('./PortalCliente/Api/workflow-routes');
const contractorRoutes = require('./PortalConstructora/Api/workflow-routes');
const architectRoutes = require('./PortalArquitecto/Api/workflow-routes');
const { requireAuth, loadUser } = require('./PortalCliente/Api');
const { health } = require('../Aplicacion/Administracion');
const asyncHandler = require('../../Nucleo/HTTP').asyncHandler;

const router = express.Router();

router.get('/health', asyncHandler(async (req, res) => {
  const result = await health();
  res.status(result.status === 'ok' ? 200 : 503).json(result);
}));
router.use('/auth', authRoutes);
router.use('/terrains', terrainRoutes);
router.use('/projects', projectRoutes);
router.use('/admin', adminRoutes);
router.use('/', publicWorkflowRoutes);
router.use(requireAuth, loadUser);
router.use('/', clientWorkflowRoutes);
router.use('/', contractorRoutes);
router.use('/', architectRoutes);

module.exports = router;
