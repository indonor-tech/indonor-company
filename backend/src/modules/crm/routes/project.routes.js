import express from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AppError } from '../../../utils/errors.js';
import { pagination, sendSuccess } from '../../../utils/response.js';
import {
  ADJUSTMENT_TYPES, DOCUMENT_TYPES, ENGAGEMENT_TYPES, MILESTONE_STATUSES, PARTNER_ROLES,
  PARTNERSHIP_STATUSES, PROJECT_MEMBER_ROLES, PROJECT_STATUSES, PROJECT_TYPES, SHARE_BASES
} from '../constants.js';
import {
  ClientActivity, CrmClient, CrmProject, CrmProjectPartner, PartnershipAgreement,
  ProjectActivity, ProjectDocument, ProjectMember, ProjectMilestone
} from '../crm.models.js';
import {
  canAccessFinancial, computeProjectLedger, escapeRegex, nextCrmId, notifyUser,
  pageParams, projectOverdueMeta, stripFinancial, writeCrmAudit
} from '../crm.helpers.js';
import { computePartnershipSettlement, recordProjectAdjustment, saveProjectPartnership } from '../crm.partnership.js';
import { crmUpload, storeCrmFile } from '../crm.files.js';
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
  estimatedDuration: Joi.string().trim().max(80).allow(''),
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
  finalAmount: Joi.number().min(0).allow(null),
  progressPercent: Joi.number().min(0).max(100),
  projectManager: objectId.allow(null, ''),
  notes: Joi.string().trim().max(8000).allow(''),
  nextPaymentDueDate: Joi.date().iso().allow(null),
  paymentReminderDays: Joi.number().min(0).max(90),
  engagementType: Joi.string().valid(...ENGAGEMENT_TYPES, ''),
  projectOwner: objectId.allow(null, ''),
  assignedSalesperson: objectId.allow(null, ''),
  partnershipStatus: Joi.string().valid(...PARTNERSHIP_STATUSES),
  partnershipNotes: Joi.string().trim().max(4000).allow(''),
  shareBasis: Joi.string().valid(...SHARE_BASES),
  companySharePercent: Joi.number().min(0).max(100),
  allowUnevenPercent: Joi.boolean(),
  referrerName: Joi.string().trim().max(160).allow(''),
  referrerCompany: Joi.string().trim().max(160).allow(''),
  referrerEmail: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow(''),
  referrerPhone: Joi.string().trim().max(40).allow(''),
  referralCommission: Joi.number().min(0),
  referralPercent: Joi.number().min(0).max(100),
  referralNotes: Joi.string().trim().max(2000).allow('')
});

async function addProjectActivity(projectId, type, title, actor, description = '', metadata = {}) {
  return ProjectActivity.create({ projectId, type, title, description, metadata, actor, occurredAt: new Date() });
}

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
      .populate('projectManager', 'name email')
      .sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    CrmProject.countDocuments(filter)
  ]);
  const rows = (canAccessFinancial(req.user) ? data : data.map(stripFinancial)).map((project) => ({
    ...project,
    ...projectOverdueMeta(project)
  }));
  return sendSuccess(res, rows, 'Projects fetched', pagination(page, limit, total));
}));

router.get('/:id', authorize('crm:projects:read'), asyncHandler(async (req, res) => {
  const scopedIds = await projectIdsForUser(req.user);
  if (scopedIds && !scopedIds.some((id) => String(id) === String(req.params.id))) {
    throw new AppError('Project not found', 404);
  }
  const project = await CrmProject.findOne({ _id: req.params.id, isDeleted: false })
    .populate('clientId', 'clientId clientName companyName companyEmail')
    .populate('projectManager', 'name email')
    .populate('assignedSalesperson', 'name email')
    .populate('projectOwner', 'name email')
    .lean();
  if (!project) throw new AppError('Project not found', 404);
  const [members, milestones, documents, activities, partners, agreements] = await Promise.all([
    ProjectMember.find({ projectId: project._id, isActive: true })
      .populate('userId', 'name email role').populate('employeeId', 'firstName lastName employeeId').lean(),
    ProjectMilestone.find({ projectId: project._id, isDeleted: false }).sort({ dueDate: 1 }).lean(),
    ProjectDocument.find({ projectId: project._id, isDeleted: false }).sort({ createdAt: -1, versionNumber: -1 }).lean(),
    ProjectActivity.find({ projectId: project._id }).sort({ occurredAt: -1 }).limit(100)
      .populate('actor', 'name email').lean(),
    CrmProjectPartner.find({ projectId: project._id, isDeleted: false }).sort({ createdAt: 1 }).lean(),
    PartnershipAgreement.find({ projectId: project._id }).sort({ version: -1 }).limit(20).lean()
  ]);
  const payload = canAccessFinancial(req.user) ? project : stripFinancial(project);
  const extra = { ...projectOverdueMeta(project) };
  if (canAccessFinancial(req.user)) {
    extra.ledger = await computeProjectLedger(project);
    extra.settlement = await computePartnershipSettlement(project);
  }
  return sendSuccess(res, {
    ...payload, ...extra, members, milestones, documents, activities, partners, agreements
  }, 'Project details fetched');
}));

