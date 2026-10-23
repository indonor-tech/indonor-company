import express from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AppError } from '../../../utils/errors.js';
import { pagination, sendSuccess } from '../../../utils/response.js';
import { COMPANY_TYPES, CURRENCIES, DOCUMENT_TYPES, FOLLOW_UP_TYPES, LEAD_PRIORITIES } from '../constants.js';
import {
  ClientActivity, ClientContact, ClientDocument, CrmClient, CrmInvoice,
  CrmPayment, CrmProject, FollowUp
} from '../crm.models.js';
import {
  canAccessFinancial, computeClientLedger, computeReminderDateTime, computeProjectLedger,
  escapeRegex, moneyAmount, nextCrmId, pageParams, stripFinancial, writeCrmAudit
} from '../crm.helpers.js';
import { dueAlertFromLedger } from '../crm.finance.js';
import { convertLeadToClient } from '../crm.convert.js';
import { crmUpload, storeCrmFile } from '../crm.files.js';
import { rejectViewAdminMutations, requireCrmPage } from '../middleware/crmAccess.js';
import { hasPermission, normalizeRole } from '../../auth/roles.js';

const router = express.Router();

const clientBody = Joi.object({
  clientName: Joi.string().trim().min(1).max(160).required(),
  companyName: Joi.string().trim().max(160).allow(''),
  legalCompanyName: Joi.string().trim().max(200).allow(''),
  companyType: Joi.string().valid(...COMPANY_TYPES, ''),
  industry: Joi.string().trim().max(120).allow(''),
  companyWebsite: Joi.string().trim().max(500).allow(''),
  companyEmail: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow(''),
  companyPhone: Joi.string().trim().max(40).allow(''),
  country: Joi.string().trim().max(80).allow(''),
  state: Joi.string().trim().max(80).allow(''),
  city: Joi.string().trim().max(80).allow(''),
  address: Joi.string().trim().max(500).allow(''),
  postalCode: Joi.string().trim().max(20).allow(''),
  timezone: Joi.string().trim().max(80).allow(''),
  businessDescription: Joi.string().trim().max(5000).allow(''),
  companySize: Joi.string().trim().max(80).allow(''),
  numberOfEmployees: Joi.number().min(0).allow(null),
  annualTurnover: Joi.number().min(0).allow(null),
  gstVatNumber: Joi.string().trim().max(80).allow(''),
  taxId: Joi.string().trim().max(80).allow(''),
  registrationNumber: Joi.string().trim().max(80).allow(''),
  billingAddress: Joi.string().trim().max(500).allow(''),
  shippingAddress: Joi.string().trim().max(500).allow(''),
  district: Joi.string().trim().max(80).allow(''),
  technologies: Joi.array().items(Joi.string().trim().max(80)),
  contractValue: Joi.number().min(0).allow(null),
  currency: Joi.string().trim().uppercase().valid(...CURRENCIES),
  startDate: Joi.date().iso().allow(null),
  endDate: Joi.date().iso().allow(null),
  duration: Joi.string().trim().max(80).allow(''),
  paymentTerms: Joi.string().trim().max(1000).allow(''),
  notes: Joi.string().trim().max(8000).allow(''),
  assignedTo: Joi.string().hex().length(24).allow(null, ''),
  sourceLeadId: Joi.string().hex().length(24).allow(null, ''),
  conversionNotes: Joi.string().trim().max(2000).allow(''),
  createProject: Joi.boolean(),
  forceConvert: Joi.boolean()
});

const contactBody = Joi.object({
  contactName: Joi.string().trim().min(1).max(160).required(),
  designation: Joi.string().trim().max(120).allow(''),
  department: Joi.string().trim().max(120).allow(''),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow(''),
  phone: Joi.string().trim().max(40).allow(''),
  whatsapp: Joi.string().trim().max(40).allow(''),
  linkedIn: Joi.string().trim().max(500).allow(''),
  isPrimary: Joi.boolean(),
  isBillingContact: Joi.boolean(),
  isTechnicalContact: Joi.boolean(),
  isDecisionMaker: Joi.boolean()
});

