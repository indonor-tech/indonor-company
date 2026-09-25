import express from 'express';
import fs from 'node:fs/promises';
import Joi from 'joi';
import User from '../../auth/user.model.js';
import { Department, Technology } from '../../common/catalog.model.js';
import { Project } from '../task.models.js';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AppError } from '../../../utils/errors.js';
import { pagination, sendSuccess } from '../../../utils/response.js';
import { getPrivateFileUrl, readPrivateFileBuffer } from '../../../services/fileStorage.service.js';
import { TASK_PRIORITIES, TASK_STATUSES, URL_KINDS } from '../task.constants.js';
import { requestContext } from '../services/context.js';
import {
  addMentions, archiveTask, assignTask, changePriority, changeStatus, createTask, listTasks, subtaskTree, updateTask, loadTaskForUser
} from '../services/task.service.js';
import {
  addAttachments, addComment, addUrl, editComment, listComments, loadAttachmentForDownload, removeAttachment, removeUrl, taskDetail, taskTimeline
} from '../services/taskActivity.service.js';
import { createCorrection } from '../services/correction.service.js';
import { TASK_UPLOAD_MAX_BYTES, TASK_UPLOAD_MAX_FILES, TASK_FILE_TYPES, taskUploadMiddleware } from '../services/taskFiles.js';
import { todayContext } from '../services/workCalendar.service.js';
import { contentDisposition, objectId, optionalObjectId, parseJsonField, uploadLimiter, validateValue, writeLimiter } from './routeUtils.js';

const router = express.Router();

const nullableDate = Joi.date().iso().allow(null, '');
const hours = Joi.number().min(0).max(2000).allow(null);
const baseFields = {
  description: Joi.string().max(5000).allow(''),
  content: Joi.string().max(100000).allow(''),
  project: optionalObjectId,
  client: Joi.string().trim().max(160).allow(''),
  department: optionalObjectId,
  technology: Joi.string().trim().max(80).allow(''),
  module: Joi.string().trim().max(120).allow(''),
  priority: Joi.string().valid(...TASK_PRIORITIES),
  status: Joi.string().valid(...TASK_STATUSES),
  deadline: nullableDate,
  estimatedHours: hours,
  actualHours: hours,
  assignee: objectId,
  collaborators: Joi.array().items(objectId).max(50),
  mentions: Joi.array().items(objectId).max(50)
};
const createInput = Joi.object({ title: Joi.string().trim().min(1).max(200).required(), owner: objectId, ...baseFields });
const updateInput = Joi.object({ title: Joi.string().trim().min(1).max(200), assignmentNote: Joi.string().max(1000).allow(''), ...baseFields }).min(1);
const commentInput = Joi.object({
  text: Joi.string().trim().min(1).max(5000).required(),
  mentions: Joi.array().items(objectId).max(50),
  urls: Joi.array().items(Joi.alternatives(Joi.string().max(2048), Joi.object({ url: Joi.string().max(2048).required(), label: Joi.string().max(160).allow(''), kind: Joi.string().valid(...URL_KINDS) }))).max(10)
});
const urlInput = Joi.object({ url: Joi.string().trim().max(2048).required(), label: Joi.string().trim().max(160).allow(''), kind: Joi.string().valid(...URL_KINDS) });
const correctionInput = Joi.object({ reason: Joi.string().trim().min(5).max(2000).required(), requestedChanges: Joi.object().min(1).required() });

function cleanTaskInput(body) {
  const next = { ...body };
  if (next.deadline === '') next.deadline = null;
  for (const key of ['project', 'department']) if (next[key] === '') next[key] = null;
  return next;
}

function multipartComment(req) {
  return validateValue(commentInput, {
    text: req.body.text,
    mentions: parseJsonField(req.body.mentions, []),
    urls: parseJsonField(req.body.urls, [])
  });
}

router.use(authenticate, authorize('task:read'));

