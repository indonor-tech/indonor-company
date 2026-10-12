import express from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AppError } from '../../../utils/errors.js';
import { pagination, sendSuccess } from '../../../utils/response.js';
import {
  DOCUMENT_TYPES, MILESTONE_STATUSES, PROJECT_MEMBER_ROLES, PROJECT_STATUSES, PROJECT_TYPES
} from '../constants.js';
import {
  ClientActivity, CrmClient, CrmProject, ProjectDocument, ProjectMember, ProjectMilestone
} from '../crm.models.js';
import {
  escapeRegex, isSuperAdmin, nextCrmId, notifyUser, pageParams, stripFinancial, writeCrmAudit
} from '../crm.helpers.js';
import { rejectViewAdminMutations, requireCrmPage } from '../middleware/crmAccess.js';
import { normalizeRole } from '../../auth/roles.js';

const router = express.Router();
const objectId = Joi.string().hex().length(24);

const projectBody = Joi.object({
  projectName: Joi.string().trim().min(1).max(200).required(),
  projectCode: Joi.string().trim().max(40).allow(''),
  clientId: objectId.required(),
  projectDescription: Joi.string().trim().max(8000).allow(''),
  projectType: Joi.string().valid(...PROJECT_TYPES, ''),
  industry: Joi.string().trim().max(120).allow(''),
  estimatedStartDate: Joi.date().iso().allow(null),
  actualStartDate: Joi.date().iso().allow(null),
  expectedEndDate: Joi.date().iso().allow(null),
  actualEndDate: Joi.date().iso().allow(null),
  status: Joi.string().valid(...PROJECT_STATUSES),
  scope: Joi.string().trim().max(8000).allow(''),
  requirements: Joi.string().trim().max(8000).allow(''),
  features: Joi.string().trim().max(8000).allow(''),
  technologyStack: Joi.array().items(Joi.string().trim().max(80)),
  thirdPartyIntegrations: Joi.string().trim().max(2000).allow(''),
  hostingRequirements: Joi.string().trim().max(2000).allow(''),
  domain: Joi.string().trim().max(200).allow(''),
  repository: Joi.string().trim().max(500).allow(''),
  deploymentDetails: Joi.string().trim().max(4000).allow(''),
  environmentDetails: Joi.string().trim().max(4000).allow(''),
  specialInstructions: Joi.string().trim().max(4000).allow(''),
  contractValue: Joi.number().min(0).allow(null),
  currency: Joi.string().trim().max(8),
  paymentTerms: Joi.string().trim().max(1000).allow(''),
  billingCycle: Joi.string().allow(''),
  tax: Joi.number().min(0),
  discount: Joi.number().min(0),
  finalAmount: Joi.number().min(0).allow(null)
});

