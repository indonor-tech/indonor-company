import express from 'express';
import { Notification } from '../common/support.model.js';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';

const router = express.Router();
router.use(authenticate);
router.get('/', asyncHandler(async (req, res) => {
  const data = await Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
  return sendSuccess(res, data, 'Notifications fetched');
}));
router.patch('/:id/read', asyncHandler(async (req, res) => {
  const data = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user._id }, { readAt: new Date() }, { new: true });
  return sendSuccess(res, data, 'Notification marked as read');
}));
export default router;
