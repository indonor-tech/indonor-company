import express from 'express';
import mongoose from 'mongoose';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { pagination, sendSuccess } from '../../../utils/response.js';
import { hasPermission } from '../../auth/roles.js';
import { TaskAuditLog } from '../task.models.js';
import { AUDIT_ACTIONS } from '../task.constants.js';
import { teamUserIds } from '../services/taskAccess.service.js';
import { methodNotAllowed } from './routeUtils.js';

const router = express.Router();
const oid = (value) => (mongoose.isValidObjectId(value) && String(value).length === 24 ? new mongoose.Types.ObjectId(String(value)) : null);

router.get('/', authenticate, authorize('task:audit:read'), asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const and = [];
  if (!hasPermission(req.user, 'task:read:all')) {
    const ids = [req.user._id, ...(await teamUserIds(req.user))].map((id) => new mongoose.Types.ObjectId(String(id)));
    and.push({ $or: [{ actor: { $in: ids } }, { subjectUser: { $in: ids } }] });
  }
  for (const [param, field] of [['task', 'task'], ['actor', 'actor'], ['subjectUser', 'subjectUser'], ['recordId', 'recordId']]) {
    const value = oid(req.query[param]);
    if (value) and.push({ [field]: value });
  }
  const actions = String(req.query.action || '').split(',').filter((action) => AUDIT_ACTIONS.includes(action));
  if (actions.length) and.push({ action: { $in: actions } });
  if (req.query.recordType) and.push({ recordType: String(req.query.recordType).slice(0, 40) });
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '')) and.push({ workDate: { $gte: req.query.from } });
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) and.push({ workDate: { $lte: req.query.to } });
  const filter = and.length ? { $and: and } : {};
  const [data, total] = await Promise.all([
    TaskAuditLog.find(filter).populate('actor subjectUser', 'name email role').populate('task', 'taskKey title').sort({ occurredAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    TaskAuditLog.countDocuments(filter)
  ]);
  return sendSuccess(res, data, 'Audit history fetched', pagination(page, limit, total));
}));

const immutable = methodNotAllowed('Audit history is append-only and cannot be modified or deleted.');
router.post('/', immutable);
router.put('/', immutable);
router.patch('/', immutable);
router.delete('/', immutable);
router.put('/:id', immutable);
router.patch('/:id', immutable);
router.delete('/:id', immutable);

export default router;
