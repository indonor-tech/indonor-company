import express from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AppError } from '../../../utils/errors.js';
import { pagination, sendSuccess } from '../../../utils/response.js';
import { COMPANY_TYPES, DOCUMENT_TYPES } from '../constants.js';
import {
  ClientActivity, ClientContact, ClientDocument, CrmClient, CrmProject
} from '../crm.models.js';
import {
  escapeRegex, isSuperAdmin, nextCrmId, pageParams, stripFinancial, writeCrmAudit
} from '../crm.helpers.js';
import { rejectViewAdminMutations, requireCrmPage } from '../middleware/crmAccess.js';
import { normalizeRole } from '../../auth/roles.js';

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
  assignedTo: Joi.string().hex().length(24).allow(null, '')
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
      { clientId: { $regex: q, $options: 'i' } }
    ];
  }
  const [data, total] = await Promise.all([
    CrmClient.find(filter).populate('assignedTo', 'name email').sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    CrmClient.countDocuments(filter)
  ]);
  const rows = data.map((client) => {
    if (isSuperAdmin(req.user)) return client;
    const copy = { ...client };
    delete copy.annualTurnover;
    return copy;
  });
  return sendSuccess(res, rows, 'Clients fetched', pagination(page, limit, total));
}));

router.get('/:id', authorize('crm:clients:read'), asyncHandler(async (req, res) => {
  const client = await CrmClient.findOne({ _id: req.params.id, isDeleted: false })
    .populate('assignedTo', 'name email')
    .populate('sourceLeadId', 'leadId leadName status')
    .lean();
  if (!client) throw new AppError('Client not found', 404);
  if (!isSuperAdmin(req.user)) delete client.annualTurnover;
  const [contacts, documents, activities, projects] = await Promise.all([
    ClientContact.find({ clientId: client._id, isDeleted: false }).sort({ isPrimary: -1, contactName: 1 }).lean(),
    ClientDocument.find({ clientId: client._id, isDeleted: false }).sort({ createdAt: -1 }).lean(),
    ClientActivity.find({ clientId: client._id }).sort({ occurredAt: -1 }).limit(100)
      .populate('actor', 'name email').lean(),
    CrmProject.find({ clientId: client._id, isDeleted: false }).sort({ createdAt: -1 }).lean()
  ]);
  const safeProjects = projects.map((project) => (isSuperAdmin(req.user) ? project : stripFinancial(project)));
  return sendSuccess(res, { ...client, contacts, documents, activities, projects: safeProjects }, 'Client details fetched');
}));

router.post('/', authorize('crm:clients:write'), validate(clientBody), asyncHandler(async (req, res) => {
  if (!isSuperAdmin(req.user)) delete req.body.annualTurnover;
  const client = await CrmClient.create({
    ...req.body,
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
  if (!isSuperAdmin(req.user)) delete req.body.annualTurnover;
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

router.post('/:id/documents', authorize('crm:clients:write'), validate(Joi.object({
  documentName: Joi.string().trim().min(1).max(200).required(),
  documentType: Joi.string().valid(...DOCUMENT_TYPES),
  externalUrl: Joi.string().trim().uri().allow(''),
  version: Joi.string().trim().max(40).allow(''),
  expiryDate: Joi.date().iso().allow(null)
})), asyncHandler(async (req, res) => {
  const client = await CrmClient.findOne({ _id: req.params.id, isDeleted: false });
  if (!client) throw new AppError('Client not found', 404);
  const document = await ClientDocument.create({
    ...req.body,
    clientId: client._id,
    storageProvider: req.body.externalUrl ? 'external' : 'local',
    uploadedBy: req.user._id
  });
  await ClientActivity.create({
    clientId: client._id, type: 'DOCUMENT_UPLOADED', title: 'Document uploaded',
    description: document.documentName, actor: req.user._id
  });
  await writeCrmAudit(req, 'DOCUMENT_UPLOADED', 'ClientDocument', document._id, { clientId: client._id });
  res.status(201);
  return sendSuccess(res, document, 'Document metadata saved');
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
