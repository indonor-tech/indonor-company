import express from 'express';
import User from '../../auth/user.model.js';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { sendSuccess } from '../../../utils/response.js';
import { TECH_STACK } from '../constants.js';
import { rejectViewAdminMutations } from '../middleware/crmAccess.js';
import { Technology } from '../../common/catalog.model.js';

const router = express.Router();
router.use(authenticate, rejectViewAdminMutations);

const SALES_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'BDA'];
const TEAM_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD', 'EMPLOYEE', 'PROJECT_MANAGER', 'BDA', 'FINANCE'];

router.get('/', authorize('crm:leads:read', 'crm:projects:read', 'crm:clients:read', 'crm:projects:assign'), asyncHandler(async (req, res) => {
  const kind = String(req.query.kind || 'sales');
  const roles = kind === 'team' ? TEAM_ROLES : SALES_ROLES;
  const users = await User.find({ isActive: { $ne: false }, role: { $in: roles } })
    .select('name email role')
    .sort({ name: 1 })
    .limit(300)
    .lean();
  return sendSuccess(res, users.map((user) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role
  })), 'Directory fetched');
}));

router.get('/technologies', authorize('crm:leads:read', 'crm:projects:read', 'crm:clients:read'), asyncHandler(async (_req, res) => {
  const catalog = await Technology.find({ isDeleted: { $ne: true } }).select('name').sort({ name: 1 }).limit(200).lean().catch(() => []);
  const names = [...new Set([...(catalog || []).map((row) => row.name).filter(Boolean), ...TECH_STACK])];
  names.sort((a, b) => a.localeCompare(b));
  return sendSuccess(res, names, 'Technologies fetched');
}));

export default router;
