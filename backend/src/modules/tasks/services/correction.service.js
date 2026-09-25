import mongoose from 'mongoose';
import { AppError } from '../../../utils/errors.js';
import { hasPermission } from '../../auth/roles.js';
import { CorrectionRequest, DailyWorkLog, Task, TaskComment } from '../task.models.js';
import { CORRECTABLE_FIELDS, NOTIFICATION_TYPES, TASK_PRIORITIES, TASK_STATUSES } from '../task.constants.js';
import { idOf, sameId } from './context.js';
import { loadTaskForUser } from './task.service.js';
import { recordAudit } from './taskAudit.service.js';
import { notify, taskLabel, usersWithPermission } from './taskNotify.service.js';
import { sanitizeRichText } from './richText.js';
import { storeAttachments } from './taskActivity.service.js';
import { finalizeDay } from './workLog.service.js';
import { getTaskSettings, isDateKey, isDateLocked, todayContext } from './workCalendar.service.js';

const MAX_PENDING_PER_TARGET = 3;

async function snapshotTasks(ids) {
  const valid = (ids || []).filter((id) => mongoose.isValidObjectId(id));
  const tasks = await Task.find({ _id: { $in: valid } }, 'taskKey title status').lean();
  if (tasks.length !== valid.length) throw new AppError('One or more referenced tasks do not exist.', 422);
  return tasks.map((task) => ({ task: task._id, taskKey: task.taskKey, title: task.title, status: task.status }));
}

async function normalizeChanges(targetType, changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new AppError('Describe the requested correction.', 422);
  const allowed = CORRECTABLE_FIELDS[targetType];
  const entries = Object.entries(changes).filter(([key]) => allowed.includes(key));
  if (!entries.length) throw new AppError(`Choose at least one correctable field: ${allowed.join(', ')}`, 422);
  const result = {};
  for (const [key, value] of entries) {
    if (key === 'status' && !TASK_STATUSES.includes(value)) throw new AppError('Invalid status', 422);
    if (key === 'priority' && !TASK_PRIORITIES.includes(value)) throw new AppError('Invalid priority', 422);
    if (key === 'content') result[key] = sanitizeRichText(value);
    else if (key === 'deadline') {
      if (value && Number.isNaN(Date.parse(value))) throw new AppError('Invalid deadline', 422);
      result[key] = value ? new Date(value) : null;
    } else if (['estimatedHours', 'actualHours'].includes(key)) {
      const hours = Number(value);
      if (!Number.isFinite(hours) || hours < 0 || hours > 2000) throw new AppError(`${key} must be between 0 and 2000`, 422);
      result[key] = hours;
    } else if (['completedTasks', 'inProgressTasks', 'pendingTasks'].includes(key)) {
      result[key] = await snapshotTasks(Array.isArray(value) ? value : []);
    } else {
      const text = String(value ?? '');
      if (key === 'title' && !text.trim()) throw new AppError('Title cannot be empty', 422);
      result[key] = text.slice(0, key === 'summary' ? 10000 : 5000);
    }
  }
  return result;
}

function currentValues(doc, fields) {
  return Object.fromEntries(fields.map((field) => [field, doc.corrected?.[field] !== undefined ? doc.corrected[field] : doc[field] ?? null]));
}

