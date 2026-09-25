import mongoose from 'mongoose';
import User from '../../auth/user.model.js';
import Employee from '../../employees/employee.model.js';
import { hasPermission } from '../../auth/roles.js';
import { AppError } from '../../../utils/errors.js';
import { CorrectionRequest, DailyWorkLog, DayFinalization, Task, TaskAttachment, TaskAuditLog, TaskComment, TaskUrl } from '../task.models.js';
import { CLOSED_TASK_STATUSES, NOTIFICATION_TYPES } from '../task.constants.js';
import { LockedError, idOf, sameId, systemContext, uniqueIds } from './context.js';
import { taskScopeFilter, teamUserIds } from './taskAccess.service.js';
import { diffFields, recordAudit } from './taskAudit.service.js';
import { notify } from './taskNotify.service.js';
import { resolveMentions } from './mentions.js';
import { buildUrlEntry } from './taskFiles.js';
import { storeAttachments } from './taskActivity.service.js';
import {
  addDays, getDayInfo, getDayInfos, getTaskSettings, isDateKey, isDateLocked, lockInstant, todayContext, zonedTimeToUtc
} from './workCalendar.service.js';

const LOG_FIELDS = ['summary', 'blockers', 'nextDayPlan', 'hoursWorked', 'completedTasks', 'inProgressTasks', 'pendingTasks'];
const workLogLink = (dateKey, userId) => `/tasks/work-logs?date=${dateKey}${userId ? `&user=${userId}` : ''}`;

export async function canViewWorkLogOf(user, targetUserId) {
  if (sameId(user, targetUserId)) return true;
  if (hasPermission(user, 'worklog:read:all')) return true;
  return (await teamUserIds(user)).includes(idOf(targetUserId));
}

async function assertCanView(user, targetUserId) {
  if (!(await canViewWorkLogOf(user, targetUserId))) throw new AppError('You do not have permission to view this work log.', 403);
}

export function effectiveLog(log) {
  if (!log?.corrected || !Object.keys(log.corrected).length) return log;
  const original = Object.fromEntries(Object.keys(log.corrected).map((key) => [key, log[key]]));
  return { ...log, ...log.corrected, original, hasCorrections: true };
}

export async function requiredUsers(settings, dateKey) {
  const cutoff = lockInstant(dateKey, settings.timezone);
  return User.find({ isActive: true, role: { $in: settings.requiredRoles }, createdAt: { $lt: cutoff } }, 'name email role employeeId createdAt').lean();
}

async function taskSnapshots(user, ids = []) {
  const unique = uniqueIds(ids).filter((id) => mongoose.isValidObjectId(id));
  if (!unique.length) return [];
  const scope = await taskScopeFilter(user);
  const tasks = await Task.find({ $and: [scope, { _id: { $in: unique }, isArchived: false }] }, 'taskKey title status corrected').lean();
  if (tasks.length !== unique.length) throw new AppError('One or more selected tasks are not available to you.', 422);
  const byId = new Map(tasks.map((task) => [String(task._id), task]));
  return unique.map((id) => {
    const task = byId.get(id);
    return { task: task._id, taskKey: task.taskKey, title: task.corrected?.title || task.title, status: task.corrected?.status || task.status };
  });
}

/** Rejects any write for a date other than the server's current working date. */
function assertWritableDate(dateKey, today) {
  if (!isDateKey(dateKey)) throw new AppError('Invalid date. Use YYYY-MM-DD.', 422);
  if (dateKey < today.today) throw new LockedError();
  if (dateKey > today.today) throw new AppError('You cannot record work for a future date.', 422);
}

