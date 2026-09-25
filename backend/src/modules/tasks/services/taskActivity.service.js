import mongoose from 'mongoose';
import { AppError } from '../../../utils/errors.js';
import { hasPermission } from '../../auth/roles.js';
import { storeFile } from '../../../services/fileStorage.service.js';
import { CorrectionRequest, DailyWorkLog, Task, TaskAttachment, TaskAuditLog, TaskComment, TaskUrl } from '../task.models.js';
import { NOTIFICATION_TYPES } from '../task.constants.js';
import { LockedError, sameId, uniqueIds } from './context.js';
import { canViewTask } from './taskAccess.service.js';
import { recordAudit } from './taskAudit.service.js';
import { notify, taskLabel, taskLink } from './taskNotify.service.js';
import { resolveMentions } from './mentions.js';
import { buildUrlEntry, validateTaskUpload } from './taskFiles.js';
import { effectiveTask, loadTaskForUser, recordMentions, subtaskTree, taskAncestors, USER_FIELDS } from './task.service.js';
import { isDateLocked, lockInstant, todayContext } from './workCalendar.service.js';

function participants(task) {
  return uniqueIds([task.owner, task.assignee, task.assignedBy, task.createdBy, ...(task.collaborators || [])]);
}

/** Validates and stores uploaded files through the shared storage service, then records attachment metadata. */
export async function storeAttachments(ctx, files, { task, workLog, parentType, parentId, workDate }) {
  const validated = (files || []).map((file) => ({ file, meta: validateTaskUpload(file) }));
  const created = [];
  for (const { file, meta } of validated) {
    let stored;
    try {
      stored = await storeFile(file, parentType === 'DailyWorkLog' ? 'WorkLog' : 'Task', String(task?._id || workLog?._id || parentId));
    } catch (error) {
      throw new AppError(error.message || 'Could not store the uploaded file.', 502);
    }
    const attachment = await TaskAttachment.create({
      task: task?._id, workLog: workLog?._id, parentType, parentId, name: meta.name,
      storageProvider: stored.storageProvider, storageKey: stored.storageKey, resourceType: stored.resourceType,
      extension: meta.extension, mimeType: meta.mimeType, size: file.size, uploadedBy: ctx.user._id, workDate
    });
    await recordAudit(ctx, {
      action: 'FILE_UPLOADED', recordType: 'TaskAttachment', recordId: attachment._id, task: task?._id, workDate,
      subjectUser: workLog?.user, newValue: { name: meta.name, size: file.size, mimeType: meta.mimeType }, meta: { parentType, parentId: String(parentId) }
    });
    created.push(attachment);
  }
  return created;
}

export async function addAttachments(ctx, taskId, files) {
  const { task, perms } = await loadTaskForUser(ctx, taskId);
  if (!perms.attach) throw new AppError('You cannot add files to this task.', 403);
  if (!files?.length) throw new AppError('Choose at least one file to upload.', 422);
  const today = await todayContext(ctx.now);
  const created = await storeAttachments(ctx, files, { task, parentType: 'Task', parentId: task._id, workDate: today.today });
  await Task.updateOne({ _id: task._id }, { lastActivityAt: ctx.now });
  return created;
}

export async function removeAttachment(ctx, taskId, attachmentId) {
  const { task, perms, settings } = await loadTaskForUser(ctx, taskId);
  const attachment = await TaskAttachment.findOne({ _id: attachmentId, task: task._id, isRemoved: false });
  if (!attachment) throw new AppError('Attachment not found', 404);
  if (!sameId(attachment.uploadedBy, ctx.user) && !hasPermission(ctx.user, 'task:update:any')) throw new AppError('Only the uploader can remove this file.', 403);
  if (isDateLocked(attachment.workDate, settings.timezone, ctx.now)) throw new LockedError('Files uploaded on a locked date cannot be removed.');
  if (!perms.view) throw new AppError('Task not found', 404);
  attachment.isRemoved = true;
  attachment.removedAt = ctx.now;
  attachment.removedBy = ctx.user._id;
  await attachment.save();
  await recordAudit(ctx, { action: 'FILE_REMOVED', recordType: 'TaskAttachment', recordId: attachment._id, task: task._id, oldValue: { name: attachment.name }, newValue: { isRemoved: true } });
  return attachment;
}

export async function addUrl(ctx, taskId, input) {
  const { task, perms } = await loadTaskForUser(ctx, taskId);
  if (!perms.attach) throw new AppError('You cannot add links to this task.', 403);
  const entry = buildUrlEntry(input);
  const today = await todayContext(ctx.now);
  const url = await TaskUrl.create({ ...entry, task: task._id, parentType: 'Task', addedBy: ctx.user._id, workDate: today.today });
  await Task.updateOne({ _id: task._id }, { lastActivityAt: ctx.now });
  await recordAudit(ctx, { action: 'URL_ADDED', recordType: 'TaskUrl', recordId: url._id, task: task._id, newValue: entry, workDate: today.today });
  return url;
}

