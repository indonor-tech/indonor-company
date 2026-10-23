import express from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AppError } from '../../../utils/errors.js';
import { pagination, sendSuccess } from '../../../utils/response.js';
import {
  CONVERTIBLE_LEAD_STATUSES, CURRENCIES, FOLLOW_UP_TYPES, LEAD_PRIORITIES, LEAD_SOURCES, LEAD_STATUSES,
  PROJECT_TYPES, SALES_PIPELINE_STATUSES, SERVICE_TYPES,
  isWonStatus, normalizeLeadStatus
} from '../constants.js';
import {
  CrmLead, CrmProject, FollowUp, LeadActivity
} from '../crm.models.js';
import {
  applyQuotedAmount, canAccessFinancial, computeReminderDateTime, contractValueOf,
  escapeRegex, findLeadDuplicates, moneyAmount, nextCrmId, notifyUser, pageParams,
  quotedAmountOf, writeCrmAudit
} from '../crm.helpers.js';
import { convertLeadToClient } from '../crm.convert.js';
import { crmUpload, storeCrmFile } from '../crm.files.js';
import { rejectViewAdminMutations, requireCrmPage } from '../middleware/crmAccess.js';
import { normalizeRole } from '../../auth/roles.js';

const router = express.Router();
const objectId = Joi.string().hex().length(24).allow(null, '');

const leadBody = Joi.object({
  leadName: Joi.string().trim().min(1).max(160).required(),
  companyName: Joi.string().trim().max(160).allow(''),
  companyWebsite: Joi.string().trim().max(500).allow(''),
  industry: Joi.string().trim().max(120).allow(''),
  companySize: Joi.string().trim().max(80).allow(''),
  country: Joi.string().trim().max(80).allow(''),
  state: Joi.string().trim().max(80).allow(''),
  city: Joi.string().trim().max(80).allow(''),
  district: Joi.string().trim().max(80).allow(''),
  address: Joi.string().trim().max(500).allow(''),
  postalCode: Joi.string().trim().max(20).allow(''),
  phoneCountryCode: Joi.string().trim().max(8).allow(''),
  contactPersonName: Joi.string().trim().max(160).allow(''),
  designation: Joi.string().trim().max(120).allow(''),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow(''),
  phone: Joi.string().trim().max(40).allow(''),
  alternatePhone: Joi.string().trim().max(40).allow(''),
  whatsappNumber: Joi.string().trim().max(40).allow(''),
  linkedInProfile: Joi.string().trim().max(500).allow(''),
  otherSocialProfile: Joi.string().trim().max(500).allow(''),
  source: Joi.string().valid(...LEAD_SOURCES),
  campaign: Joi.string().trim().max(160).allow(''),
  referralDetails: Joi.string().trim().max(1000).allow(''),
  interestedService: Joi.string().valid(...SERVICE_TYPES, ''),
  requirementDescription: Joi.string().trim().max(5000).allow(''),
  projectDescription: Joi.string().trim().max(8000).allow(''),
  businessRequirements: Joi.string().trim().max(8000).allow(''),
  expectedProjectType: Joi.string().valid(...PROJECT_TYPES, ''),
  requiredTechnologies: Joi.array().items(Joi.string().trim().max(80)),
  expectedStartDate: Joi.date().iso().allow(null),
  estimatedDuration: Joi.string().trim().max(80).allow(''),
  deadline: Joi.date().iso().allow(null),
  estimatedBudget: Joi.number().min(0).allow(null),
  expectedDealValue: Joi.number().min(0).allow(null),
  quotedAmount: Joi.number().min(0).allow(null),
  currency: Joi.string().trim().uppercase().valid(...CURRENCIES),
  urgency: Joi.string().valid('LOW', 'NORMAL', 'HIGH', 'CRITICAL', ''),
  probability: Joi.number().min(0).max(100),
  isDecisionMaker: Joi.boolean(),
  notes: Joi.string().trim().max(8000).allow(''),
  tags: Joi.array().items(Joi.string().trim().max(60)),
  customFields: Joi.object().unknown(true),
  timezone: Joi.string().trim().max(80).allow(''),
  priority: Joi.string().valid(...LEAD_PRIORITIES),
  status: Joi.string().valid(...LEAD_STATUSES),
  assignedTo: objectId,
  forceCreate: Joi.boolean(),
  nextFollowUpDate: Joi.date().iso().allow(null),
  nextFollowUpTime: Joi.string().trim().max(20).allow(''),
  followUpType: Joi.string().valid(...FOLLOW_UP_TYPES),
  followUpNote: Joi.string().trim().max(4000).allow('')
});

