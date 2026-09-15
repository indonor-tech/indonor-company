import express from 'express';
import Joi from 'joi';
import User from '../auth/user.model.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { pagination, sendSuccess } from '../../utils/response.js';
import { assignableRoles, canManageRole, DEFAULT_EMPLOYEE_TAB_ACCESS, normalizeRole, normalizeTabAccess, permissionsForRole, publicUser } from '../auth/roles.js';

const router = express.Router();
const objectId = Joi.string().hex().length(24).allow('', null);
const createInput = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(8).max(72).required(),
  role: Joi.string().valid('ADMIN', 'MANAGER', 'EMPLOYEE').required(),
  employeeId: objectId,
  isActive: Joi.boolean(),
  tabAccess: Joi.object().unknown(true)
});
const updateInput = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }),
  password: Joi.string().min(8).max(72).allow(''),
  role: Joi.string().valid('ADMIN', 'MANAGER', 'EMPLOYEE'),
  employeeId: objectId,
  isActive: Joi.boolean(),
  tabAccess: Joi.object().unknown(true)
});

function visibleFilter(actorRole) {
  const roles = assignableRoles(actorRole);
  if (normalizeRole(actorRole) === 'SUPER_ADMIN') return {};
  return { role: { $in: roles } };
}

router.use(authenticate, authorize('users:read'));

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const filter = visibleFilter(req.user.role);
  const [data, total] = await Promise.all([
    User.find(filter).select('-passwordHash -refreshTokenHash -resetTokenHash').sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter)
  ]);
  return sendSuccess(res, data.map((user) => publicUser(user)), 'Users fetched', pagination(page, limit, total));
}));

router.post('/', authorize('users:write'), validate(createInput), asyncHandler(async (req, res) => {
  const role = normalizeRole(req.body.role);
  if (!canManageRole(req.user.role, role)) throw new AppError('You cannot create that CRM role.', 403);
  const exists = await User.findOne({ email: req.body.email });
  if (exists) throw new AppError('A CRM user already uses this email.', 409);
  try {
    const user = await User.create({
      name: req.body.name,
      email: req.body.email,
      role,
      permissions: permissionsForRole(role),
      tabAccess: role === 'EMPLOYEE' ? normalizeTabAccess(role, req.body.tabAccess || DEFAULT_EMPLOYEE_TAB_ACCESS) : undefined,
      employeeId: req.body.employeeId || null,
      isActive: req.body.isActive !== false,
      passwordHash: await User.hashPassword(req.body.password)
    });
    return sendSuccess(res, publicUser(user), 'CRM user created');
  } catch (error) {
    if (error?.code === 11000) throw new AppError('A CRM user already uses this email.', 409);
    throw error;
  }
}));

router.patch('/:id', authorize('users:write'), validate(updateInput), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('+passwordHash');
  if (!user) throw new AppError('User not found', 404);
  if (String(user._id) === String(req.user._id) && req.body.role) throw new AppError('You cannot change your own CRM role here.', 403);
  if (!canManageRole(req.user.role, user.role)) throw new AppError('You cannot update this CRM user.', 403);
  const nextRole = req.body.role ? normalizeRole(req.body.role) : normalizeRole(user.role);
  if (req.body.role && !canManageRole(req.user.role, nextRole)) throw new AppError('You cannot assign that CRM role.', 403);
  if (req.body.name) user.name = req.body.name;
  if (req.body.email) user.email = req.body.email;
  if (req.body.isActive !== undefined) user.isActive = req.body.isActive;
  if (req.body.employeeId !== undefined) user.employeeId = req.body.employeeId || null;
  if (req.body.role) {
    user.role = nextRole;
    user.permissions = permissionsForRole(nextRole);
  }
  if (nextRole === 'EMPLOYEE') {
    user.tabAccess = normalizeTabAccess(nextRole, req.body.tabAccess || user.tabAccess || DEFAULT_EMPLOYEE_TAB_ACCESS);
  } else if (user.tabAccess != null) {
    user.tabAccess = undefined;
    user.markModified('tabAccess');
  }
  if (req.body.password) {
    user.passwordHash = await User.hashPassword(req.body.password);
    user.refreshTokenHash = undefined;
  }
  await user.save();
  return sendSuccess(res, publicUser(user), 'CRM user updated');
}));

router.patch('/:id/status', authorize('users:write'), validate(Joi.object({ isActive: Joi.boolean().required() })), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  if (!canManageRole(req.user.role, user.role)) throw new AppError('You cannot update this CRM user.', 403);
  user.isActive = req.body.isActive;
  await user.save();
  return sendSuccess(res, publicUser(user), 'User status updated');
}));

export default router;