async function projectIdsForUser(user) {
  const role = normalizeRole(user.role);
  if (['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(role)) return null;
  const memberships = await ProjectMember.find({ userId: user._id, isActive: true }).select('projectId').lean();
  return memberships.map((row) => row.projectId);
}

router.use(authenticate, rejectViewAdminMutations, requireCrmPage('projects'));

router.get('/', authorize('crm:projects:read'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const filter = { isDeleted: false };
  if (PROJECT_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.clientId) filter.clientId = req.query.clientId;
  const scopedIds = await projectIdsForUser(req.user);
  if (scopedIds) filter._id = { $in: scopedIds };
  if (req.query.q) {
    const q = escapeRegex(String(req.query.q).trim());
    filter.$or = [
      { projectName: { $regex: q, $options: 'i' } },
      { projectCode: { $regex: q, $options: 'i' } },
      { projectId: { $regex: q, $options: 'i' } }
    ];
  }
  const [data, total] = await Promise.all([
    CrmProject.find(filter).populate('clientId', 'clientId clientName companyName')
      .sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    CrmProject.countDocuments(filter)
  ]);
  const rows = isSuperAdmin(req.user) ? data : data.map(stripFinancial);
  return sendSuccess(res, rows, 'Projects fetched', pagination(page, limit, total));
}));

router.get('/:id', authorize('crm:projects:read'), asyncHandler(async (req, res) => {
  const scopedIds = await projectIdsForUser(req.user);
  if (scopedIds && !scopedIds.some((id) => String(id) === String(req.params.id))) {
    throw new AppError('Project not found', 404);
  }
  const project = await CrmProject.findOne({ _id: req.params.id, isDeleted: false })
    .populate('clientId', 'clientId clientName companyName companyEmail')
    .lean();
  if (!project) throw new AppError('Project not found', 404);
  const [members, milestones, documents] = await Promise.all([
    ProjectMember.find({ projectId: project._id, isActive: true })
      .populate('userId', 'name email role').populate('employeeId', 'firstName lastName employeeId').lean(),
    ProjectMilestone.find({ projectId: project._id, isDeleted: false }).sort({ dueDate: 1 }).lean(),
    ProjectDocument.find({ projectId: project._id, isDeleted: false }).sort({ createdAt: -1 }).lean()
  ]);
  const payload = isSuperAdmin(req.user) ? project : stripFinancial(project);
  return sendSuccess(res, { ...payload, members, milestones, documents }, 'Project details fetched');
}));

router.post('/', authorize('crm:projects:write'), validate(projectBody), asyncHandler(async (req, res) => {
  const client = await CrmClient.findOne({ _id: req.body.clientId, isDeleted: false });
  if (!client) throw new AppError('Client not found', 404);
  if (!isSuperAdmin(req.user)) {
    delete req.body.contractValue;
    delete req.body.paymentTerms;
    delete req.body.billingCycle;
    delete req.body.tax;
    delete req.body.discount;
    delete req.body.finalAmount;
  }
  const project = await CrmProject.create({
    ...req.body,
    projectId: await nextCrmId('crm_project', 'PRJ'),
    createdBy: req.user._id,
    updatedBy: req.user._id
  });
  await ClientActivity.create({
    clientId: client._id, type: 'PROJECT_CREATED', title: 'Project created',
    description: project.projectName, actor: req.user._id, metadata: { projectId: project._id }
  });
  await writeCrmAudit(req, 'PROJECT_CREATED', 'CrmProject', project._id, { projectId: project.projectId });
  res.status(201);
  return sendSuccess(res, isSuperAdmin(req.user) ? project : stripFinancial(project), 'Project created');
}));

router.patch('/:id', authorize('crm:projects:write'), validate(projectBody.fork(Object.keys(projectBody.describe().keys), (s) => s.optional())), asyncHandler(async (req, res) => {
  const project = await CrmProject.findOne({ _id: req.params.id, isDeleted: false });
  if (!project) throw new AppError('Project not found', 404);
  if (!isSuperAdmin(req.user)) {
    delete req.body.contractValue;
    delete req.body.paymentTerms;
    delete req.body.billingCycle;
    delete req.body.tax;
    delete req.body.discount;
    delete req.body.finalAmount;
  }
  Object.assign(project, req.body, { updatedBy: req.user._id });
  await project.save();
  await writeCrmAudit(req, 'PROJECT_UPDATED', 'CrmProject', project._id, req.body);
  return sendSuccess(res, isSuperAdmin(req.user) ? project : stripFinancial(project.toObject()), 'Project updated');
}));

router.post('/:id/members', authorize('crm:projects:assign'), validate(Joi.object({
  userId: objectId.required(),
  employeeId: objectId.allow(null, ''),
  role: Joi.string().valid(...PROJECT_MEMBER_ROLES)
})), asyncHandler(async (req, res) => {
  const project = await CrmProject.findOne({ _id: req.params.id, isDeleted: false });
  if (!project) throw new AppError('Project not found', 404);
  const member = await ProjectMember.findOneAndUpdate(
    { projectId: project._id, userId: req.body.userId },
    {
      $set: {
        role: req.body.role || 'OTHER',
        employeeId: req.body.employeeId || null,
        assignedBy: req.user._id,
        assignedAt: new Date(),
        isActive: true
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await notifyUser({
    recipient: req.body.userId,
    type: 'PROJECT_ASSIGNED',
    title: 'Project assigned',
    message: `You were added to project ${project.projectName}.`,
    entityType: 'CrmProject',
    entityId: project._id,
    link: `/crm/projects/${project._id}`,
    actor: req.user._id,
    dedupeKey: `project-member:${project._id}:${req.body.userId}`
  });
  await writeCrmAudit(req, 'PROJECT_MEMBER_CHANGED', 'CrmProject', project._id, req.body);
  res.status(201);
  return sendSuccess(res, member, 'Project member added');
}));

router.delete('/:id/members/:memberId', authorize('crm:projects:assign'), asyncHandler(async (req, res) => {
  const member = await ProjectMember.findOneAndUpdate(
    { _id: req.params.memberId, projectId: req.params.id },
    { $set: { isActive: false } },
    { new: true }
  );
  if (!member) throw new AppError('Project member not found', 404);
  await writeCrmAudit(req, 'PROJECT_MEMBER_CHANGED', 'CrmProject', req.params.id, { removed: member.userId });
  return sendSuccess(res, member, 'Project member removed');
}));

router.post('/:id/milestones', authorize('crm:projects:write'), validate(Joi.object({
  milestoneName: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().max(4000).allow(''),
  startDate: Joi.date().iso().allow(null),
  dueDate: Joi.date().iso().allow(null),
  status: Joi.string().valid(...MILESTONE_STATUSES),
  assignedTeam: Joi.array().items(objectId)
})), asyncHandler(async (req, res) => {
  const project = await CrmProject.findOne({ _id: req.params.id, isDeleted: false });
  if (!project) throw new AppError('Project not found', 404);
  const milestone = await ProjectMilestone.create({
    ...req.body, projectId: project._id, createdBy: req.user._id
  });
  res.status(201);
  return sendSuccess(res, milestone, 'Milestone created');
}));

router.patch('/:id/milestones/:milestoneId', authorize('crm:projects:write'), validate(Joi.object({
  milestoneName: Joi.string().trim().min(1).max(200),
  description: Joi.string().trim().max(4000).allow(''),
  startDate: Joi.date().iso().allow(null),
  dueDate: Joi.date().iso().allow(null),
  status: Joi.string().valid(...MILESTONE_STATUSES),
  assignedTeam: Joi.array().items(objectId)
})), asyncHandler(async (req, res) => {
  const milestone = await ProjectMilestone.findOne({
    _id: req.params.milestoneId, projectId: req.params.id, isDeleted: false
  });
  if (!milestone) throw new AppError('Milestone not found', 404);
  Object.assign(milestone, req.body);
  await milestone.save();
  return sendSuccess(res, milestone, 'Milestone updated');
}));

router.post('/:id/documents', authorize('crm:projects:write'), validate(Joi.object({
  documentName: Joi.string().trim().min(1).max(200).required(),
  documentType: Joi.string().valid(...DOCUMENT_TYPES),
  externalUrl: Joi.string().trim().uri().allow(''),
  version: Joi.string().trim().max(40).allow('')
})), asyncHandler(async (req, res) => {
  const project = await CrmProject.findOne({ _id: req.params.id, isDeleted: false });
  if (!project) throw new AppError('Project not found', 404);
  const document = await ProjectDocument.create({
    ...req.body,
    projectId: project._id,
    storageProvider: req.body.externalUrl ? 'external' : 'local',
    uploadedBy: req.user._id
  });
  await writeCrmAudit(req, 'DOCUMENT_UPLOADED', 'ProjectDocument', document._id, { projectId: project._id });
  res.status(201);
  return sendSuccess(res, document, 'Project document saved');
}));

export default router;