router.post('/', authorize('crm:projects:write'), validate(projectBody), asyncHandler(async (req, res) => {
  const client = await CrmClient.findOne({ _id: req.body.clientId, isDeleted: false });
  if (!client) throw new AppError('Client not found', 404);
  if (!canAccessFinancial(req.user)) {
    delete req.body.contractValue;
    delete req.body.paymentTerms;
    delete req.body.billingCycle;
    delete req.body.tax;
    delete req.body.discount;
    delete req.body.finalAmount;
    delete req.body.companySharePercent;
    delete req.body.referralCommission;
    delete req.body.referralPercent;
    delete req.body.allowUnevenPercent;
    delete req.body.shareBasis;
  }
  const contractValue = Number(req.body.finalAmount ?? req.body.contractValue ?? 0);
  const project = await CrmProject.create({
    ...req.body,
    projectId: await nextCrmId('crm_project', 'PRJ'),
    outstanding: contractValue,
    confirmedReceived: 0,
    creditsTotal: 0,
    createdBy: req.user._id,
    updatedBy: req.user._id
  });
  await addProjectActivity(project._id, 'PROJECT_CREATED', 'Project created', req.user._id, project.projectName);
  await ClientActivity.create({
    clientId: client._id, type: 'PROJECT_CREATED', title: 'Project created',
    description: project.projectName, actor: req.user._id, metadata: { projectId: project._id }
  });
  await writeCrmAudit(req, 'PROJECT_CREATED', 'CrmProject', project._id, { projectId: project.projectId });
  res.status(201);
  return sendSuccess(res, canAccessFinancial(req.user) ? project : stripFinancial(project), 'Project created');
}));

router.patch('/:id', authorize('crm:projects:write'), validate(projectBody.fork(Object.keys(projectBody.describe().keys), (s) => s.optional())), asyncHandler(async (req, res) => {
  const project = await CrmProject.findOne({ _id: req.params.id, isDeleted: false });
  if (!project) throw new AppError('Project not found', 404);
  if (!canAccessFinancial(req.user)) {
    delete req.body.contractValue;
    delete req.body.paymentTerms;
    delete req.body.billingCycle;
    delete req.body.tax;
    delete req.body.discount;
    delete req.body.finalAmount;
    delete req.body.companySharePercent;
    delete req.body.referralCommission;
    delete req.body.referralPercent;
    delete req.body.allowUnevenPercent;
    delete req.body.shareBasis;
  }
  if (req.body.progressPercent != null) {
    const progress = Number(req.body.progressPercent);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      throw new AppError('Progress must be between 0 and 100', 422);
    }
    req.body.progressPercent = progress;
    req.body.progressUpdatedAt = new Date();
  }
  const previousProgress = project.progressPercent;
  const previousStatus = project.status;
  Object.assign(project, req.body, { updatedBy: req.user._id });
  if (req.body.contractValue != null || req.body.finalAmount != null) {
    const contract = Number(project.finalAmount ?? project.contractValue ?? 0);
    project.outstanding = Math.max(0, contract - Number(project.confirmedReceived || 0) - Number(project.creditsTotal || 0));
  }
  await project.save();
  if (req.body.progressPercent != null && Number(req.body.progressPercent) !== Number(previousProgress)) {
    await addProjectActivity(project._id, 'PROGRESS_UPDATED', 'Progress updated', req.user._id, `${previousProgress || 0}% → ${project.progressPercent}%`);
  }
  if (req.body.status && req.body.status !== previousStatus) {
    await addProjectActivity(project._id, 'STATUS_CHANGED', 'Status changed', req.user._id, `${previousStatus} → ${req.body.status}`);
  } else if (req.body.progressPercent == null) {
    await addProjectActivity(project._id, 'PROJECT_UPDATED', 'Project updated', req.user._id);
  }
  await writeCrmAudit(req, 'PROJECT_UPDATED', 'CrmProject', project._id, req.body);
  return sendSuccess(res, canAccessFinancial(req.user) ? project : stripFinancial(project.toObject()), 'Project updated');
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
  await addProjectActivity(project._id, 'MEMBER_ASSIGNED', 'Team member assigned', req.user._id, '', req.body);
  await writeCrmAudit(req, 'PROJECT_MEMBER_CHANGED', 'CrmProject', project._id, req.body);
  res.status(201);
  return sendSuccess(res, member, 'Project member added');
}));

