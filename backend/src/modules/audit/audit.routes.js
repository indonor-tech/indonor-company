import express from 'express';
import { AuditLog } from '../common/support.model.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { pagination, sendSuccess } from '../../utils/response.js';

const router = express.Router();
router.get('/', authenticate, authorize('audit:read'), asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Number(req.query.limit) || 50, 100);
  const [data, total] = await Promise.all([
    AuditLog.find({}).populate('actor', 'name email role').sort({ occurredAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments({})
  ]);
  return sendSuccess(res, data, 'Audit logs fetched', pagination(page, limit, total));
}));
export default router;