export async function saveWorkLog(ctx, dateKey, input, { submit = false } = {}) {
  const today = await todayContext(ctx.now);
  assertWritableDate(dateKey, today);
  const day = today.day;
  const existing = await DailyWorkLog.findOne({ user: ctx.user._id, workDate: dateKey });
  const before = existing ? existing.toObject() : {};
  const next = {};
  if ('summary' in input) next.summary = input.summary || '';
  if ('blockers' in input) next.blockers = input.blockers || '';
  if ('nextDayPlan' in input) next.nextDayPlan = input.nextDayPlan || '';
  if ('hoursWorked' in input) next.hoursWorked = input.hoursWorked ?? undefined;
  for (const field of ['completedTasks', 'inProgressTasks', 'pendingTasks']) {
    if (Array.isArray(input[field])) next[field] = await taskSnapshots(ctx.user, input[field]);
  }
  const log = existing || new DailyWorkLog({ user: ctx.user._id, employee: ctx.user.employeeId || undefined, workDate: dateKey, dayType: day.dayType });
  Object.assign(log, next);
  log.dayType = day.dayType;
  log.lastSavedAt = ctx.now;
  log.revision = (log.revision || 0) + 1;
  let action = 'WORKLOG_SAVED';
  if (!day.isWorkingDay) {
    log.status = 'NOTE';
    action = 'WORKLOG_NOTE_SAVED';
  } else if (submit) {
    if (!String(log.summary || '').trim()) throw new AppError('Add a work summary before submitting your daily work log.', 422);
    log.status = 'SUBMITTED';
    log.submittedAt = ctx.now;
    if (!log.firstSubmittedAt) log.firstSubmittedAt = ctx.now;
    action = 'WORKLOG_SUBMITTED';
  } else if (!existing || log.status !== 'SUBMITTED') {
    log.status = 'DRAFT';
  }
  await log.save();
  const diff = diffFields(before, log.toObject(), [...LOG_FIELDS, 'status']);
  await recordAudit(ctx, {
    action, recordType: 'DailyWorkLog', recordId: log._id, subjectUser: ctx.user._id, workDate: dateKey,
    oldValue: diff?.oldValue || null, newValue: diff?.newValue || { status: log.status }, meta: { dayType: day.dayType }
  });
  return log;
}

export async function addWorkLogComment(ctx, logId, input, files = []) {
  if (!mongoose.isValidObjectId(logId)) throw new AppError('Work log not found', 404);
  const log = await DailyWorkLog.findById(logId);
  if (!log) throw new AppError('Work log not found', 404);
  await assertCanView(ctx.user, log.user);
  const today = await todayContext(ctx.now);
  const urls = (input.urls || []).map((item) => buildUrlEntry(typeof item === 'string' ? { url: item } : item));
  const commentId = new mongoose.Types.ObjectId();
  const attachments = files.length ? await storeAttachments(ctx, files, { workLog: log, parentType: 'TaskComment', parentId: commentId, workDate: today.today }) : [];
  const mentions = await resolveMentions(input.text, input.mentions || []);
  const comment = await TaskComment.create({
    _id: commentId, workLog: log._id, author: ctx.user._id, text: input.text, mentions, urls,
    attachments: attachments.map((item) => item._id), workDate: today.today
  });
  await recordAudit(ctx, { action: 'WORKLOG_COMMENT_ADDED', recordType: 'TaskComment', recordId: comment._id, subjectUser: log.user, workDate: today.today, newValue: { text: comment.text, logDate: log.workDate } });
  const link = workLogLink(log.workDate, idOf(log.user));
  if (mentions.length) {
    await recordAudit(ctx, { action: 'EMPLOYEE_MENTIONED', recordType: 'TaskComment', recordId: comment._id, subjectUser: log.user, workDate: today.today, newValue: { mentioned: mentions }, meta: { context: 'WORKLOG' } });
    await notify(mentions, { type: NOTIFICATION_TYPES.TASK_MENTION, title: `${ctx.user.name} mentioned you`, message: `Daily work log ${log.workDate}: "${comment.text.slice(0, 140)}"`, entityType: 'DailyWorkLog', entityId: log._id, link }, ctx.user);
  }
  await notify([log.user].filter((id) => !mentions.includes(idOf(id))), { type: NOTIFICATION_TYPES.TASK_COMMENT, title: 'New comment on your work log', message: `${ctx.user.name} commented on ${log.workDate}: "${comment.text.slice(0, 140)}"`, entityType: 'DailyWorkLog', entityId: log._id, link }, ctx.user);
  return comment;
}

async function ownTodayLog(ctx, dateKey) {
  const today = await todayContext(ctx.now);
  assertWritableDate(dateKey, today);
  let log = await DailyWorkLog.findOne({ user: ctx.user._id, workDate: dateKey });
  if (!log) {
    log = await DailyWorkLog.create({ user: ctx.user._id, employee: ctx.user.employeeId || undefined, workDate: dateKey, dayType: today.day.dayType, status: today.day.isWorkingDay ? 'DRAFT' : 'NOTE', lastSavedAt: ctx.now });
  }
  return { log, today };
}