router.post('/:id/members/bulk', authorize('crm:projects:assign'), validate(Joi.object({
  members: Joi.array().items(Joi.object({
    userId: objectId.required(),
    employeeId: objectId.allow(null, ''),
    role: Joi.string().valid(...PROJECT_MEMBER_ROLES)
  })).min(1).max(50).required()
})), asyncHandler(async (req, res) => {
  const project = await CrmProject.findOne({ _id: req.params.id, isDeleted: false });
  if (!project) throw new AppError('Project not found', 404);
  const saved = [];
  for (const item of req.body.members) {
    const member = await ProjectMember.findOneAndUpdate(
      { projectId: project._id, userId: item.userId },
      {
        $set: {
          role: item.role || 'DEVELOPER',
          employeeId: item.employeeId || null,
          assignedBy: req.user._id,
          assignedAt: new Date(),
          isActive: true
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    saved.push(member);
    await notifyUser({
      recipient: item.userId,
      type: 'PROJECT_ASSIGNED',
      title: 'Project assigned',
      message: `You were added to project ${project.projectName}.`,
      entityType: 'CrmProject',
      entityId: project._id,
      link: `/crm/projects/${project._id}`,
      actor: req.user._id,
      dedupeKey: `project-member:${project._id}:${item.userId}`
    });
  }
  await addProjectActivity(project._id, 'MEMBERS_ASSIGNED', 'Team assigned', req.user._id, `${saved.length} member(s)`);
  await writeCrmAudit(req, 'PROJECT_MEMBER_CHANGED', 'CrmProject', project._id, { count: saved.length });
  return sendSuccess(res, saved, 'Project members assigned');
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
  assignedTeam: Joi.array().items(objectId),
  deliverable: Joi.string().trim().max(2000).allow('')
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

router.post('/:id/documents', authorize('crm:projects:write'), crmUpload.single('file'), asyncHandler(async (req, res) => {
  const project = await CrmProject.findOne({ _id: req.params.id, isDeleted: false });
  if (!project) throw new AppError('Project not found', 404);
  let stored = {};
  if (req.file) stored = await storeCrmFile(req.file, 'CrmProject', project._id);
  let versionNumber = 1;
  let previousVersionId = null;
  if (req.body.replaceDocumentId) {
    const previous = await ProjectDocument.findOne({
      _id: req.body.replaceDocumentId, projectId: project._id, isDeleted: false
    });
    if (previous) {
      versionNumber = Number(previous.versionNumber || 1) + 1;
      previousVersionId = previous._id;
      previous.isDeleted = true;
      await previous.save();
    }
  }
  const document = await ProjectDocument.create({
    documentName: req.body.documentName || stored.name || 'Document',
    documentType: DOCUMENT_TYPES.includes(req.body.documentType) ? req.body.documentType : 'OTHER',
    description: req.body.description || '',
    partnerId: req.body.partnerId || null,
    externalUrl: req.body.externalUrl || '',
    version: String(versionNumber),
    versionNumber,
    previousVersionId,
    projectId: project._id,
    storageProvider: stored.storageProvider || (req.body.externalUrl ? 'external' : 'local'),
    storageKey: stored.storageKey,
    mimeType: stored.mimeType,
    size: stored.size,
    uploadedBy: req.user._id
  });
  await addProjectActivity(project._id, 'DOCUMENT_UPLOADED', 'Document uploaded', req.user._id, document.documentName);
  await writeCrmAudit(req, 'DOCUMENT_UPLOADED', 'ProjectDocument', document._id, { projectId: project._id });
  res.status(201);
  return sendSuccess(res, document, 'Project document saved');
}));

router.delete('/:id/documents/:documentId', authorize('crm:projects:write'), asyncHandler(async (req, res) => {
  const document = await ProjectDocument.findOneAndUpdate(
    { _id: req.params.documentId, projectId: req.params.id, isDeleted: false },
    { $set: { isDeleted: true } },
    { new: true }
  );
  if (!document) throw new AppError('Document not found', 404);
  await addProjectActivity(req.params.id, 'DOCUMENT_DELETED', 'Document deleted', req.user._id, document.documentName);
  await writeCrmAudit(req, 'DOCUMENT_DELETED', 'ProjectDocument', document._id, { projectId: req.params.id });
  return sendSuccess(res, document, 'Document deleted');
}));

router.put('/:id/partnership', authorize('crm:finance:write'), validate(Joi.object({
  engagementType: Joi.string().valid(...ENGAGEMENT_TYPES, ''),
  projectOwner: objectId.allow(null, ''),
  assignedSalesperson: objectId.allow(null, ''),
  partnershipStatus: Joi.string().valid(...PARTNERSHIP_STATUSES),
  partnershipNotes: Joi.string().trim().max(4000).allow(''),
  shareBasis: Joi.string().valid(...SHARE_BASES),
  companySharePercent: Joi.number().min(0).max(100),
  allowUnevenPercent: Joi.boolean(),
  referrerName: Joi.string().trim().max(160).allow(''),
  referrerCompany: Joi.string().trim().max(160).allow(''),
  referrerEmail: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow(''),
  referrerPhone: Joi.string().trim().max(40).allow(''),
  referralCommission: Joi.number().min(0),
  referralPercent: Joi.number().min(0).max(100),
  referralNotes: Joi.string().trim().max(2000).allow(''),
  partners: Joi.array().items(Joi.object({
    _id: objectId,
    name: Joi.string().trim().min(1).max(160).required(),
    companyName: Joi.string().trim().max(160).allow(''),
    email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow(''),
    phone: Joi.string().trim().max(40).allow(''),
    role: Joi.string().valid(...PARTNER_ROLES),
    sharePercent: Joi.number().min(0).max(100),
    fixedCommission: Joi.number().min(0),
    notes: Joi.string().trim().max(2000).allow(''),
    isActive: Joi.boolean()
  }))
})), asyncHandler(async (req, res) => {
  const result = await saveProjectPartnership(req.params.id, req.body, req.user);
  await addProjectActivity(req.params.id, 'PARTNERSHIP_UPDATED', 'Partnership agreement updated', req.user._id, `v${result.agreementVersion}`);
  await writeCrmAudit(req, 'PARTNERSHIP_UPDATED', 'CrmProject', req.params.id, req.body);
  return sendSuccess(res, result, 'Partnership saved');
}));

router.get('/:id/settlement', authorize('crm:finance:read'), asyncHandler(async (req, res) => {
  const project = await CrmProject.findOne({ _id: req.params.id, isDeleted: false });
  if (!project) throw new AppError('Project not found', 404);
  const settlement = await computePartnershipSettlement(project);
  return sendSuccess(res, settlement, 'Partnership settlement fetched');
}));

router.get('/:id/agreements', authorize('crm:finance:read'), asyncHandler(async (req, res) => {
  const rows = await PartnershipAgreement.find({ projectId: req.params.id }).sort({ version: -1 }).lean();
  return sendSuccess(res, rows, 'Agreement history fetched');
}));

router.post('/:id/adjustments', authorize('crm:finance:write'), validate(Joi.object({
  type: Joi.string().valid(...ADJUSTMENT_TYPES).required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().trim().max(8),
  appliedAt: Joi.date().iso().allow(null),
  notes: Joi.string().trim().max(2000).allow('')
})), asyncHandler(async (req, res) => {
  const result = await recordProjectAdjustment({ ...req.body, projectId: req.params.id }, req.user);
  await addProjectActivity(req.params.id, 'ADJUSTMENT_ADDED', `${req.body.type} recorded`, req.user._id, String(req.body.amount));
  await writeCrmAudit(req, 'ADJUSTMENT_ADDED', 'ProjectAdjustment', result.adjustment._id, req.body);
  res.status(201);
  return sendSuccess(res, result, 'Adjustment recorded');
}));

router.get('/:id/export', authorize('crm:finance:read'), asyncHandler(async (req, res) => {
  const project = await CrmProject.findOne({ _id: req.params.id, isDeleted: false })
    .populate('clientId', 'clientId clientName companyName').lean();
  if (!project) throw new AppError('Project not found', 404);
  const settlement = await computePartnershipSettlement(project);
  const format = String(req.query.format || 'csv').toLowerCase();
  if (format === 'xlsx') {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Settlement');
    sheet.addRow(['Project', project.projectName, project.projectId]);
    sheet.addRow(['Client', project.clientId?.clientName || '', project.clientId?.clientId || '']);
    sheet.addRow(['Contract', settlement.contractValue, settlement.currency]);
    sheet.addRow(['Share basis', settlement.shareBasis]);
    sheet.addRow(['Company %', settlement.company.sharePercent, 'Entitlement', settlement.company.entitlement]);
    sheet.addRow(['Company received', settlement.company.received, 'Remaining', settlement.company.remaining]);
    sheet.addRow([]);
    sheet.addRow(['Partner', 'Role', 'Percent', 'Entitlement', 'Paid', 'Outstanding']);
    for (const partner of settlement.partners) {
      sheet.addRow([partner.name, partner.role, partner.sharePercent, partner.entitlement, partner.paid, partner.outstanding]);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${project.projectId}-settlement.xlsx"`);
    return res.send(Buffer.from(buffer));
  }
  if (format === 'pdf') {
    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
    doc.fontSize(16).text(`Settlement · ${project.projectName}`);
    doc.moveDown(0.4).fontSize(11).text(`${project.projectId} · ${project.clientId?.clientName || ''}`);
    doc.moveDown().text(`Contract: ${settlement.currency} ${settlement.contractValue}`);
    doc.text(`Share basis: ${settlement.shareBasis} · ${settlement.currency} ${settlement.basisAmount}`);
    doc.text(`Company ${settlement.company.sharePercent}% entitlement ${settlement.currency} ${settlement.company.entitlement}`);
    doc.text(`Company invoiced ${settlement.currency} ${settlement.company.invoiced} (not a payment)`);
    doc.text(`Company received ${settlement.currency} ${settlement.company.received} · remaining ${settlement.currency} ${settlement.company.remaining}`);
    for (const partner of settlement.partners) {
      doc.text(`${partner.name}: ${partner.sharePercent}% · entitlement ${settlement.currency} ${partner.entitlement} · paid ${partner.paid} · outstanding ${partner.outstanding}`);
    }
    doc.end();
    const buffer = await done;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${project.projectId}-settlement.pdf"`);
    return res.send(buffer);
  }
  const lines = [
    'Field,Value',
    `Project,${project.projectName}`,
    `Project ID,${project.projectId}`,
    `Contract,${settlement.contractValue}`,
    `Company percent,${settlement.company.sharePercent}`,
    `Company entitlement,${settlement.company.entitlement}`,
    `Company received,${settlement.company.received}`,
    `Company remaining,${settlement.company.remaining}`
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${project.projectId}-settlement.csv"`);
  return res.send(lines.join('\n'));
}));

router.post('/:id/notes', authorize('crm:projects:write'), validate(Joi.object({
  note: Joi.string().trim().min(1).max(4000).required()
})), asyncHandler(async (req, res) => {
  const project = await CrmProject.findOne({ _id: req.params.id, isDeleted: false });
  if (!project) throw new AppError('Project not found', 404);
  const activity = await addProjectActivity(project._id, 'NOTE_ADDED', 'Note added', req.user._id, req.body.note);
  return sendSuccess(res, activity, 'Note added');
}));

export default router;