router.use(authenticate, rejectViewAdminMutations, requireCrmPage('clients'));

router.get('/', authorize('crm:clients:read'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const filter = { isDeleted: false };
  const role = normalizeRole(req.user.role);
  if (role === 'PROJECT_MANAGER' || role === 'BDA') {
    filter.assignedTo = req.user._id;
  }
  if (req.query.q) {
    const q = escapeRegex(String(req.query.q).trim());
    filter.$or = [
      { clientName: { $regex: q, $options: 'i' } },
      { companyName: { $regex: q, $options: 'i' } },
      { companyEmail: { $regex: q, $options: 'i' } },
      { clientId: { $regex: q, $options: 'i' } },
      { sourceLeadCode: { $regex: q, $options: 'i' } }
    ];
  }
  const [data, total] = await Promise.all([
    CrmClient.find(filter)
      .populate('assignedTo', 'name email')
      .populate('sourceLeadId', 'leadId leadName companyName contactPersonName status convertedDate')
      .sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    CrmClient.countDocuments(filter)
  ]);
  const clientIds = data.map((row) => row._id);
  const projects = clientIds.length
    ? await CrmProject.find({ clientId: { $in: clientIds }, isDeleted: false })
      .select('clientId outstanding contractValue finalAmount confirmedReceived creditsTotal')
      .lean()
    : [];
  const byClient = new Map();
  for (const project of projects) {
    const key = String(project.clientId);
    const bucket = byClient.get(key) || { projectCount: 0, outstanding: 0, contractValue: 0, confirmedPayments: 0 };
    bucket.projectCount += 1;
    bucket.outstanding += moneyAmount(project.outstanding);
    bucket.contractValue += moneyAmount(project.finalAmount ?? project.contractValue);
    bucket.confirmedPayments += moneyAmount(project.confirmedReceived);
    byClient.set(key, bucket);
  }
  const rows = data.map((client) => {
    const totals = byClient.get(String(client._id)) || { projectCount: 0, outstanding: 0, contractValue: 0, confirmedPayments: 0 };
    const copy = {
      ...client,
      sourceLeadCode: client.sourceLeadCode || client.sourceLeadId?.leadId || '',
      convertedDate: client.sourceLeadId?.convertedDate || null,
      isConvertedFromLead: Boolean(client.sourceLeadId),
      projectCount: totals.projectCount,
      ledgerSummary: {
        contractValue: moneyAmount(totals.contractValue),
        confirmedPayments: moneyAmount(totals.confirmedPayments),
        outstanding: moneyAmount(totals.outstanding)
      }
    };
    if (!canAccessFinancial(req.user)) {
      delete copy.annualTurnover;
    }
    return copy;
  });
  return sendSuccess(res, rows, 'Clients fetched', pagination(page, limit, total));
}));