const followUpBody = Joi.object({
  nextFollowUpDate: Joi.date().iso().required(),
  nextFollowUpTime: Joi.string().trim().max(20).allow(''),
  timezone: Joi.string().trim().max(80).allow(''),
  followUpType: Joi.string().valid(...FOLLOW_UP_TYPES),
  nextAction: Joi.string().trim().max(500).allow(''),
  followUpNote: Joi.string().trim().max(4000).allow(''),
  priority: Joi.string().valid(...LEAD_PRIORITIES),
  assignedSalesPerson: objectId,
  reminderDateTime: Joi.date().iso().allow(null),
  reminderPreference: Joi.string().trim().max(80).allow('')
});

async function addLeadActivity(leadId, type, title, actor, description = '', result = '', metadata = {}) {
  return LeadActivity.create({
    leadId, type, title, description, result, metadata, actor, occurredAt: new Date()
  });
}

function leadScopeFilter(user) {
  const role = normalizeRole(user.role);
  if (['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FINANCE'].includes(role)) return {};
  if (role === 'BDA') return { assignedTo: user._id };
  return { assignedTo: user._id };
}

function presentLead(lead, user) {
  const copy = { ...lead };
  copy.quotedAmount = quotedAmountOf(copy);
  copy.isConverted = Boolean(lead.clientId);
  copy.convertedDate = lead.convertedDate || null;
  if (!canAccessFinancial(user)) {
    // Sales still need quoted/budget figures; hide only unrelated financial internals.
  }
  return copy;
}

async function enrichLeads(leads) {
  const ids = leads.map((lead) => lead._id);
  const clientIds = leads.map((lead) => lead.clientId?._id || lead.clientId).filter(Boolean);
  const [followUps, projects] = await Promise.all([
    FollowUp.find({ leadId: { $in: ids }, isDeleted: false, status: 'PENDING' })
      .sort({ nextFollowUpDate: 1 }).lean(),
    clientIds.length
      ? CrmProject.find({ clientId: { $in: clientIds }, isDeleted: false })
        .select('clientId status expectedEndDate outstanding contractValue finalAmount confirmedReceived nextPaymentDueDate projectId projectName')
        .lean()
      : Promise.resolve([])
  ]);
  const followByLead = new Map();
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  for (const followUp of followUps) {
    const key = String(followUp.leadId);
    if (!followByLead.has(key)) followByLead.set(key, followUp);
  }
  const projectsByClient = new Map();
  for (const project of projects) {
    const key = String(project.clientId);
    const list = projectsByClient.get(key) || [];
    list.push(project);
    projectsByClient.set(key, list);
  }
  return leads.map((lead) => {
    const nextFollowUp = followByLead.get(String(lead._id)) || null;
    const clientProjects = projectsByClient.get(String(lead.clientId?._id || lead.clientId)) || [];
    const outstanding = moneyAmount(clientProjects.reduce((sum, project) => sum + moneyAmount(project.outstanding ?? Math.max(0, contractValueOf(project) - moneyAmount(project.confirmedReceived))), 0));
    const overduePayment = clientProjects.some((project) => project.nextPaymentDueDate && new Date(project.nextPaymentDueDate) < start && moneyAmount(project.outstanding) > 0);
    const projectStatus = clientProjects[0]?.status || null;
    return {
      ...lead,
      quotedAmount: quotedAmountOf(lead),
      nextFollowUp,
      followUpOverdue: Boolean(nextFollowUp && new Date(nextFollowUp.nextFollowUpDate) < start),
      projectStatus,
      outstandingPayment: outstanding,
      overduePayment,
      overdueAlert: Boolean((nextFollowUp && new Date(nextFollowUp.nextFollowUpDate) < start) || overduePayment)
    };
  });
}

router.use(authenticate, rejectViewAdminMutations, requireCrmPage('leads'));

