import express from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AppError } from '../../../utils/errors.js';
import { sendSuccess } from '../../../utils/response.js';
import { CALENDAR_DAY_TYPES } from '../task.constants.js';
import { CalendarDay, TaskSettings } from '../task.models.js';
import { LockedError, requestContext } from '../services/context.js';
import { diffFields, recordAudit } from '../services/taskAudit.service.js';
import {
  addDays, getDayInfos, getTaskSettings, invalidateTaskSettings, isDateKey, isDateLocked, isValidTimeZone, todayContext
} from '../services/workCalendar.service.js';
import { dateKeySchema, writeLimiter } from './routeUtils.js';

const router = express.Router();
const dayInput = Joi.object({
  date: dateKeySchema.required(),
  type: Joi.string().valid(...CALENDAR_DAY_TYPES).required(),
  name: Joi.string().trim().min(2).max(160).required(),
  description: Joi.string().max(1000).allow('')
});
const dayUpdate = Joi.object({ type: Joi.string().valid(...CALENDAR_DAY_TYPES), name: Joi.string().trim().min(2).max(160), description: Joi.string().max(1000).allow('') }).min(1);
const settingsInput = Joi.object({
  timezone: Joi.string().max(64),
  workingDays: Joi.array().items(Joi.number().integer().min(1).max(7)).min(1).max(7).unique(),
  reminderTimes: Joi.array().items(Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/)).max(8).unique(),
  timeTrackingEnabled: Joi.boolean(),
  maxSubtaskDepth: Joi.number().integer().min(1).max(50),
  requiredRoles: Joi.array().items(Joi.string().valid('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD', 'EMPLOYEE')).max(5).unique(),
  deadlineReminderHours: Joi.number().integer().min(1).max(168),
  notifyManagersOnMissed: Joi.boolean()
}).min(1);

/** Calendar changes for dates whose deadline has passed would rewrite history, so they are refused. */
async function assertFutureOrToday(dateKey) {
  const settings = await getTaskSettings();
  if (isDateLocked(dateKey, settings.timezone)) throw new LockedError('Calendar entries for past (locked) dates cannot be changed.');
}

router.use(authenticate, authorize('task:read'));

router.get('/days', asyncHandler(async (req, res) => {
  const today = await todayContext(new Date());
  const from = isDateKey(req.query.from) ? req.query.from : `${today.today.slice(0, 7)}-01`;
  const to = isDateKey(req.query.to) ? req.query.to : addDays(from, 41);
  if (to < from || addDays(from, 400) < to) throw new AppError('Choose a range of up to 400 days.', 422);
  const [days, entries] = await Promise.all([
    getDayInfos(from, to, today.settings),
    CalendarDay.find({ date: { $gte: from, $lte: to } }).populate('createdBy updatedBy', 'name').sort({ date: 1 }).lean()
  ]);
  return sendSuccess(res, { from, to, today: today.today, days, entries }, 'Calendar fetched');
}));

router.post('/days', authorize('task:calendar:manage'), writeLimiter, validate(dayInput), asyncHandler(async (req, res) => {
  const ctx = requestContext(req);
  await assertFutureOrToday(req.body.date);
  if (await CalendarDay.exists({ date: req.body.date })) throw new AppError('That date already has a calendar entry. Edit it instead.', 409);
  const day = await CalendarDay.create({ ...req.body, createdBy: ctx.user._id, updatedBy: ctx.user._id });
  await recordAudit(ctx, { action: 'CALENDAR_DAY_CREATED', recordType: 'CalendarDay', recordId: day._id, newValue: { date: day.date, type: day.type, name: day.name } });
  return sendSuccess(res, day, 'Calendar entry created');
}));

router.patch('/days/:id', authorize('task:calendar:manage'), writeLimiter, validate(dayUpdate), asyncHandler(async (req, res) => {
  const ctx = requestContext(req);
  const day = await CalendarDay.findById(req.params.id);
  if (!day) throw new AppError('Calendar entry not found', 404);
  await assertFutureOrToday(day.date);
  const diff = diffFields(day.toObject(), req.body, Object.keys(req.body));
  if (!diff) return sendSuccess(res, day, 'No changes');
  Object.assign(day, req.body, { updatedBy: ctx.user._id });
  await day.save();
  await recordAudit(ctx, { action: 'CALENDAR_DAY_UPDATED', recordType: 'CalendarDay', recordId: day._id, ...diff, meta: { date: day.date } });
  return sendSuccess(res, day, 'Calendar entry updated');
}));

router.delete('/days/:id', authorize('task:calendar:manage'), writeLimiter, asyncHandler(async (req, res) => {
  const ctx = requestContext(req);
  const day = await CalendarDay.findById(req.params.id);
  if (!day) throw new AppError('Calendar entry not found', 404);
  await assertFutureOrToday(day.date);
  await CalendarDay.deleteOne({ _id: day._id });
  await recordAudit(ctx, { action: 'CALENDAR_DAY_REMOVED', recordType: 'CalendarDay', recordId: day._id, oldValue: { date: day.date, type: day.type, name: day.name } });
  return sendSuccess(res, null, 'Calendar entry removed');
}));

router.get('/settings', asyncHandler(async (_req, res) => sendSuccess(res, await getTaskSettings({ fresh: true }), 'Task settings fetched')));

router.put('/settings', authorize('task:calendar:manage'), writeLimiter, validate(settingsInput), asyncHandler(async (req, res) => {
  const ctx = requestContext(req);
  if (req.body.timezone && !isValidTimeZone(req.body.timezone)) throw new AppError('Unknown timezone. Use an IANA name like Asia/Kolkata.', 422);
  const before = await getTaskSettings({ fresh: true });
  await TaskSettings.findOneAndUpdate({ key: 'default' }, { $set: { ...req.body, updatedBy: ctx.user._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  invalidateTaskSettings();
  const after = await getTaskSettings({ fresh: true });
  const diff = diffFields(before, after, Object.keys(req.body));
  if (diff) await recordAudit(ctx, { action: 'TASK_SETTINGS_UPDATED', recordType: 'TaskSettings', ...diff });
  return sendSuccess(res, after, 'Task settings updated');
}));

export default router;