router.get('/meta', asyncHandler(async (req, res) => {
  const today = await todayContext(new Date());
  return sendSuccess(res, {
    statuses: TASK_STATUSES,
    priorities: TASK_PRIORITIES,
    urlKinds: URL_KINDS,
    upload: { maxBytes: TASK_UPLOAD_MAX_BYTES, maxFiles: TASK_UPLOAD_MAX_FILES, extensions: Object.keys(TASK_FILE_TYPES) },
    today: today.today,
    timezone: today.timezone,
    serverTime: today.now,
    lockAt: today.lockAt,
    day: today.day,
    timeTrackingEnabled: today.settings.timeTrackingEnabled,
    maxSubtaskDepth: today.settings.maxSubtaskDepth
  }, 'Task settings fetched');
}));

router.get('/lookups', asyncHandler(async (_req, res) => {
  const [departments, technologies, projects] = await Promise.all([
    Department.find({ isDeleted: false }, 'name').sort({ name: 1 }).limit(500).lean(),
    Technology.find({ isDeleted: false }, 'name').sort({ name: 1 }).limit(1000).lean(),
    Project.find({ status: { $ne: 'ARCHIVED' } }, 'name code client department technologies status').sort({ name: 1 }).limit(1000).lean()
  ]);
  return sendSuccess(res, { departments, technologies: technologies.map((item) => item.name), projects }, 'Task lookups fetched');
}));

router.get('/mentionable-users', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  const filter = { isActive: true, ...(q && { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }) };
  const users = await User.find(filter, 'name email role').sort({ name: 1 }).limit(Math.min(Number(req.query.limit) || 200, 500)).lean();
  return sendSuccess(res, users.map((user) => ({ id: user._id, name: user.name, email: user.email, role: user.role })), 'Users fetched');
}));

router.get('/', asyncHandler(async (req, res) => {
  const result = await listTasks(requestContext(req), req.query);
  return sendSuccess(res, result.data, 'Tasks fetched', pagination(result.page, result.limit, result.total));
}));

router.post('/', authorize('task:create'), writeLimiter, validate(createInput), asyncHandler(async (req, res) => {
  const task = await createTask(requestContext(req), cleanTaskInput(req.body));
  return sendSuccess(res, task, 'Task created');
}));

router.get('/attachments/:attachmentId/download', asyncHandler(async (req, res) => {
  const attachment = await loadAttachmentForDownload(requestContext(req), req.params.attachmentId);
  const inline = req.query.inline === '1' && /^(image\/(png|jpeg|webp)|application\/pdf)$/.test(attachment.mimeType || '');
  res.setHeader('Content-Disposition', contentDisposition(attachment.name, inline));
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.type(attachment.mimeType || 'application/octet-stream');
  if (attachment.storageProvider === 'cloudinary') {
    try {
      return res.send(await readPrivateFileBuffer(attachment));
    } catch {
      throw new AppError('File is unavailable', 404);
    }
  }
  const file = await getPrivateFileUrl(attachment);
  try { await fs.access(file); } catch { throw new AppError('File is unavailable', 404); }
  return res.sendFile(file);
}));

router.get('/:id', asyncHandler(async (req, res) => sendSuccess(res, await taskDetail(requestContext(req), req.params.id), 'Task fetched')));

router.patch('/:id', writeLimiter, validate(updateInput), asyncHandler(async (req, res) => {
  const ctx = requestContext(req);
  await updateTask(ctx, req.params.id, cleanTaskInput(req.body));
  return sendSuccess(res, await taskDetail(ctx, req.params.id), 'Task updated');
}));

router.delete('/:id', writeLimiter, asyncHandler(async (req, res) => sendSuccess(res, await archiveTask(requestContext(req), req.params.id), 'Task removed')));

router.post('/:id/assign', authorize('task:assign'), writeLimiter, validate(Joi.object({ assignee: objectId.required(), note: Joi.string().max(1000).allow('') })), asyncHandler(async (req, res) => {
  return sendSuccess(res, await assignTask(requestContext(req), req.params.id, req.body), 'Task assigned');
}));