router.get('/dashboard', authorize('crm:leads:read'), asyncHandler(async (req, res) => {
  const base = { isDeleted: false, isArchived: { $ne: true }, ...leadScopeFilter(req.user) };
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const assignedClientFilter = normalizeRole(req.user.role) === 'BDA' ? { assignedTo: req.user._id } : {};
  const [total, byStatus, todayFollowUps, overdueFollowUps, paymentFollowUps, dueProjects] = await Promise.all([
    CrmLead.countDocuments(base),
    CrmLead.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    FollowUp.find({
      isDeleted: false, status: 'PENDING',
      nextFollowUpDate: { $gte: start, $lt: end },
      ...(normalizeRole(req.user.role) === 'BDA' ? { assignedSalesPerson: req.user._id } : {})
    }).populate('leadId', 'leadName companyName leadId').sort({ nextFollowUpTime: 1 }).lean(),
    FollowUp.find({
      isDeleted: false, status: 'PENDING', nextFollowUpDate: { $lt: start },
      ...(normalizeRole(req.user.role) === 'BDA' ? { assignedSalesPerson: req.user._id } : {})
    }).populate('leadId', 'leadName companyName leadId').sort({ nextFollowUpDate: 1 }).limit(50).lean(),
    FollowUp.find({
      isDeleted: false, status: 'PENDING', target: 'PAYMENT',
      ...(normalizeRole(req.user.role) === 'BDA' ? { assignedSalesPerson: req.user._id } : {})
    }).populate('clientId', 'clientName clientId assignedTo').populate('projectId', 'projectId projectName outstanding nextPaymentDueDate')
      .sort({ nextFollowUpDate: 1 }).limit(50).lean(),
    CrmProject.find({
      isDeleted: false, outstanding: { $gt: 0 }, nextPaymentDueDate: { $lte: end }
    }).populate({
      path: 'clientId',
      select: 'clientId clientName assignedTo',
      match: assignedClientFilter
    }).select('projectId projectName outstanding nextPaymentDueDate currency clientId').limit(50).lean()
  ]);
  const statusMap = Object.fromEntries(byStatus.map((row) => [row._id, row.count]));
  const won = (statusMap.WON || 0) + (statusMap.CONVERTED || 0);
  const lost = (statusMap.LOST || 0) + (statusMap.NOT_INTERESTED || 0);
  return sendSuccess(res, {
    totalLeads: total,
    newLeads: statusMap.NEW || 0,
    contacted: (statusMap.CONTACTED || 0) + (statusMap.INTERESTED || 0) + (statusMap.FOLLOW_UP || 0),
    interestedLeads: statusMap.INTERESTED || 0,
    qualifiedLeads: statusMap.QUALIFIED || 0,
    meeting: statusMap.MEETING || 0,
    proposalSent: statusMap.PROPOSAL_SENT || 0,
    negotiation: statusMap.NEGOTIATION || 0,
    won,
    converted: won,
    lost,
    pipeline: SALES_PIPELINE_STATUSES,
    todayFollowUps,
    overdueFollowUps,
    todayFollowUpCount: todayFollowUps.length,
    overdueFollowUpCount: overdueFollowUps.length,
    paymentFollowUps,
    duePayments: dueProjects.filter((project) => project.clientId)
  }, 'Lead dashboard fetched');
}));