router.get('/:id', authorize('crm:clients:read'), asyncHandler(async (req, res) => {
  const client = await CrmClient.findOne({ _id: req.params.id, isDeleted: false })
    .populate('assignedTo', 'name email')
    .populate({
      path: 'sourceLeadId',
      select: 'leadId leadName companyName contactPersonName designation email phone whatsappNumber country address source requiredTechnologies businessRequirements projectDescription requirementDescription assignedTo status convertedDate convertedBy clientId',
      populate: [
        { path: 'assignedTo', select: 'name email' },
        { path: 'convertedBy', select: 'name email' }
      ]
    })
    .lean();
  if (!client) throw new AppError('Client not found', 404);
  if (!canAccessFinancial(req.user)) delete client.annualTurnover;
  const paymentFilter = { clientId: client._id, isDeleted: false };
  const invoiceFilter = { clientId: client._id, isDeleted: false };
  if (req.query.projectId) {
    paymentFilter.projectId = req.query.projectId;
    invoiceFilter.projectId = req.query.projectId;
  }
  const [contacts, documents, activities, projects, followUps, payments, invoices, ledger] = await Promise.all([
    ClientContact.find({ clientId: client._id, isDeleted: false }).sort({ isPrimary: -1, contactName: 1 }).lean(),
    ClientDocument.find({ clientId: client._id, isDeleted: false }).sort({ createdAt: -1 }).lean(),
    ClientActivity.find({ clientId: client._id }).sort({ occurredAt: -1 }).limit(100)
      .populate('actor', 'name email').lean(),
    CrmProject.find({ clientId: client._id, isDeleted: false })
      .populate('projectManager', 'name email')
      .sort({ createdAt: -1 }).lean(),
    FollowUp.find({ clientId: client._id, isDeleted: false }).sort({ nextFollowUpDate: -1 })
      .populate('assignedSalesPerson', 'name email').lean(),
    CrmPayment.find(paymentFilter)
      .populate('projectId', 'projectId projectName')
      .sort({ paymentDate: -1 }).lean(),
    CrmInvoice.find(invoiceFilter)
      .populate('projectId', 'projectId projectName')
      .sort({ invoiceDate: -1 }).lean(),
    computeClientLedger(client._id)
  ]);
  const finance = canAccessFinancial(req.user);
  const now = new Date();
  const ledgerByProject = new Map((ledger.projects || []).map((row) => [String(row.mongoId), row]));
  const dues = [];
  const projectsWithLedger = [];
  for (const project of projects) {
    const projectLedger = ledgerByProject.get(String(project._id)) || await computeProjectLedger(project);
    const overdue = project.expectedEndDate && !['COMPLETED', 'CANCELLED'].includes(project.status) && new Date(project.expectedEndDate) < now;
    const alert = dueAlertFromLedger(project, client, projectLedger, now);
    if (alert) dues.push(alert);
    const safe = finance ? project : stripFinancial(project);
    projectsWithLedger.push({
      ...safe,
      isOverdue: overdue,
      ledger: {
        contractValue: projectLedger.contractValue,
        confirmedPayments: projectLedger.confirmedPayments,
        pendingPayments: projectLedger.pendingPayments,
        creditsTotal: projectLedger.creditsTotal,
        outstanding: projectLedger.outstanding,
        overdueAmount: projectLedger.overdueAmount,
        nextPaymentDueDate: projectLedger.nextPaymentDueDate
      }
    });
  }
  const paymentRows = finance
    ? payments
    : payments.map((row) => ({
      _id: row._id,
      paymentId: row.paymentId,
      projectId: row.projectId,
      installmentNumber: row.installmentNumber,
      paymentDate: row.paymentDate,
      amount: row.amount,
      currency: row.currency,
      status: row.status
    }));
  return sendSuccess(res, {
    ...client,
    sourceLead: client.sourceLeadId || null,
    sourceLeadCode: client.sourceLeadCode || client.sourceLeadId?.leadId || '',
    convertedDate: client.sourceLeadId?.convertedDate || null,
    isConvertedFromLead: Boolean(client.sourceLeadId),
    contacts,
    documents,
    activities,
    projects: projectsWithLedger,
    followUps,
    payments: paymentRows,
    invoices: finance ? invoices : invoices.map((row) => ({
      _id: row._id, invoiceNumber: row.invoiceNumber, projectId: row.projectId,
      invoiceDate: row.invoiceDate, dueDate: row.dueDate, status: row.status,
      totalAmount: row.totalAmount, amountPaid: row.amountPaid, currency: row.currency
    })),
    dues,
    ledger,
    totals: ledger
  }, 'Client details fetched');
}));