export async function addWorkLogAttachments(ctx, dateKey, files) {
  if (!files?.length) throw new AppError('Choose at least one file to upload.', 422);
  const { log, today } = await ownTodayLog(ctx, dateKey);
  return storeAttachments(ctx, files, { workLog: log, parentType: 'DailyWorkLog', parentId: log._id, workDate: today.today });
}

export async function addWorkLogUrl(ctx, dateKey, input) {
  const entry = buildUrlEntry(input);
  const { log, today } = await ownTodayLog(ctx, dateKey);
  const url = await TaskUrl.create({ ...entry, workLog: log._id, parentType: 'DailyWorkLog', addedBy: ctx.user._id, workDate: today.today });
  await recordAudit(ctx, { action: 'URL_ADDED', recordType: 'TaskUrl', recordId: url._id, subjectUser: ctx.user._id, workDate: today.today, newValue: entry, meta: { workLog: String(log._id) } });
  return url;
}

async function daySummary(userId, dateKey, settings) {
  const start = zonedTimeToUtc(dateKey, 0, 0, settings.timezone);
  const end = lockInstant(dateKey, settings.timezone);
  const uid = new mongoose.Types.ObjectId(idOf(userId));
  const [created, completed, activity] = await Promise.all([
    Task.find({ $or: [{ owner: uid }, { assignee: uid }], workDate: dateKey, isArchived: false }, 'taskKey title status priority parent').lean(),
    Task.find({ $or: [{ owner: uid }, { assignee: uid }], completedAt: { $gte: start, $lt: end }, isArchived: false }, 'taskKey title status priority').lean(),
    TaskAuditLog.aggregate([{ $match: { actor: uid, workDate: dateKey } }, { $group: { _id: '$action', count: { $sum: 1 } } }])
  ]);
  return { tasksCreated: created, tasksCompleted: completed, activity: Object.fromEntries(activity.map((row) => [row._id, row.count])) };
}

export async function getWorkLog(ctx, dateKey, targetUserId) {
  if (!isDateKey(dateKey)) throw new AppError('Invalid date. Use YYYY-MM-DD.', 422);
  const userId = targetUserId || ctx.user._id;
  if (!mongoose.isValidObjectId(userId)) throw new AppError('Invalid user', 422);
  await assertCanView(ctx.user, userId);
  const today = await todayContext(ctx.now);
  const { settings } = today;
  const [day, log, subject] = await Promise.all([
    getDayInfo(dateKey, settings),
    DailyWorkLog.findOne({ user: userId, workDate: dateKey }).lean(),
    User.findById(userId, 'name email role createdAt').lean()
  ]);
  if (!subject) throw new AppError('User not found', 404);
  const locked = isDateLocked(dateKey, settings.timezone, ctx.now);
  const [attachments, urls, comments, corrections, summary] = log ? await Promise.all([
    TaskAttachment.find({ workLog: log._id, parentType: 'DailyWorkLog', isRemoved: false }, '-storageKey -storageProvider -resourceType').populate('uploadedBy', 'name').lean(),
    TaskUrl.find({ workLog: log._id, isRemoved: false }).populate('addedBy', 'name').lean(),
    TaskComment.find({ workLog: log._id }).sort({ createdAt: 1 }).populate('author', 'name').populate({ path: 'attachments', select: 'name size mimeType' }).lean(),
    CorrectionRequest.find({ workLog: log._id }).populate('requestedBy reviewedBy', 'name').sort({ createdAt: -1 }).lean(),
    daySummary(userId, dateKey, settings)
  ]) : [[], [], [], [], await daySummary(userId, dateKey, settings)];
  const isRequired = settings.requiredRoles.includes(subject.role) && new Date(subject.createdAt) < lockInstant(dateKey, settings.timezone);
  let displayStatus = log?.status || null;
  if (!log || log.status === 'DRAFT') {
    if (!day.isWorkingDay) displayStatus = log ? 'NOTE' : null;
    else if (locked && isRequired) displayStatus = 'NOT_SUBMITTED';
    else if (dateKey > today.today) displayStatus = 'UPCOMING';
    else displayStatus = log ? 'DRAFT' : 'PENDING';
  }
  const own = sameId(userId, ctx.user);
  return {
    date: dateKey,
    user: subject,
    day,
    log: log ? effectiveLog(log) : null,
    displayStatus,
    isRequired,
    locked,
    lockAt: lockInstant(dateKey, settings.timezone),
    editable: own && !locked && dateKey === today.today,
    canRequestCorrection: own && locked && Boolean(log),
    attachments, urls, comments, corrections, summary,
    serverTime: ctx.now,
    today: today.today,
    timezone: settings.timezone
  };
}