router.get('/board', authorize('crm:leads:read'), asyncHandler(async (req, res) => {
  const filter = { isDeleted: false, isArchived: { $ne: true }, ...leadScopeFilter(req.user) };
  if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
  if (req.query.q) {
    const q = escapeRegex(String(req.query.q).trim());
    filter.$or = [
      { leadName: { $regex: q, $options: 'i' } },
      { companyName: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { leadId: { $regex: q, $options: 'i' } }
    ];
  }
  const leads = await CrmLead.find(filter)
    .populate('assignedTo', 'name email')
    .populate('clientId', 'clientId clientName companyName')
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean();
  const enriched = await enrichLeads(leads);
  const columns = Object.fromEntries(SALES_PIPELINE_STATUSES.map((status) => [status, []]));
  for (const lead of enriched) {
    const column = normalizeLeadStatus(lead.status);
    if (!columns[column]) columns[column] = [];
    columns[column].push(lead);
  }
  const overdueAlerts = enriched.filter((lead) => lead.overdueAlert);
  return sendSuccess(res, { columns, stages: SALES_PIPELINE_STATUSES, overdueAlerts }, 'Lead board fetched');
}));

router.get('/export', authorize('crm:leads:read'), asyncHandler(async (req, res) => {
  const filter = { isDeleted: false, ...leadScopeFilter(req.user) };
  if (req.query.archived !== 'true') filter.isArchived = { $ne: true };
  const leads = await CrmLead.find(filter).populate('assignedTo', 'name email').sort({ createdAt: -1 }).limit(5000).lean();
  const header = [
    'leadId', 'leadName', 'companyName', 'contactPersonName', 'email', 'phone', 'source',
    'status', 'priority', 'industry', 'city', 'country', 'estimatedBudget', 'expectedDealValue',
    'currency', 'assignedTo', 'createdAt'
  ];
  const rows = leads.map((lead) => header.map((key) => {
    if (key === 'assignedTo') return lead.assignedTo?.email || '';
    if (key === 'createdAt') return lead.createdAt ? new Date(lead.createdAt).toISOString() : '';
    const value = lead[key];
    return value == null ? '' : String(value).replaceAll('"', '""');
  }));
  const csv = [header.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-export.csv"');
  return res.send(csv);
}));

router.post('/check-duplicates', authorize('crm:leads:read'), validate(Joi.object({
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow(''),
  phone: Joi.string().trim().max(40).allow(''),
  excludeId: objectId
})), asyncHandler(async (req, res) => {
  const duplicates = await findLeadDuplicates(req.body);
  return sendSuccess(res, { duplicates, hasDuplicates: duplicates.length > 0 }, 'Duplicate check complete');
}));

router.get('/', authorize('crm:leads:read'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const filter = { isDeleted: false, ...leadScopeFilter(req.user) };
  if (req.query.archived === 'true') filter.isArchived = true;
  else if (req.query.archived !== 'all') filter.isArchived = { $ne: true };
  if (LEAD_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (LEAD_SOURCES.includes(req.query.source)) filter.source = req.query.source;
  if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
  if (req.query.converted === 'true') filter.clientId = { $nin: [null] };
  if (req.query.converted === 'false') {
    filter.$and = [...(filter.$and || []), { $or: [{ clientId: null }, { clientId: { $exists: false } }] }];
  }
  if (req.query.convertible === 'true') {
    filter.status = { $in: CONVERTIBLE_LEAD_STATUSES };
  }
  if (req.query.q) {
    const q = escapeRegex(String(req.query.q).trim());
    filter.$or = [
      { leadName: { $regex: q, $options: 'i' } },
      { companyName: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { contactPersonName: { $regex: q, $options: 'i' } },
      { leadId: { $regex: q, $options: 'i' } }
    ];
  }
  const sortable = {
    createdAt: 'createdAt', updatedAt: 'updatedAt', leadName: 'leadName', status: 'status',
    priority: 'priority', quotedAmount: 'quotedAmount', expectedDealValue: 'expectedDealValue'
  };
  const sortBy = sortable[req.query.sortBy] || 'updatedAt';
  const sortDir = req.query.order === 'asc' ? 1 : -1;
  const [data, total] = await Promise.all([
    CrmLead.find(filter)
      .populate('assignedTo', 'name email role')
      .populate('clientId', 'clientId clientName companyName')
      .sort({ [sortBy]: sortDir }).skip(skip).limit(limit).lean(),
    CrmLead.countDocuments(filter)
  ]);
  const enriched = await enrichLeads(data);
  return sendSuccess(res, enriched.map((lead) => presentLead(lead, req.user)), 'Leads fetched', pagination(page, limit, total));
}));

router.get('/follow-ups/list/all', authorize('crm:leads:read'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const filter = { isDeleted: false };
  if (req.query.status) filter.status = req.query.status;
  if (normalizeRole(req.user.role) === 'BDA') filter.assignedSalesPerson = req.user._id;
  const [data, total] = await Promise.all([
    FollowUp.find(filter).populate('leadId', 'leadName companyName leadId status')
      .populate('assignedSalesPerson', 'name email')
      .sort({ nextFollowUpDate: 1 }).skip(skip).limit(limit).lean(),
    FollowUp.countDocuments(filter)
  ]);
  return sendSuccess(res, data, 'Follow-ups fetched', pagination(page, limit, total));
}));

router.patch('/follow-ups/:followUpId', authorize('crm:leads:write'), validate(Joi.object({
  nextFollowUpDate: Joi.date().iso(),
  nextFollowUpTime: Joi.string().trim().max(20).allow(''),
  followUpType: Joi.string().valid(...FOLLOW_UP_TYPES),
  followUpNote: Joi.string().trim().max(4000).allow(''),
  assignedSalesPerson: objectId,
  reminderDateTime: Joi.date().iso().allow(null),
  reminderPreference: Joi.string().trim().max(80).allow(''),
  status: Joi.string().valid('PENDING', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'),
  completedNote: Joi.string().trim().max(2000).allow('')
})), asyncHandler(async (req, res) => {
  const followUp = await FollowUp.findOne({ _id: req.params.followUpId, isDeleted: false });
  if (!followUp) throw new AppError('Follow-up not found', 404);
  Object.assign(followUp, req.body);
  if (req.body.status === 'COMPLETED') {
    followUp.completedAt = new Date();
    await addLeadActivity(followUp.leadId, 'FOLLOW_UP_COMPLETED', 'Follow-up completed', req.user._id, req.body.completedNote || '');
  }
  if (req.body.nextFollowUpDate && req.body.status !== 'COMPLETED') {
    followUp.status = 'RESCHEDULED';
    followUp.reminderSentAt = undefined;
  }
  await followUp.save();
  return sendSuccess(res, followUp, 'Follow-up updated');
}));

router.get('/:id', authorize('crm:leads:read'), asyncHandler(async (req, res) => {
  const lead = await CrmLead.findOne({ _id: req.params.id, isDeleted: false, ...leadScopeFilter(req.user) })
    .populate('assignedTo', 'name email role')
    .populate('assignedBy', 'name email')
    .populate('convertedBy', 'name email')
    .populate('clientId', 'clientId clientName companyName')
    .lean();
  if (!lead) throw new AppError('Lead not found', 404);
  const [activities, followUps] = await Promise.all([
    LeadActivity.find({ leadId: lead._id }).sort({ occurredAt: -1 }).limit(100)
      .populate('actor', 'name email').lean(),
    FollowUp.find({ leadId: lead._id, isDeleted: false }).sort({ nextFollowUpDate: -1 })
      .populate('assignedSalesPerson', 'name email').lean()
  ]);
  const [enriched] = await enrichLeads([lead]);
  return sendSuccess(res, { ...presentLead(enriched, req.user), activities, followUps }, 'Lead details fetched');
}));

router.post('/', authorize('crm:leads:write'), validate(leadBody), asyncHandler(async (req, res) => {
  const { forceCreate, nextFollowUpDate, nextFollowUpTime, followUpType, followUpNote, ...raw } = req.body;
  const payload = applyQuotedAmount(raw);
  if (payload.businessRequirements && !payload.requirementDescription) {
    payload.requirementDescription = payload.businessRequirements;
  }
  if (payload.requirementDescription && !payload.businessRequirements) {
    payload.businessRequirements = payload.requirementDescription;
  }
  const duplicates = await findLeadDuplicates({ email: payload.email, phone: payload.phone });
  if (duplicates.length && !forceCreate) {
    throw new AppError('Possible duplicate lead detected', 409, { duplicates });
  }
  const leadId = await nextCrmId('crm_lead', 'LEAD');
  const assignedTo = payload.assignedTo || req.user._id;
  const lead = await CrmLead.create({
    ...payload,
    leadId,
    assignedTo,
    assignedBy: req.user._id,
    assignedDate: new Date(),
    createdBy: req.user._id,
    updatedBy: req.user._id
  });
  await addLeadActivity(lead._id, 'LEAD_CREATED', 'Lead created', req.user._id, `${lead.leadName} was created`);
  if (nextFollowUpDate) {
    const timezone = payload.timezone || 'Asia/Kolkata';
    await FollowUp.create({
      leadId: lead._id,
      target: 'LEAD',
      nextFollowUpDate,
      nextFollowUpTime: nextFollowUpTime || '',
      followUpType: followUpType || 'CALL',
      followUpNote: followUpNote || '',
      timezone,
      reminderPreference: '30_MINUTES_BEFORE',
      reminderDateTime: computeReminderDateTime({
        nextFollowUpDate, nextFollowUpTime, timezone, reminderPreference: '30_MINUTES_BEFORE'
      }),
      assignedSalesPerson: assignedTo,
      createdBy: req.user._id
    });
    await addLeadActivity(lead._id, 'FOLLOW_UP_SCHEDULED', 'Follow-up scheduled', req.user._id);
  }
  if (assignedTo) {
    await addLeadActivity(lead._id, 'LEAD_ASSIGNED', 'Lead assigned', req.user._id);
    await notifyUser({
      recipient: assignedTo,
      type: 'LEAD_ASSIGNED',
      title: 'New lead assigned',
      message: `${lead.leadName} has been assigned to you.`,
      entityType: 'CrmLead',
      entityId: lead._id,
      link: `/crm/leads/${lead._id}`,
      actor: req.user._id,
      dedupeKey: `lead-assign:${lead._id}:${assignedTo}`
    });
  }
  await writeCrmAudit(req, 'LEAD_CREATED', 'CrmLead', lead._id, { leadId });
  res.status(201);
  return sendSuccess(res, lead, 'Lead created');
}));

router.post('/import', authorize('crm:leads:write'), validate(Joi.object({
  rows: Joi.array().items(Joi.object({
    leadName: Joi.string().trim().min(1).max(160).required(),
    companyName: Joi.string().trim().max(160).allow(''),
    email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow(''),
    phone: Joi.string().trim().max(40).allow(''),
    source: Joi.string().valid(...LEAD_SOURCES),
    status: Joi.string().valid(...LEAD_STATUSES),
    priority: Joi.string().valid(...LEAD_PRIORITIES),
    industry: Joi.string().trim().max(120).allow(''),
    city: Joi.string().trim().max(80).allow(''),
    country: Joi.string().trim().max(80).allow(''),
    requirementDescription: Joi.string().trim().max(5000).allow('')
  })).min(1).max(500).required(),
  skipDuplicates: Joi.boolean().default(true)
})), asyncHandler(async (req, res) => {
  const created = [];
  const skipped = [];
  for (const row of req.body.rows) {
    const duplicates = await findLeadDuplicates({ email: row.email, phone: row.phone });
    if (duplicates.length && req.body.skipDuplicates) {
      skipped.push({ row, reason: 'duplicate', duplicates });
      continue;
    }
    const lead = await CrmLead.create({
      ...row,
      leadId: await nextCrmId('crm_lead', 'LEAD'),
      assignedTo: req.user._id,
      assignedBy: req.user._id,
      assignedDate: new Date(),
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
    await addLeadActivity(lead._id, 'LEAD_CREATED', 'Lead imported', req.user._id);
    created.push(lead);
  }
  await writeCrmAudit(req, 'LEADS_IMPORTED', 'CrmLead', null, { created: created.length, skipped: skipped.length });
  return sendSuccess(res, { created: created.length, skipped: skipped.length, skippedRows: skipped.slice(0, 20) }, 'Lead import finished');
}));

router.patch('/:id', authorize('crm:leads:write'), validate(leadBody.fork(Object.keys(leadBody.describe().keys), (schema) => schema.optional())), asyncHandler(async (req, res) => {
  const lead = await CrmLead.findOne({ _id: req.params.id, isDeleted: false, ...leadScopeFilter(req.user) });
  if (!lead) throw new AppError('Lead not found', 404);
  if (isWonStatus(lead.status) && req.body.status && !isWonStatus(req.body.status)) {
    throw new AppError('Won/converted leads cannot change to a non-won status', 400);
  }
  const previousStatus = lead.status;
  const { forceCreate, nextFollowUpDate, nextFollowUpTime, followUpType, followUpNote, ...raw } = req.body;
  Object.assign(lead, applyQuotedAmount(raw), { updatedBy: req.user._id });
  if (lead.businessRequirements && !lead.requirementDescription) lead.requirementDescription = lead.businessRequirements;
  await lead.save();
  if (req.body.status && req.body.status !== previousStatus) {
    await addLeadActivity(lead._id, 'STATUS_CHANGED', 'Status changed', req.user._id,
      `Status changed from ${previousStatus} to ${req.body.status}`, '',
      { old: previousStatus, new: req.body.status });
    if (req.body.status === 'LOST' || req.body.status === 'NOT_INTERESTED') {
      await addLeadActivity(lead._id, 'LEAD_LOST', 'Lead marked lost', req.user._id);
    }
    if (req.body.status === 'PROPOSAL_SENT') {
      await addLeadActivity(lead._id, 'PROPOSAL_SENT', 'Proposal sent', req.user._id);
    }
  } else {
    await addLeadActivity(lead._id, 'LEAD_UPDATED', 'Lead updated', req.user._id);
  }
  await writeCrmAudit(req, 'LEAD_UPDATED', 'CrmLead', lead._id, req.body);
  return sendSuccess(res, lead, 'Lead updated');
}));

router.post('/:id/assign', authorize('crm:leads:assign'), validate(Joi.object({
  assignedTo: Joi.string().hex().length(24).required()
})), asyncHandler(async (req, res) => {
  const lead = await CrmLead.findOne({ _id: req.params.id, isDeleted: false });
  if (!lead) throw new AppError('Lead not found', 404);
  lead.assignedTo = req.body.assignedTo;
  lead.assignedBy = req.user._id;
  lead.assignedDate = new Date();
  lead.updatedBy = req.user._id;
  await lead.save();
  await addLeadActivity(lead._id, 'LEAD_ASSIGNED', 'Lead reassigned', req.user._id);
  await notifyUser({
    recipient: req.body.assignedTo,
    type: 'LEAD_ASSIGNED',
    title: 'Lead assigned',
    message: `${lead.leadName} has been assigned to you.`,
    entityType: 'CrmLead',
    entityId: lead._id,
    link: `/crm/leads/${lead._id}`,
    actor: req.user._id,
    dedupeKey: `lead-reassign:${lead._id}:${req.body.assignedTo}:${Date.now()}`
  });
  await writeCrmAudit(req, 'LEAD_ASSIGNED', 'CrmLead', lead._id, { assignedTo: req.body.assignedTo });
  return sendSuccess(res, lead, 'Lead assigned');
}));

router.post('/:id/notes', authorize('crm:leads:write'), validate(Joi.object({
  note: Joi.string().trim().min(1).max(4000).required(),
  result: Joi.string().trim().max(500).allow('')
})), asyncHandler(async (req, res) => {
  const lead = await CrmLead.findOne({ _id: req.params.id, isDeleted: false, ...leadScopeFilter(req.user) });
  if (!lead) throw new AppError('Lead not found', 404);
  const activity = await addLeadActivity(lead._id, 'NOTE_ADDED', 'Note added', req.user._id, req.body.note, req.body.result || '');
  return sendSuccess(res, activity, 'Note added');
}));

router.post('/:id/follow-ups', authorize('crm:leads:write'), validate(followUpBody), asyncHandler(async (req, res) => {
  const lead = await CrmLead.findOne({ _id: req.params.id, isDeleted: false, ...leadScopeFilter(req.user) });
  if (!lead) throw new AppError('Lead not found', 404);
  const timezone = req.body.timezone || lead.timezone || 'Asia/Kolkata';
  const reminderPreference = req.body.reminderPreference || '30_MINUTES_BEFORE';
  const reminderDateTime = req.body.reminderDateTime
    || computeReminderDateTime({
      nextFollowUpDate: req.body.nextFollowUpDate,
      nextFollowUpTime: req.body.nextFollowUpTime,
      timezone,
      reminderPreference
    });
  const followUp = await FollowUp.create({
    ...req.body,
    timezone,
    reminderPreference,
    reminderDateTime,
    leadId: lead._id,
    assignedSalesPerson: req.body.assignedSalesPerson || lead.assignedTo || req.user._id,
    createdBy: req.user._id
  });
  lead.lastContactAt = new Date();
  if (!isWonStatus(lead.status) && lead.status !== 'LOST' && lead.status !== 'NOT_INTERESTED') {
    if (lead.status === 'NEW') lead.status = 'CONTACTED';
    lead.updatedBy = req.user._id;
    await lead.save();
  } else {
    await lead.save();
  }
  await addLeadActivity(lead._id, 'FOLLOW_UP_SCHEDULED', 'Follow-up scheduled', req.user._id,
    req.body.followUpNote || '', '', { followUpId: followUp._id, date: req.body.nextFollowUpDate });
  await writeCrmAudit(req, 'FOLLOW_UP_SCHEDULED', 'FollowUp', followUp._id, req.body);
  res.status(201);
  return sendSuccess(res, followUp, 'Follow-up scheduled');
}));

router.post('/:id/convert', authorize('crm:leads:convert'), validate(Joi.object({
  conversionNotes: Joi.string().trim().max(2000).allow(''),
  clientName: Joi.string().trim().max(160).allow(''),
  companyName: Joi.string().trim().max(160).allow(''),
  projectName: Joi.string().trim().max(200).allow(''),
  contractValue: Joi.number().min(0).allow(null),
  currency: Joi.string().trim().uppercase().valid(...CURRENCIES),
  paymentTerms: Joi.string().trim().max(1000).allow(''),
  startDate: Joi.date().iso().allow(null),
  endDate: Joi.date().iso().allow(null),
  duration: Joi.string().trim().max(80).allow(''),
  nextPaymentDueDate: Joi.date().iso().allow(null),
  assignedTo: objectId,
  createProject: Joi.boolean(),
  forceConvert: Joi.boolean()
})), asyncHandler(async (req, res) => {
  try {
    const result = await convertLeadToClient(req.params.id, req.user, req.body);
    await writeCrmAudit(req, 'LEAD_CONVERTED', 'CrmLead', result.lead._id, { clientId: result.client._id });
    return sendSuccess(res, result, 'Lead converted to client');
  } catch (error) {
    if (error?.code === 11000) throw new AppError('Lead is already converted', 400);
    throw error;
  }
}));

router.post('/:id/calls', authorize('crm:leads:write'), validate(Joi.object({
  title: Joi.string().trim().max(200).allow(''),
  notes: Joi.string().trim().min(1).max(4000).required(),
  result: Joi.string().trim().max(500).allow(''),
  occurredAt: Joi.date().iso().allow(null),
  durationMinutes: Joi.number().min(0).allow(null)
})), asyncHandler(async (req, res) => {
  const lead = await CrmLead.findOne({ _id: req.params.id, isDeleted: false, ...leadScopeFilter(req.user) });
  if (!lead) throw new AppError('Lead not found', 404);
  lead.lastContactAt = req.body.occurredAt || new Date();
  await lead.save();
  const activity = await addLeadActivity(
    lead._id, 'CALL_LOG', req.body.title || 'Call logged', req.user._id,
    req.body.notes, req.body.result || '', { durationMinutes: req.body.durationMinutes || null }
  );
  if (req.body.occurredAt) {
    activity.occurredAt = req.body.occurredAt;
    await activity.save();
  }
  return sendSuccess(res, activity, 'Call logged');
}));

router.post('/:id/attachments', authorize('crm:leads:write'), crmUpload.array('files', 10), asyncHandler(async (req, res) => {
  const lead = await CrmLead.findOne({ _id: req.params.id, isDeleted: false, ...leadScopeFilter(req.user) });
  if (!lead) throw new AppError('Lead not found', 404);
  const files = req.files?.length ? req.files : (req.file ? [req.file] : []);
  if (!files.length) throw new AppError('A file is required', 422);
  const stored = [];
  for (const file of files) {
    const meta = await storeCrmFile(file, 'CrmLead', lead._id);
    meta.documentType = req.body.documentType || 'PROPOSAL';
    meta.uploadedBy = req.user._id;
    lead.attachments.push(meta);
    stored.push(meta);
  }
  await lead.save();
  await addLeadActivity(lead._id, 'ATTACHMENT_ADDED', 'Attachment uploaded', req.user._id, stored.map((item) => item.name).join(', '));
  await writeCrmAudit(req, 'LEAD_ATTACHMENT', 'CrmLead', lead._id, { count: stored.length });
  return sendSuccess(res, lead.attachments, 'Attachments uploaded');
}));

router.post('/:id/archive', authorize('crm:leads:write'), asyncHandler(async (req, res) => {
  const lead = await CrmLead.findOne({ _id: req.params.id, isDeleted: false, ...leadScopeFilter(req.user) });
  if (!lead) throw new AppError('Lead not found', 404);
  lead.isArchived = true;
  lead.archivedAt = new Date();
  lead.archivedBy = req.user._id;
  lead.updatedBy = req.user._id;
  await lead.save();
  await addLeadActivity(lead._id, 'LEAD_ARCHIVED', 'Lead archived', req.user._id);
  await writeCrmAudit(req, 'LEAD_ARCHIVED', 'CrmLead', lead._id, {});
  return sendSuccess(res, lead, 'Lead archived');
}));

router.post('/:id/unarchive', authorize('crm:leads:write'), asyncHandler(async (req, res) => {
  const lead = await CrmLead.findOne({ _id: req.params.id, isDeleted: false, ...leadScopeFilter(req.user) });
  if (!lead) throw new AppError('Lead not found', 404);
  lead.isArchived = false;
  lead.archivedAt = undefined;
  lead.archivedBy = undefined;
  lead.updatedBy = req.user._id;
  await lead.save();
  return sendSuccess(res, lead, 'Lead restored');
}));

export default router;