export async function removeUrl(ctx, taskId, urlId) {
  const { task, settings } = await loadTaskForUser(ctx, taskId);
  const url = await TaskUrl.findOne({ _id: urlId, task: task._id, isRemoved: false });
  if (!url) throw new AppError('Link not found', 404);
  if (!sameId(url.addedBy, ctx.user) && !hasPermission(ctx.user, 'task:update:any')) throw new AppError('Only the person who added this link can remove it.', 403);
  if (isDateLocked(url.workDate, settings.timezone, ctx.now)) throw new LockedError('Links added on a locked date cannot be removed.');
  url.isRemoved = true;
  url.removedAt = ctx.now;
  url.removedBy = ctx.user._id;
  await url.save();
  await recordAudit(ctx, { action: 'URL_REMOVED', recordType: 'TaskUrl', recordId: url._id, task: task._id, oldValue: { url: url.url }, newValue: { isRemoved: true } });
  return url;
}

export async function addComment(ctx, taskId, input, files = []) {
  const { task, perms } = await loadTaskForUser(ctx, taskId);
  if (!perms.comment) throw new AppError('You cannot comment on this task.', 403);
  const today = await todayContext(ctx.now);
  const urls = (input.urls || []).map((item) => buildUrlEntry(typeof item === 'string' ? { url: item } : item));
  const commentId = new mongoose.Types.ObjectId();
  const attachments = files.length ? await storeAttachments(ctx, files, { task, parentType: 'TaskComment', parentId: commentId, workDate: today.today }) : [];
  const mentions = await resolveMentions(input.text, input.mentions || []);
  const comment = await TaskComment.create({
    _id: commentId, task: task._id, author: ctx.user._id, text: input.text, mentions, urls,
    attachments: attachments.map((item) => item._id), workDate: today.today
  });
  await Task.updateOne({ _id: task._id }, { lastActivityAt: ctx.now });
  await recordAudit(ctx, {
    action: 'COMMENT_ADDED', recordType: 'TaskComment', recordId: comment._id, task: task._id, workDate: today.today,
    newValue: { text: comment.text, urls: urls.map((item) => item.url), files: attachments.map((item) => item.name) }
  });
  const mentioned = mentions.filter((id) => !sameId(id, ctx.user));
  if (mentioned.length) await recordMentions(ctx, task, mentioned, { context: 'COMMENT', comment: comment._id, excerpt: comment.text, workDate: today.today });
  await notify(participants(task).filter((id) => !mentioned.includes(id)), {
    type: NOTIFICATION_TYPES.TASK_COMMENT, title: 'New comment',
    message: `${ctx.user.name} commented on ${taskLabel(task)}: "${comment.text.slice(0, 140)}"`,
    entityType: 'Task', entityId: task._id, link: taskLink(task)
  }, ctx.user);
  return comment;
}

/** Comment edits keep every previous version in `revisions` and in the audit log; comments are never deleted. */
export async function editComment(ctx, taskId, commentId, { text }) {
  const { task, settings } = await loadTaskForUser(ctx, taskId);
  const comment = await TaskComment.findOne({ _id: commentId, task: task._id });
  if (!comment) throw new AppError('Comment not found', 404);
  if (!sameId(comment.author, ctx.user)) throw new AppError('Only the author can edit a comment.', 403);
  if (isDateLocked(comment.workDate, settings.timezone, ctx.now)) throw new LockedError('Comments from a locked date cannot be edited. Submit a correction request instead.');
  if (comment.text === text) return comment;
  const previous = comment.text;
  comment.revisions.push({ text: previous, editedAt: ctx.now, editedBy: ctx.user._id });
  comment.text = text;
  comment.editedAt = ctx.now;
  const mentions = await resolveMentions(text, []);
  const fresh = mentions.filter((id) => !uniqueIds(comment.mentions).includes(id) && !sameId(id, ctx.user));
  comment.mentions = uniqueIds([...comment.mentions, ...mentions]);
  await comment.save();
  await recordAudit(ctx, { action: 'COMMENT_EDITED', recordType: 'TaskComment', recordId: comment._id, task: task._id, oldValue: { text: previous }, newValue: { text } });
  if (fresh.length) await recordMentions(ctx, task, fresh, { context: 'COMMENT', comment: comment._id, excerpt: text, workDate: comment.workDate });
  return comment;
}