router.patch('/:id/status', writeLimiter, validate(Joi.object({ status: Joi.string().valid(...TASK_STATUSES).required() })), asyncHandler(async (req, res) => {
  return sendSuccess(res, await changeStatus(requestContext(req), req.params.id, req.body.status), 'Status updated');
}));

router.patch('/:id/priority', writeLimiter, validate(Joi.object({ priority: Joi.string().valid(...TASK_PRIORITIES).required() })), asyncHandler(async (req, res) => {
  return sendSuccess(res, await changePriority(requestContext(req), req.params.id, req.body.priority), 'Priority updated');
}));

router.get('/:id/subtasks', asyncHandler(async (req, res) => {
  const { task } = await loadTaskForUser(requestContext(req), req.params.id);
  return sendSuccess(res, await subtaskTree(task._id), 'Subtasks fetched');
}));

router.post('/:id/subtasks', authorize('task:create'), writeLimiter, validate(createInput), asyncHandler(async (req, res) => {
  const task = await createTask(requestContext(req), cleanTaskInput(req.body), { parentId: req.params.id });
  return sendSuccess(res, task, 'Subtask created');
}));

router.get('/:id/comments', asyncHandler(async (req, res) => sendSuccess(res, await listComments(requestContext(req), req.params.id), 'Comments fetched')));

router.post('/:id/comments', writeLimiter, uploadLimiter, taskUploadMiddleware('files'), asyncHandler(async (req, res) => {
  const comment = await addComment(requestContext(req), req.params.id, multipartComment(req), req.files || []);
  return sendSuccess(res, comment, 'Comment added');
}));

router.patch('/:id/comments/:commentId', writeLimiter, validate(Joi.object({ text: Joi.string().trim().min(1).max(5000).required() })), asyncHandler(async (req, res) => {
  return sendSuccess(res, await editComment(requestContext(req), req.params.id, req.params.commentId, req.body), 'Comment updated');
}));

router.delete('/:id/comments/:commentId', (_req, _res, next) => next(new AppError('Comments are part of the permanent task history and cannot be deleted.', 405)));

router.post('/:id/mentions', writeLimiter, validate(Joi.object({ userIds: Joi.array().items(objectId).max(50).default([]), note: Joi.string().max(1000).allow('') })), asyncHandler(async (req, res) => {
  return sendSuccess(res, await addMentions(requestContext(req), req.params.id, req.body), 'Employees mentioned');
}));

router.post('/:id/attachments', uploadLimiter, taskUploadMiddleware('files'), asyncHandler(async (req, res) => {
  return sendSuccess(res, await addAttachments(requestContext(req), req.params.id, req.files || []), 'Files uploaded securely');
}));

router.delete('/:id/attachments/:attachmentId', writeLimiter, asyncHandler(async (req, res) => {
  return sendSuccess(res, await removeAttachment(requestContext(req), req.params.id, req.params.attachmentId), 'File removed');
}));

router.post('/:id/urls', writeLimiter, validate(urlInput), asyncHandler(async (req, res) => sendSuccess(res, await addUrl(requestContext(req), req.params.id, req.body), 'Link added')));

router.delete('/:id/urls/:urlId', writeLimiter, asyncHandler(async (req, res) => sendSuccess(res, await removeUrl(requestContext(req), req.params.id, req.params.urlId), 'Link removed')));

router.get('/:id/audit', asyncHandler(async (req, res) => sendSuccess(res, await taskTimeline(requestContext(req), req.params.id), 'Task history fetched')));

router.post('/:id/corrections', writeLimiter, uploadLimiter, taskUploadMiddleware('files'), asyncHandler(async (req, res) => {
  const input = validateValue(correctionInput, { reason: req.body.reason, requestedChanges: parseJsonField(req.body.requestedChanges, {}) });
  const request = await createCorrection(requestContext(req), { targetType: 'Task', targetId: req.params.id, ...input }, req.files || []);
  return sendSuccess(res, request, 'Correction request submitted');
}));

export default router;