router.post('/', authorize('crm:clients:write'), validate(clientBody), asyncHandler(async (req, res) => {
  if (!canAccessFinancial(req.user)) {
    delete req.body.annualTurnover;
    delete req.body.contractValue;
  }
  if (req.body.sourceLeadId) {
    if (!hasPermission(req.user, 'crm:leads:convert')) {
      throw new AppError('Not allowed to convert leads', 403);
    }
    try {
      const result = await convertLeadToClient(req.body.sourceLeadId, req.user, {
        ...req.body,
        createProject: req.body.createProject === true
      });
      await writeCrmAudit(req, 'CLIENT_CREATED', 'CrmClient', result.client._id, {
        clientId: result.client.clientId, sourceLeadId: req.body.sourceLeadId
      });
      res.status(201);
      return sendSuccess(res, result.client, 'Client created from lead');
    } catch (error) {
      if (error?.code === 11000) throw new AppError('Lead is already converted', 400);
      throw error;
    }
  }
  const payload = { ...req.body };
  delete payload.sourceLeadId;
  delete payload.createProject;
  delete payload.forceConvert;
  delete payload.conversionNotes;
  const client = await CrmClient.create({
    ...payload,
    clientId: await nextCrmId('crm_client', 'CLT'),
    createdBy: req.user._id,
    updatedBy: req.user._id
  });
  await ClientActivity.create({
    clientId: client._id, type: 'CLIENT_CREATED', title: 'Client created',
    description: client.clientName, actor: req.user._id
  });
  await writeCrmAudit(req, 'CLIENT_CREATED', 'CrmClient', client._id, { clientId: client.clientId });
  res.status(201);
  return sendSuccess(res, client, 'Client created');
}));

router.patch('/:id', authorize('crm:clients:write'), validate(clientBody.fork(Object.keys(clientBody.describe().keys), (schema) => schema.optional())), asyncHandler(async (req, res) => {
  const client = await CrmClient.findOne({ _id: req.params.id, isDeleted: false });
  if (!client) throw new AppError('Client not found', 404);
  if (!canAccessFinancial(req.user)) {
    delete req.body.annualTurnover;
    delete req.body.contractValue;
  }
  delete req.body.sourceLeadId;
  delete req.body.createProject;
  delete req.body.forceConvert;
  delete req.body.conversionNotes;
  Object.assign(client, req.body, { updatedBy: req.user._id });
  await client.save();
  await ClientActivity.create({
    clientId: client._id, type: 'CLIENT_UPDATED', title: 'Client updated', actor: req.user._id
  });
  await writeCrmAudit(req, 'CLIENT_UPDATED', 'CrmClient', client._id, req.body);
  return sendSuccess(res, client, 'Client updated');
}));

router.post('/:id/contacts', authorize('crm:clients:write'), validate(contactBody), asyncHandler(async (req, res) => {
  const client = await CrmClient.findOne({ _id: req.params.id, isDeleted: false });
  if (!client) throw new AppError('Client not found', 404);
  if (req.body.isPrimary) {
    await ClientContact.updateMany({ clientId: client._id }, { $set: { isPrimary: false } });
  }
  const contact = await ClientContact.create({ ...req.body, clientId: client._id, createdBy: req.user._id });
  await ClientActivity.create({
    clientId: client._id, type: 'CONTACT_ADDED', title: 'Contact added',
    description: contact.contactName, actor: req.user._id
  });
  res.status(201);
  return sendSuccess(res, contact, 'Contact added');
}));

router.patch('/:id/contacts/:contactId', authorize('crm:clients:write'), validate(contactBody.fork(Object.keys(contactBody.describe().keys), (s) => s.optional())), asyncHandler(async (req, res) => {
  const contact = await ClientContact.findOne({ _id: req.params.contactId, clientId: req.params.id, isDeleted: false });
  if (!contact) throw new AppError('Contact not found', 404);
  if (req.body.isPrimary) {
    await ClientContact.updateMany({ clientId: req.params.id, _id: { $ne: contact._id } }, { $set: { isPrimary: false } });
  }
  Object.assign(contact, req.body);
  await contact.save();
  return sendSuccess(res, contact, 'Contact updated');
}));

router.delete('/:id/contacts/:contactId', authorize('crm:clients:write'), asyncHandler(async (req, res) => {
  const contact = await ClientContact.findOneAndUpdate(
    { _id: req.params.contactId, clientId: req.params.id, isDeleted: false },
    { $set: { isDeleted: true } },
    { new: true }
  );
  if (!contact) throw new AppError('Contact not found', 404);
  return sendSuccess(res, contact, 'Contact removed');
}));

