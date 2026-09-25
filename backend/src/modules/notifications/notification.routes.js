import express from 'express';
import { Notification } from '../common/support.model.js';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';

const router = express.Router();
router.use(authenticate);
router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter = { recipient: req.user._id, ...(req.query.unread === 'true' && { readAt: null }), ...(req.query.type && { type: { $in: String(req.query.type).split(',') } }) };
  const [data, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: req.user._id, readAt: null })
  ]);
  return sendSuccess(res, data, 'Notifications fetched', { page, limit, total, unread, hasNext: page * limit < total });
}));
router.get('/unread-count', asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ recipient: req.user._id, readAt: null });
  return sendSuccess(res, { count }, 'Unread notifications counted');
}));
router.patch('/read-all', asyncHandler(async (req, res) => {
  const result = await Notification.updateMany({ recipient: req.user._id, readAt: null }, { readAt: new Date() });
  return sendSuccess(res, { updated: result.modifiedCount }, 'All notifications marked as read');
}));
router.patch('/:id/read', asyncHandler(async (req, res) => {
  const data = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user._id }, { readAt: new Date() }, { new: true });
  return sendSuccess(res, data, 'Notification marked as read');
}));
export default router;
