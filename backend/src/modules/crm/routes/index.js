import express from 'express';
import leadRoutes from './lead.routes.js';
import clientRoutes from './client.routes.js';
import projectRoutes from './project.routes.js';
import financeRoutes from './finance.routes.js';
import viewAdminRoutes from './viewAdmin.routes.js';
import directoryRoutes from './directory.routes.js';
import filesRoutes from './files.routes.js';

const router = express.Router();

router.use('/leads', leadRoutes);
router.use('/clients', clientRoutes);
router.use('/projects', projectRoutes);
router.use('/finance', financeRoutes);
router.use('/view-admin', viewAdminRoutes);
router.use('/directory', directoryRoutes);
router.use('/files', filesRoutes);

export default router;