async function resolveTarget(ctx, input) {
  const settings = await getTaskSettings();
  if (input.targetType === 'Task') {
    const { task, perms } = await loadTaskForUser(ctx, input.targetId);
    if (!perms.locked) throw new AppError('This task is still editable today. Edit it directly instead of requesting a correction.', 422);
    if (!perms.requestCorrection) throw new AppError('You cannot request corrections for this task.', 403);
    return { doc: task, task, workDate: task.workDate, subjectUser: task.assignee || task.owner, label: taskLabel(task) };
  }
  if (input.targetType === 'DailyWorkLog') {
    let log = null;
    if (input.targetId && mongoose.isValidObjectId(input.targetId)) log = await DailyWorkLog.findById(input.targetId);
    else if (isDateKey(input.workDate)) {
      log = await DailyWorkLog.findOne({ user: ctx.user._id, workDate: input.workDate });
      if (!log && isDateLocked(input.workDate, settings.timezone, ctx.now)) {
        await finalizeDay(input.workDate, ctx.now);
        log = await DailyWorkLog.findOne({ user: ctx.user._id, workDate: input.workDate });
      }
    }
    if (!log) throw new AppError('No work log record exists for that date.', 404);
    if (!sameId(log.user, ctx.user)) throw new AppError('You can only request corrections to your own work log.', 403);
    if (!isDateLocked(log.workDate, settings.timezone, ctx.now)) throw new AppError('Today\'s work log is still editable. Update it directly.', 422);
    return { doc: log, workLog: log, workDate: log.workDate, subjectUser: log.user, label: `Work log ${log.workDate}` };
  }
  if (input.targetType === 'TaskComment') {
    if (!mongoose.isValidObjectId(input.targetId)) throw new AppError('Comment not found', 404);
    const comment = await TaskComment.findById(input.targetId);
    if (!comment) throw new AppError('Comment not found', 404);
    if (!sameId(comment.author, ctx.user)) throw new AppError('Only the author can request a correction to a comment.', 403);
    if (!isDateLocked(comment.workDate, settings.timezone, ctx.now)) throw new AppError('This comment can still be edited directly today.', 422);
    const task = comment.task ? await Task.findById(comment.task) : null;
    return { doc: comment, task, workLog: comment.workLog ? { _id: comment.workLog } : null, workDate: comment.workDate, subjectUser: comment.author, label: 'Comment' };
  }
  throw new AppError('Unsupported correction target', 422);
}

export async function createCorrection(ctx, input, files = []) {
  const target = await resolveTarget(ctx, input);
  const requestedChanges = await normalizeChanges(input.targetType, input.requestedChanges);
  const pending = await CorrectionRequest.countDocuments({ targetId: target.doc._id, requestedBy: ctx.user._id, status: 'PENDING' });
  if (pending >= MAX_PENDING_PER_TARGET) throw new AppError('You already have pending correction requests for this record. Wait for a decision first.', 429);
  const today = await todayContext(ctx.now);
  const requestId = new mongoose.Types.ObjectId();
  const attachments = files.length
    ? await storeAttachments(ctx, files, { task: target.task, workLog: target.workLog, parentType: 'CorrectionRequest', parentId: requestId, workDate: today.today })
    : [];
  const request = await CorrectionRequest.create({
    _id: requestId,
    targetType: input.targetType,
    targetId: target.doc._id,
    task: target.task?._id,
    workLog: target.workLog?._id,
    workDate: target.workDate,
    subjectUser: target.subjectUser,
    requestedBy: ctx.user._id,
    reason: input.reason,
    requestedChanges,
    originalValues: currentValues(target.doc, Object.keys(requestedChanges)),
    attachments: attachments.map((item) => item._id)
  });
  await recordAudit(ctx, {
    action: 'CORRECTION_REQUESTED', recordType: 'CorrectionRequest', recordId: request._id, task: target.task?._id, subjectUser: target.subjectUser,
    oldValue: request.originalValues, newValue: requestedChanges, meta: { targetType: input.targetType, targetId: String(target.doc._id), reason: input.reason, lockedDate: target.workDate }
  });
  const approvers = (await usersWithPermission('task:correction:approve')).filter((id) => !sameId(id, ctx.user));
  await notify(approvers, {
    type: NOTIFICATION_TYPES.CORRECTION_SUBMITTED, title: 'Correction request submitted',
    message: `${ctx.user.name} requested a correction to ${target.label} (${target.workDate}): ${input.reason.slice(0, 120)}`,
    entityType: 'CorrectionRequest', entityId: request._id, link: '/tasks/corrections'
  }, ctx.user);
  return request;
}

async function loadPending(ctx, id) {
  if (!hasPermission(ctx.user, 'task:correction:approve')) throw new AppError('You do not have permission to review corrections.', 403);
  if (!mongoose.isValidObjectId(id)) throw new AppError('Correction request not found', 404);
  const request = await CorrectionRequest.findById(id);
  if (!request) throw new AppError('Correction request not found', 404);
  if (request.status !== 'PENDING') throw new AppError(`This request was already ${request.status.toLowerCase()}.`, 409);
  if (sameId(request.requestedBy, ctx.user)) throw new AppError('You cannot review your own correction request.', 403);
  return request;
}

