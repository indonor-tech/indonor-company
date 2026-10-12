import express from 'express';
import Joi from 'joi';
import User from '../../auth/user.model.js';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AppError } from '../../../utils/errors.js';
import { sendSuccess } from '../../../utils/response.js';
import { assignableRoles, canManageRole, normalizeRole, publicUser } from '../../auth/roles.js';
import { CRM_PAGE_KEYS, FINANCIAL_PAGE_KEYS } from '../constants.js';
import { ViewAdminPagePermission } from '../crm.models.js';
import { writeCrmAudit } from '../crm.helpers.js';

const router = express.Router();

async function syncUserPageAccess(userId) {
  const grants = await ViewAdminPagePermission.find({ userId, canView: true }).lean();
  const pageAccess = Object.fromEntries(grants.map((row) => [row.pageKey, true]));
  await User.findByIdAndUpdate(userId, { $set: { pageAccess } });
  return pageAccess;
}

router.use(authenticate);

router.get('/pages', authorize('crm:view-admin:manage'), asyncHandler(async (_req, res) => {
  return sendSuccess(res, {
    pages: CRM_PAGE_KEYS,
    financialPages: FINANCIAL_PAGE_KEYS,
    note: 'Financial pages remain Super Admin-only by default.'
  }, 'CRM page keys fetched');
}));

router.get('/users/:userId/permissions', authorize('crm:view-admin:manage'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId).lean();
  if (!user) throw new AppError('User not found', 404);
  if (normalizeRole(user.role) !== 'VIEW_ADMIN') throw new AppError('User is not a VIEW_ADMIN', 400);
  const permissions = await ViewAdminPagePermission.find({ userId: user._id }).lean();
  return sendSuccess(res, {
    user: publicUser(user, { pageAccess: user.pageAccess }),
    permissions,
    availablePages: CRM_PAGE_KEYS
  }, 'View Admin permissions fetched');
}));

router.put('/users/:userId/permissions', authorize('crm:view-admin:manage'), validate(Joi.object({
  pages: Joi.array().items(Joi.object({
    pageKey: Joi.string().valid(...CRM_PAGE_KEYS).required(),
    canView: Joi.boolean().required()
  })).required()
})), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) throw new AppError('User not found', 404);
  if (normalizeRole(user.role) !== 'VIEW_ADMIN') throw new AppError('User is not a VIEW_ADMIN', 400);
  if (!canManageRole(req.user.role, 'VIEW_ADMIN')) throw new AppError('You cannot manage this user', 403);

  for (const page of req.body.pages) {
    if (FINANCIAL_PAGE_KEYS.includes(page.pageKey) && page.canView && normalizeRole(req.user.role) !== 'SUPER_ADMIN') {
      throw new AppError('Only Super Admin can grant financial page access', 403);
    }
    await ViewAdminPagePermission.findOneAndUpdate(
      { userId: user._id, pageKey: page.pageKey },
      {
        $set: {
          canView: Boolean(page.canView),
          canCreate: false,
          canEdit: false,
          canDelete: false,
          grantedBy: req.user._id,
          grantedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );
  }
  const pageAccess = await syncUserPageAccess(user._id);
  await writeCrmAudit(req, 'PERMISSION_CHANGED', 'User', user._id, { pageAccess });
  const permissions = await ViewAdminPagePermission.find({ userId: user._id }).lean();
  return sendSuccess(res, { pageAccess, permissions }, 'View Admin permissions updated');
}));

router.post('/users', authorize('crm:view-admin:manage'), validate(Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(8).max(72).required(),
  pages: Joi.array().items(Joi.string().valid(...CRM_PAGE_KEYS)).default([]),
  isActive: Joi.boolean()
})), asyncHandler(async (req, res) => {
  if (!assignableRoles(req.user.role).includes('VIEW_ADMIN')) {
    throw new AppError('You cannot create VIEW_ADMIN users', 403);
  }
  const exists = await User.findOne({ email: req.body.email });
  if (exists) throw new AppError('A CRM user already uses this email.', 409);
  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    role: 'VIEW_ADMIN',
    permissions: [],
    pageAccess: {},
    isActive: req.body.isActive !== false,
    passwordHash: await User.hashPassword(req.body.password)
  });
  if (req.body.pages?.length) {
    for (const pageKey of req.body.pages) {
      if (FINANCIAL_PAGE_KEYS.includes(pageKey)) continue;
      await ViewAdminPagePermission.create({
        userId: user._id,
        pageKey,
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        grantedBy: req.user._id
      });
    }
    user.pageAccess = await syncUserPageAccess(user._id);
  }
  await writeCrmAudit(req, 'VIEW_ADMIN_CREATED', 'User', user._id, { email: user.email });
  res.status(201);
  return sendSuccess(res, publicUser(user, { pageAccess: user.pageAccess }), 'View Admin user created');
}));

export default router;
