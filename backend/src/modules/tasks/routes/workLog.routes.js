import express from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { pagination, sendSuccess } from '../../../utils/response.js';
import { URL_KINDS } from '../task.constants.js';
import { requestContext } from '../services/context.js';
import {
  addWorkLogAttachments, addWorkLogComment, addWorkLogUrl, getWorkLog, listWorkLogs, lockDate, saveWorkLog, workLogCalendar, workLogSuggestions
} from '../services/workLog.service.js';
import { createCorrection } from '../services/correction.service.js';
import { taskUploadMiddleware } from '../services/taskFiles.js';
import { todayContext } from '../services/workCalendar.service.js';
import { dateKeySchema, methodNotAllowed, objectId, parseJsonField, uploadLimiter, validateValue, writeLimiter } from './routeUtils.js';

const router = express.Router();
const taskIds = Joi.array().items(objectId).max(100);
const logInput = Joi.object({
  summary: Joi.string().max(10000).allow(''),
  blockers: Joi.string().max(5000).allow(''),
  nextDayPlan: Joi.string().max(5000).allow(''),
  hoursWorked: Joi.number().min(0).max(24).allow(null),
  completedTasks: taskIds,
  inProgressTasks: taskIds,
  pendingTasks: taskIds
});
const commentInput = Joi.object({
  text: Joi.string().trim().min(1).max(5000).required(),
  mentions: Joi.array().items(objectId).max(50),
  urls: Joi.array().items(Joi.alternatives(Joi.string().max(2048), Joi.object({ url: Joi.string().max(2048).required(), label: Joi.string().max(160).allow(''), kind: Joi.string().valid(...URL_KINDS) }))).max(10)
});
const dateParam = (req) => validateValue(dateKeySchema.required(), req.params.date);

router.use(authenticate, authorize('task:read'));

router.get('/meta', asyncHandler(async (_req, res) => {
  const today = await todayContext(new Date());
  return sendSuccess(res, {
    today: today.today, timezone: today.timezone, serverTime: today.now, lockAt: today.lockAt, day: today.day,
    reminderTimes: today.settings.reminderTimes, workingDays: today.settings.workingDays
  }, 'Work log settings fetched');
}));

router.get('/suggestions', asyncHandler(async (req, res) => sendSuccess(res, await workLogSuggestions(requestContext(req)), 'Suggestions fetched')));

router.get('/calendar', asyncHandler(async (req, res) => {
  return sendSuccess(res, await workLogCalendar(requestContext(req), req.query.month, req.query.user), 'Calendar fetched');
}));

router.get('/', asyncHandler(async (req, res) => {
  const result = await listWorkLogs(requestContext(req), req.query);
  return sendSuccess(res, result.data, 'Work logs fetched', pagination(result.page, result.limit, result.total));
}));

router.post('/lock/:date', authorize('worklog:read:all'), asyncHandler(async (req, res) => {
  return sendSuccess(res, await lockDate(requestContext(req), dateParam(req)), 'Daily records locked');
}));

router.post('/entries/:logId/comments', writeLimiter, uploadLimiter, taskUploadMiddleware('files'), asyncHandler(async (req, res) => {
  const input = validateValue(commentInput, { text: req.body.text, mentions: parseJsonField(req.body.mentions, []), urls: parseJsonField(req.body.urls, []) });
  return sendSuccess(res, await addWorkLogComment(requestContext(req), req.params.logId, input, req.files || []), 'Comment added');
}));

router.get('/:date', asyncHandler(async (req, res) => {
  return sendSuccess(res, await getWorkLog(requestContext(req), dateParam(req), req.query.user), 'Work log fetched');
}));

router.put('/:date', writeLimiter, validate(logInput), asyncHandler(async (req, res) => {
  const ctx = requestContext(req);
  const date = dateParam(req);
  await saveWorkLog(ctx, date, req.body, { submit: false });
  return sendSuccess(res, await getWorkLog(ctx, date), 'Work log saved');
}));

router.post('/:date/submit', writeLimiter, validate(logInput), asyncHandler(async (req, res) => {
  const ctx = requestContext(req);
  const date = dateParam(req);
  await saveWorkLog(ctx, date, req.body, { submit: true });
  return sendSuccess(res, await getWorkLog(ctx, date), 'Daily work log submitted');
}));

router.post('/:date/attachments', uploadLimiter, taskUploadMiddleware('files'), asyncHandler(async (req, res) => {
  return sendSuccess(res, await addWorkLogAttachments(requestContext(req), dateParam(req), req.files || []), 'Files uploaded securely');
}));

router.post('/:date/urls', writeLimiter, validate(Joi.object({ url: Joi.string().trim().max(2048).required(), label: Joi.string().trim().max(160).allow(''), kind: Joi.string().valid(...URL_KINDS) })), asyncHandler(async (req, res) => {
  return sendSuccess(res, await addWorkLogUrl(requestContext(req), dateParam(req), req.body), 'Link added');
}));

router.post('/:date/corrections', writeLimiter, uploadLimiter, taskUploadMiddleware('files'), asyncHandler(async (req, res) => {
  const input = validateValue(Joi.object({ reason: Joi.string().trim().min(5).max(2000).required(), requestedChanges: Joi.object().min(1).required() }), {
    reason: req.body.reason, requestedChanges: parseJsonField(req.body.requestedChanges, {})
  });
  const request = await createCorrection(requestContext(req), { targetType: 'DailyWorkLog', workDate: dateParam(req), ...input }, req.files || []);
  return sendSuccess(res, request, 'Correction request submitted');
}));

router.delete('/:date', methodNotAllowed('Daily work logs are permanent records and cannot be deleted.'));

export default router;