const MODELS = { Task, DailyWorkLog, TaskComment };

/**
 * Approval never overwrites the original fields. Corrected values are stored as an overlay (`corrected`)
 * on the record and the request keeps original value, corrected value, requester, approver and both dates.
 */
export async function approveCorrection(ctx, id, note = '') {
  const request = await loadPending(ctx, id);
  const Model = MODELS[request.targetType];
  const target = await Model.findById(request.targetId);
  if (!target) throw new AppError('The corrected record no longer exists.', 404);
  const fields = Object.keys(request.requestedChanges || {});
  const originalValues = currentValues(target, fields);
  const overlay = { ...(target.corrected || {}), ...request.requestedChanges };
  await Model.collection.updateOne(
    { _id: target._id },
    { $set: { corrected: overlay, updatedAt: ctx.now }, $inc: { correctionCount: 1 } }
  );
  request.status = 'APPROVED';
  request.reviewedBy = ctx.user._id;
  request.reviewedAt = ctx.now;
  request.reviewNote = note;
  request.originalValues = originalValues;
  request.correctedValues = request.requestedChanges;
  await request.save();
  await recordAudit(ctx, {
    action: 'CORRECTION_APPROVED', recordType: 'CorrectionRequest', recordId: request._id, task: request.task, subjectUser: request.subjectUser,
    oldValue: originalValues, newValue: request.requestedChanges,
    meta: { targetType: request.targetType, targetId: String(request.targetId), requestedBy: idOf(request.requestedBy), approvedBy: idOf(ctx.user), requestDate: request.createdAt, approvalDate: ctx.now, reason: request.reason, note }
  });
  await notify([request.requestedBy], {
    type: NOTIFICATION_TYPES.CORRECTION_APPROVED, title: 'Correction approved',
    message: `${ctx.user.name} approved your correction for ${request.workDate}. The original record is preserved in history.`,
    entityType: 'CorrectionRequest', entityId: request._id, link: request.task ? `/tasks/${request.task}` : '/tasks/corrections'
  }, ctx.user);
  return request;
}

export async function rejectCorrection(ctx, id, note) {
  if (!String(note || '').trim()) throw new AppError('Give a reason for rejecting this correction.', 422);
  const request = await loadPending(ctx, id);
  request.status = 'REJECTED';
  request.reviewedBy = ctx.user._id;
  request.reviewedAt = ctx.now;
  request.reviewNote = note;
  await request.save();
  await recordAudit(ctx, {
    action: 'CORRECTION_REJECTED', recordType: 'CorrectionRequest', recordId: request._id, task: request.task, subjectUser: request.subjectUser,
    newValue: { status: 'REJECTED', note }, meta: { targetType: request.targetType, targetId: String(request.targetId), requestedBy: idOf(request.requestedBy), reason: request.reason }
  });
  await notify([request.requestedBy], {
    type: NOTIFICATION_TYPES.CORRECTION_REJECTED, title: 'Correction rejected',
    message: `${ctx.user.name} rejected your correction for ${request.workDate}: ${note.slice(0, 140)}`,
    entityType: 'CorrectionRequest', entityId: request._id, link: '/tasks/corrections'
  }, ctx.user);
  return request;
}

export async function listCorrections(ctx, query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const reviewer = hasPermission(ctx.user, 'task:correction:approve');
  const filter = {};
  if (query.scope === 'review' && reviewer) filter.requestedBy = { $ne: ctx.user._id };
  else if (!(query.scope === 'all' && reviewer)) filter.requestedBy = ctx.user._id;
  if (query.status) filter.status = { $in: String(query.status).split(',') };
  const [data, total] = await Promise.all([
    CorrectionRequest.find(filter).populate('requestedBy reviewedBy subjectUser', 'name email').populate('task', 'taskKey title')
      .populate('attachments', 'name size mimeType').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CorrectionRequest.countDocuments(filter)
  ]);
  return { data, page, limit, total, reviewer };
}