router.post('/:id/documents', authorize('crm:clients:write'), crmUpload.single('file'), asyncHandler(async (req, res) => {
  const client = await CrmClient.findOne({ _id: req.params.id, isDeleted: false });
  if (!client) throw new AppError('Client not found', 404);
  let stored = {};
  if (req.file) stored = await storeCrmFile(req.file, 'CrmClient', client._id);
  const document = await ClientDocument.create({
    documentName: req.body.documentName || stored.name || 'Document',
    documentType: DOCUMENT_TYPES.includes(req.body.documentType) ? req.body.documentType : 'OTHER',
    externalUrl: req.body.externalUrl || '',
    version: req.body.version || '1',
    expiryDate: req.body.expiryDate || null,
    clientId: client._id,
    storageProvider: stored.storageProvider || (req.body.externalUrl ? 'external' : 'local'),
    storageKey: stored.storageKey,
    mimeType: stored.mimeType,
    size: stored.size,
    uploadedBy: req.user._id
  });
  await ClientActivity.create({
    clientId: client._id, type: 'DOCUMENT_UPLOADED', title: 'Document uploaded',
    description: document.documentName, actor: req.user._id
  });
  await writeCrmAudit(req, 'DOCUMENT_UPLOADED', 'ClientDocument', document._id, { clientId: client._id });
  res.status(201);
  return sendSuccess(res, document, 'Document saved');
}));

router.post('/:id/follow-ups', authorize('crm:clients:write'), validate(Joi.object({
  nextFollowUpDate: Joi.date().iso().required(),
  nextFollowUpTime: Joi.string().trim().max(20).allow(''),
  followUpType: Joi.string().valid(...FOLLOW_UP_TYPES),
  followUpNote: Joi.string().trim().max(4000).allow(''),
  projectId: Joi.string().hex().length(24).allow('', null),
  assignedSalesPerson: Joi.string().hex().length(24).allow('', null),
  priority: Joi.string().valid(...LEAD_PRIORITIES),
  reminderPreference: Joi.string().trim().max(80).allow('')
})), asyncHandler(async (req, res) => {
  const client = await CrmClient.findOne({ _id: req.params.id, isDeleted: false });
  if (!client) throw new AppError('Client not found', 404);
  const timezone = 'Asia/Kolkata';
  const reminderPreference = req.body.reminderPreference || '1_DAY_BEFORE';
  const followUp = await FollowUp.create({
    ...req.body,
    clientId: client._id,
    leadId: client.sourceLeadId || null,
    target: 'PAYMENT',
    timezone,
    reminderPreference,
    reminderDateTime: computeReminderDateTime({
      nextFollowUpDate: req.body.nextFollowUpDate,
      nextFollowUpTime: req.body.nextFollowUpTime,
      timezone,
      reminderPreference
    }),
    assignedSalesPerson: req.body.assignedSalesPerson || client.assignedTo || req.user._id,
    createdBy: req.user._id
  });
  await ClientActivity.create({
    clientId: client._id, type: 'FOLLOW_UP_SCHEDULED', title: 'Payment follow-up scheduled',
    description: req.body.followUpNote || '', actor: req.user._id
  });
  res.status(201);
  return sendSuccess(res, followUp, 'Follow-up scheduled');
}));

router.post('/:id/activities', authorize('crm:clients:write'), validate(Joi.object({
  type: Joi.string().trim().max(80).default('NOTE'),
  title: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().max(4000).allow('')
})), asyncHandler(async (req, res) => {
  const client = await CrmClient.findOne({ _id: req.params.id, isDeleted: false });
  if (!client) throw new AppError('Client not found', 404);
  const activity = await ClientActivity.create({
    clientId: client._id, ...req.body, actor: req.user._id
  });
  res.status(201);
  return sendSuccess(res, activity, 'Activity added');
}));

export default router;
