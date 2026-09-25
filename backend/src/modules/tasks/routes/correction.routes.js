import express from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { pagination, sendSuccess } from '../../../utils/response.js';
import { CORRECTION_TARGETS } from '../task.constants.js';
import { requestContext } from '../services/context.js';
import { approveCorrection, createCorrection, listCorrections, rejectCorrection } from '../services/correction.service.js';
import { taskUploadMiddleware } from '../services/taskFiles.js';
import { dateKeySchema, methodNotAllowed, objectId, parseJsonField, uploadLimiter, validateValue, writeLimiter } from './routeUtils.js';

const router = express.Router();
const createInput = Joi.object({
  targetType: Joi.string().valid(...CORRECTION_TARGETS).required(),
  targetId: objectId,
  workDate: dateKeySchema,
  reason: Joi.string().trim().min(5).max(2000).required(),
  requestedChanges: Joi.object().min(1).required()
}).or('targetId', 'workDate');

router.use(authenticate, authorize('task:read'));

router.get('/', asyncHandler(async (req, res) => {
  const result = await listCorrections(requestContext(req), req.query);
  return sendSuccess(res, result.data, 'Correction requests fetched', { ...pagination(result.page, result.limit, result.total), reviewer: result.reviewer });
}));

router.post('/', writeLimiter, uploadLimiter, taskUploadMiddleware('files'), asyncHandler(async (req, res) => {
  const input = validateValue(createInput, { ...req.body, requestedChanges: parseJsonField(req.body.requestedChanges, {}) });
  return sendSuccess(res, await createCorrection(requestContext(req), input, req.files || []), 'Correction request submitted');
}));

router.post('/:id/approve', authorize('task:correction:approve'), writeLimiter, validate(Joi.object({ note: Joi.string().max(2000).allow('') })), asyncHandler(async (req, res) => {
  return sendSuccess(res, await approveCorrection(requestContext(req), req.params.id, req.body.note), 'Correction approved');
}));

router.post('/:id/reject', authorize('task:correction:approve'), writeLimiter, validate(Joi.object({ note: Joi.string().trim().min(3).max(2000).required() })), asyncHandler(async (req, res) => {
  return sendSuccess(res, await rejectCorrection(requestContext(req), req.params.id, req.body.note), 'Correction rejected');
}));

router.delete('/:id', methodNotAllowed('Correction requests are part of the permanent history and cannot be deleted.'));

export default router;