/** Tasks the employee can pick for today's log, grouped by current status. */
export async function workLogSuggestions(ctx) {
  const today = await todayContext(ctx.now);
  const uid = ctx.user._id;
  const start = zonedTimeToUtc(today.today, 0, 0, today.timezone);
  const tasks = await Task.find({
    isArchived: false,
    $or: [{ owner: uid }, { assignee: uid }, { collaborators: uid }],
    $and: [{ $or: [{ status: { $nin: CLOSED_TASK_STATUSES } }, { completedAt: { $gte: start } }] }]
  }, 'taskKey title status priority deadline parent completedAt').sort({ updatedAt: -1 }).limit(200).lean();
  return {
    completed: tasks.filter((task) => task.status === 'COMPLETED'),
    inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS'),
    pending: tasks.filter((task) => ['PENDING', 'ON_HOLD', 'BLOCKED'].includes(task.status))
  };
}

export async function listWorkLogs(ctx, query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const filter = {};
  if (query.user && query.user !== 'all') {
    await assertCanView(ctx.user, query.user);
    filter.user = query.user;
  } else if (!hasPermission(ctx.user, 'worklog:read:all')) {
    const team = query.user === 'all' ? await teamUserIds(ctx.user) : [];
    filter.user = { $in: [String(ctx.user._id), ...team] };
  }
  if (isDateKey(query.from) || isDateKey(query.to)) {
    filter.workDate = {};
    if (isDateKey(query.from)) filter.workDate.$gte = query.from;
    if (isDateKey(query.to)) filter.workDate.$lte = query.to;
  }
  if (query.status) filter.status = { $in: String(query.status).split(',') };
  const [rows, total] = await Promise.all([
    DailyWorkLog.find(filter).populate('user', 'name email').sort({ workDate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    DailyWorkLog.countDocuments(filter)
  ]);
  return { data: rows.map(effectiveLog), page, limit, total };
}

export async function workLogCalendar(ctx, month, targetUserId) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new AppError('Invalid month. Use YYYY-MM.', 422);
  const today = await todayContext(ctx.now);
  const { settings } = today;
  const from = `${month}-01`;
  const nextMonthStart = `${addDays(from, 31).slice(0, 7)}-01`;
  const to = addDays(nextMonthStart, -1);
  const days = await getDayInfos(from, to, settings);
  const teamView = targetUserId === 'all';
  if (teamView) {
    const scopeAll = hasPermission(ctx.user, 'worklog:read:all');
    const team = scopeAll ? null : await teamUserIds(ctx.user);
    if (!scopeAll && !team.length) throw new AppError('You do not have permission to view team work logs.', 403);
    const logFilter = { workDate: { $gte: from, $lte: to }, ...(team ? { user: { $in: team.map((id) => new mongoose.Types.ObjectId(id)) } } : {}) };
    const [logs, users] = await Promise.all([
      DailyWorkLog.aggregate([{ $match: logFilter }, { $group: { _id: { date: '$workDate', status: '$status' }, count: { $sum: 1 } } }]),
      requiredUsers(settings, to)
    ]);
    const scopedUsers = team ? users.filter((user) => team.includes(String(user._id))) : users;
    const counts = new Map();
    for (const row of logs) counts.set(`${row._id.date}:${row._id.status}`, row.count);
    return days.map((day) => {
      const locked = isDateLocked(day.date, settings.timezone, ctx.now);
      const required = scopedUsers.filter((user) => new Date(user.createdAt) < lockInstant(day.date, settings.timezone)).length;
      const submitted = counts.get(`${day.date}:SUBMITTED`) || 0;
      return {
        ...day, locked, isToday: day.date === today.today, isFuture: day.date > today.today,
        submitted, notes: counts.get(`${day.date}:NOTE`) || 0,
        required: day.isWorkingDay ? required : 0,
        missing: day.isWorkingDay && locked ? Math.max(required - submitted, 0) : 0
      };
    });
  }
  const userId = targetUserId || String(ctx.user._id);
  await assertCanView(ctx.user, userId);
  const subject = await User.findById(userId, 'role createdAt').lean();
  if (!subject) throw new AppError('User not found', 404);
  const [logs, taskCounts] = await Promise.all([
    DailyWorkLog.find({ user: userId, workDate: { $gte: from, $lte: to } }, 'workDate status summary submittedAt correctionCount').lean(),
    Task.aggregate([{ $match: { $or: [{ owner: new mongoose.Types.ObjectId(userId) }, { assignee: new mongoose.Types.ObjectId(userId) }], workDate: { $gte: from, $lte: to }, isArchived: false } }, { $group: { _id: '$workDate', count: { $sum: 1 } } }])
  ]);
  const logByDate = new Map(logs.map((log) => [log.workDate, log]));
  const tasksByDate = new Map(taskCounts.map((row) => [row._id, row.count]));
  const required = settings.requiredRoles.includes(subject.role);
  return days.map((day) => {
    const log = logByDate.get(day.date);
    const locked = isDateLocked(day.date, settings.timezone, ctx.now);
    const existed = new Date(subject.createdAt) < lockInstant(day.date, settings.timezone);
    let status = log?.status || null;
    if ((!log || log.status === 'DRAFT') && day.isWorkingDay && locked && required && existed) status = 'NOT_SUBMITTED';
    return {
      ...day, locked, isToday: day.date === today.today, isFuture: day.date > today.today,
      status, hasLog: Boolean(log), hasCorrections: Boolean(log?.correctionCount), taskCount: tasksByDate.get(day.date) || 0
    };
  });
}

async function reportingManagerUsers(userDocs) {
  const employeeIds = userDocs.map((user) => user.employeeId).filter(Boolean);
  if (!employeeIds.length) return new Map();
  const employees = await Employee.find({ _id: { $in: employeeIds } }, 'reportingManager').lean();
  const managerEmployeeIds = employees.map((employee) => employee.reportingManager).filter(Boolean);
  const managers = managerEmployeeIds.length ? await User.find({ employeeId: { $in: managerEmployeeIds }, isActive: true }, '_id employeeId').lean() : [];
  const managerUserByEmployee = new Map(managers.map((manager) => [String(manager.employeeId), String(manager._id)]));
  const managerByEmployee = new Map(employees.map((employee) => [String(employee._id), managerUserByEmployee.get(String(employee.reportingManager))]));
  return new Map(userDocs.map((user) => [String(user._id), managerByEmployee.get(String(user.employeeId))]).filter(([, manager]) => manager));
}

/**
 * Idempotently closes a past date: stamps lockedAt on every log and permanently marks required
 * employees without a submitted log as NOT_SUBMITTED, notifying them and their managers.
 */
export async function finalizeDay(dateKey, now = new Date()) {
  const settings = await getTaskSettings();
  if (!isDateLocked(dateKey, settings.timezone, now)) throw new AppError('A date can only be locked after its 23:59:59 deadline.', 422);
  if (await DayFinalization.exists({ date: dateKey })) return { date: dateKey, alreadyFinalized: true };
  const ctx = systemContext(now);
  const day = await getDayInfo(dateKey, settings);
  const lockAt = lockInstant(dateKey, settings.timezone);
  const existingLogs = await DailyWorkLog.find({ workDate: dateKey, lockedAt: { $exists: false } }, '_id user status').lean();
  if (existingLogs.length) {
    await DailyWorkLog.updateMany({ _id: { $in: existingLogs.map((log) => log._id) } }, { $set: { lockedAt: lockAt } });
    for (const log of existingLogs) {
      await recordAudit(ctx, { action: 'DAILY_RECORD_LOCKED', recordType: 'DailyWorkLog', recordId: log._id, subjectUser: log.user, workDate: dateKey, newValue: { status: log.status, lockedAt: lockAt } });
    }
  }
  let required = [];
  let missing = [];
  if (day.isWorkingDay) {
    required = await requiredUsers(settings, dateKey);
    const submitted = new Set((await DailyWorkLog.find({ workDate: dateKey, status: 'SUBMITTED' }, 'user').lean()).map((log) => String(log.user)));
    missing = required.filter((user) => !submitted.has(String(user._id)));
    for (const user of missing) {
      const log = await DailyWorkLog.findOneAndUpdate(
        { user: user._id, workDate: dateKey },
        {
          $set: { status: 'NOT_SUBMITTED', notSubmittedMarkedAt: now, lockedAt: lockAt },
          $setOnInsert: { user: user._id, employee: user.employeeId || undefined, workDate: dateKey, dayType: day.dayType }
        },
        { upsert: true, new: true }
      );
      await recordAudit(ctx, { action: 'WORKLOG_NOT_SUBMITTED', recordType: 'DailyWorkLog', recordId: log._id, subjectUser: user._id, workDate: dateKey, newValue: { status: 'NOT_SUBMITTED' } });
      await notify([user._id], {
        type: NOTIFICATION_TYPES.WORKLOG_NOT_SUBMITTED, title: 'Daily work log not submitted',
        message: `Your daily work log for ${dateKey} was not submitted before 23:59. Use Request correction if you need to add it.`,
        entityType: 'DailyWorkLog', entityId: log._id, link: workLogLink(dateKey), dedupeKey: `worklog-missing:${dateKey}`
      });
    }
    if (missing.length && settings.notifyManagersOnMissed) {
      const managers = await reportingManagerUsers(missing);
      const byManager = new Map();
      for (const user of missing) {
        const manager = managers.get(String(user._id));
        if (!manager) continue;
        if (!byManager.has(manager)) byManager.set(manager, []);
        byManager.get(manager).push(user.name);
      }
      for (const [manager, names] of byManager) {
        await notify([manager], {
          type: NOTIFICATION_TYPES.WORKLOG_MISSING_DIGEST, title: 'Team work logs missing',
          message: `${names.length} team member(s) did not submit on ${dateKey}: ${names.slice(0, 10).join(', ')}${names.length > 10 ? '…' : ''}`,
          entityType: 'DailyWorkLog', link: '/tasks/calendar', dedupeKey: `worklog-missing-team:${dateKey}`
        });
      }
      const admins = (await User.find({ isActive: true }).lean()).filter((user) => hasPermission(user, 'worklog:read:all')).map((user) => user._id);
      await notify(admins, {
        type: NOTIFICATION_TYPES.WORKLOG_MISSING_DIGEST, title: 'Missing daily work logs',
        message: `${missing.length} of ${required.length} employee(s) did not submit a daily work log for ${dateKey}.`,
        entityType: 'DailyWorkLog', link: '/tasks/calendar', dedupeKey: `worklog-missing-admin:${dateKey}`
      });
    }
  }
  try {
    await DayFinalization.create({ date: dateKey, finalizedAt: now, requiredCount: required.length, submittedCount: required.length - missing.length, missingCount: missing.length });
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  return { date: dateKey, dayType: day.dayType, required: required.length, missing: missing.length };
}

export async function finalizePendingDays(now = new Date(), lookbackDays = 7) {
  const today = await todayContext(now);
  const results = [];
  for (let offset = lookbackDays; offset >= 1; offset -= 1) {
    const dateKey = addDays(today.today, -offset);
    if (!(await DayFinalization.exists({ date: dateKey }))) results.push(await finalizeDay(dateKey, now));
  }
  return results;
}

/** Sends the most recent due reminder (by configured HH:MM) to required employees who have not submitted today. */
export async function runDailyReminders(now = new Date()) {
  const today = await todayContext(now);
  if (!today.day.isWorkingDay) return { sent: 0, reason: 'non-working day' };
  const due = today.settings.reminderTimes.filter((time) => time <= today.time).pop();
  if (!due) return { sent: 0, reason: 'no reminder due' };
  const users = await requiredUsers(today.settings, today.today);
  const submitted = new Set((await DailyWorkLog.find({ workDate: today.today, status: 'SUBMITTED' }, 'user').lean()).map((log) => String(log.user)));
  const pending = users.filter((user) => !submitted.has(String(user._id))).map((user) => user._id);
  const sent = await notify(pending, {
    type: NOTIFICATION_TYPES.WORKLOG_REMINDER, title: 'Submit your daily work log',
    message: `Reminder: submit today's work log (${today.today}) before 23:59:59 ${today.timezone}. After that the date is locked.`,
    entityType: 'DailyWorkLog', link: workLogLink(today.today), dedupeKey: `worklog-reminder:${today.today}:${due}`
  });
  return { sent, time: due, pending: pending.length };
}

export async function lockDate(ctx, dateKey) {
  if (!isDateKey(dateKey)) throw new AppError('Invalid date. Use YYYY-MM-DD.', 422);
  const result = await finalizeDay(dateKey, ctx.now);
  await recordAudit(ctx, { action: 'DAILY_RECORD_LOCKED', recordType: 'DayFinalization', workDate: dateKey, newValue: result, meta: { manual: true } });
  return result;
}
