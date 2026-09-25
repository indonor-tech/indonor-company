import express from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AppError } from '../../../utils/errors.js';
import { pagination, sendSuccess } from '../../../utils/response.js';
import { Project, Task } from '../task.models.js';
import { requestContext } from '../services/context.js';
import { diffFields, recordAudit } from '../services/taskAudit.service.js';
import { methodNotAllowed, objectId, optionalObjectId, writeLimiter } from './routeUtils.js';

const router = express.Router();
const fields = {
  code: Joi.string().trim().uppercase().max(20).allow(''),
  client: Joi.string().trim().max(160).allow(''),
  description: Joi.string().max(4000).allow(''),
  department: optionalObjectId,
  technologies: Joi.array().items(Joi.string().trim().max(80)).max(30),
  status: Joi.string().valid('ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'),
  startDate: Joi.date().iso().allow(null, ''),
  endDate: Joi.date().iso().allow(null, ''),
  members: Joi.array().items(objectId).max(200)
};
const createInput = Joi.object({ name: Joi.string().trim().min(2).max(160).required(), ...fields });
const updateInput = Joi.object({ name: Joi.string().trim().min(2).max(160), ...fields }).min(1);

function clean(body) {
  const next = { ...body };
  for (const key of ['department', 'startDate', 'endDate']) if (next[key] === '') next[key] = null;
  if (next.code === '') next.code = undefined;
  return next;
}

router.use(authenticate, authorize('task:read'));

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const filter = {};
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  else if (req.query.includeArchived !== 'true') filter.status = { $ne: 'ARCHIVED' };
  if (req.query.q) filter.name = new RegExp(String(req.query.q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [rows, total] = await Promise.all([
    Project.find(filter).populate('department', 'name').populate('members', 'name').sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Project.countDocuments(filter)
  ]);
  const counts = await Task.aggregate([
    { $match: { project: { $in: rows.map((row) => row._id) }, isArchived: false, parent: null } },
    { $group: { _id: '$project', total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } } } }
  ]);
  const byProject = new Map(counts.map((row) => [String(row._id), row]));
  const data = rows.map((row) => ({ ...row, taskCount: byProject.get(String(row._id))?.total || 0, completedCount: byProject.get(String(row._id))?.completed || 0 }));
  return sendSuccess(res, data, 'Projects fetched', pagination(page, limit, total));
}));

router.post('/', authorize('task:projects:manage'), writeLimiter, validate(createInput), asyncHandler(async (req, res) => {
  const ctx = requestContext(req);
  const project = await Project.create({ ...clean(req.body), createdBy: ctx.user._id, updatedBy: ctx.user._id });
  await recordAudit(ctx, { action: 'PROJECT_CREATED', recordType: 'Project', recordId: project._id, newValue: project.toObject() });
  return sendSuccess(res, project, 'Project created');
}));

router.patch('/:id', authorize('task:projects:manage'), writeLimiter, validate(updateInput), asyncHandler(async (req, res) => {
  const ctx = requestContext(req);
  const project = await Project.findById(req.params.id);
  if (!project) throw new AppError('Project not found', 404);
  const input = clean(req.body);
  const diff = diffFields(project.toObject(), input, Object.keys(input));
  if (!diff) return sendSuccess(res, project, 'No changes');
  Object.assign(project, input, { updatedBy: ctx.user._id });
  await project.save();
  await recordAudit(ctx, { action: 'PROJECT_UPDATED', recordType: 'Project', recordId: project._id, ...diff });
  return sendSuccess(res, project, 'Project updated');
}));

router.delete('/:id', methodNotAllowed('Projects cannot be deleted because tasks reference them. Set the status to Archived instead.'));

export default router;