export async function listComments(ctx, taskId) {
  const { task } = await loadTaskForUser(ctx, taskId);
  const comments = await TaskComment.find({ task: task._id }).sort({ createdAt: 1 })
    .populate('author', 'name email').populate('mentions', 'name').populate('revisions.editedBy', 'name')
    .populate({ path: 'attachments', select: 'name size mimeType extension isRemoved createdAt uploadedBy' }).lean();
  return comments.map((comment) => (comment.corrected ? { ...comment, ...comment.corrected, original: { text: comment.text }, hasCorrections: true } : comment));
}

export async function taskDetail(ctx, taskId) {
  const { task, perms, settings } = await loadTaskForUser(ctx, taskId);
  const populated = await Task.findById(task._id)
    .populate('owner assignee assignedBy createdBy archivedBy', USER_FIELDS)
    .populate('collaborators mentions', 'name email')
    .populate('project', 'name code client status')
    .populate('department', 'name')
    .lean();
  const [subtasks, ancestors, attachments, urls, comments, corrections] = await Promise.all([
    subtaskTree(task._id),
    taskAncestors(task),
    TaskAttachment.find({ task: task._id, parentType: 'Task', isRemoved: false }).populate('uploadedBy', 'name').sort({ createdAt: -1 }).lean(),
    TaskUrl.find({ task: task._id, isRemoved: false }).populate('addedBy', 'name').sort({ createdAt: -1 }).lean(),
    listComments(ctx, task._id),
    CorrectionRequest.find({ task: task._id }).populate('requestedBy reviewedBy', 'name').sort({ createdAt: -1 }).lean()
  ]);
  const effective = effectiveTask(populated);
  const lockAt = lockInstant(task.workDate, settings.timezone);
  const strip = ({ storageKey, storageProvider, resourceType, ...rest }) => rest;
  return {
    ...effective,
    ancestors,
    subtasks: subtasks.tree,
    progress: subtasks.progress,
    attachments: attachments.map(strip),
    urls,
    comments: comments.map((comment) => ({ ...comment, attachments: (comment.attachments || []).filter((item) => !item.isRemoved) })),
    corrections,
    lockAt,
    isLocked: perms.locked,
    isOverdue: Boolean(effective.deadline && new Date(effective.deadline) < ctx.now && !['COMPLETED', 'CANCELLED'].includes(effective.status)),
    permissions: perms,
    timeTrackingEnabled: settings.timeTrackingEnabled,
    serverTime: ctx.now,
    timezone: settings.timezone
  };
}

/** Chronological audit timeline for a task, including subtask creation and a virtual "Daily Record Locked" marker. */
export async function taskTimeline(ctx, taskId) {
  const { task, settings } = await loadTaskForUser(ctx, taskId);
  const records = await TaskAuditLog.find({ $or: [{ task: task._id }, { 'meta.parentTask': String(task._id) }] })
    .populate('actor', 'name email role').sort({ occurredAt: 1 }).limit(2000).lean();
  const lockAt = lockInstant(task.workDate, settings.timezone);
  const events = records.map((record) => ({ ...record, subtaskEvent: record.task && String(record.task) !== String(task._id) }));
  if (ctx.now >= lockAt) {
    events.push({ _id: `lock-${task._id}`, action: 'DAILY_RECORD_LOCKED', occurredAt: lockAt, workDate: task.workDate, virtual: true, newValue: { lockedDate: task.workDate } });
    events.sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  }
  return events;
}

export async function loadAttachmentForDownload(ctx, attachmentId) {
  if (!mongoose.isValidObjectId(attachmentId)) throw new AppError('File not found', 404);
  const attachment = await TaskAttachment.findById(attachmentId).lean();
  if (!attachment) throw new AppError('File not found', 404);
  if (attachment.task) {
    const task = await Task.findById(attachment.task).lean();
    if (!(await canViewTask(ctx.user, task))) throw new AppError('File not found', 404);
  } else if (attachment.workLog) {
    const log = await DailyWorkLog.findById(attachment.workLog).lean();
    const { canViewWorkLogOf } = await import('./workLog.service.js');
    if (!log || !(await canViewWorkLogOf(ctx.user, log.user))) throw new AppError('File not found', 404);
  } else if (attachment.parentType === 'CorrectionRequest') {
    const request = await CorrectionRequest.findById(attachment.parentId).lean();
    const allowed = request && (sameId(request.requestedBy, ctx.user) || hasPermission(ctx.user, 'task:correction:approve'));
    if (!allowed) throw new AppError('File not found', 404);
  } else {
    throw new AppError('File not found', 404);
  }
  return attachment;
}
